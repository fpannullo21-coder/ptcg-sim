/**
 * Simulazioni nel browser, in un thread a parte:
 * - "sim": le liste contro gli avversari, giocatore base per entrambi, primo giocatore alternato e
 *   semi comuni tra le liste (per confrontare varianti);
 * - "position": una nuova posizione per l'Allenatore, con la percentuale di vittoria di ogni mossa;
 * - "suggest": varianti candidate contro un avversario, a eliminazione: tutte con poche partite,
 *   le migliori con altre partite, sempre con gli stessi semi della lista di partenza.
 */
import { CardDB } from "../../src/data/carddb";
import { parseDeck } from "../../src/data/decklist";
import { Registry } from "../../src/cards/registry";
import { IMPLS } from "../../src/cards/impl/index";
import { playGame } from "../../src/engine/game";
import { BasicAgent } from "../../src/ai/basic";
import { findPosition, type TrainerPosition } from "../../src/ai/trainer";

export interface PositionRequest {
  type: "position";
  mine: string;
  opp: { name: string; text: string };
  seed: number;
  rollouts: number;
  cardsUrl: string;
}
export interface SuggestRequest {
  type: "suggest";
  base: string;
  swaps: { id: string; text: string }[];
  opp: { name: string; text: string };
  first: number;   // partite per variante nel primo giro
  second: number;  // partite in più per le migliori
  keep: number;    // quante varianti passano al secondo giro
  seed: number;
  cardsUrl: string;
}
export interface SuggestItem { id: string; games: number; wr: number; baseWr: number; delta: number; se: number }
export interface SimRequest {
  type?: "sim";
  lists: { id: string; text: string }[];
  opponents: { name: string; text: string }[];
  games: number;
  seed: number;
  /** Indirizzo completo dei dati delle carte (il worker sta in un'altra cartella della pagina). */
  cardsUrl: string;
}
export type SimMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; id: string; vs: string; wins: number; games: number }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "status"; text: string }
  | { type: "position"; position: TrainerPosition | null }
  | { type: "suggest"; base: { wr: number; games: number }; items: SuggestItem[] };

let reg: Registry | null = null;

/** 1 vittoria, 0,5 pareggio o partita bloccata da un effetto non gestito, 0 sconfitta. */
function play(a: ReturnType<Registry["deck"]>, b: ReturnType<Registry["deck"]>, seed: number): number {
  try {
    const w = playGame([a, b], [new BasicAgent(), new BasicAgent()], seed, { first: seed % 2 }).g.s.winner;
    return w === 0 ? 1 : w === -1 ? 0.5 : 0;
  } catch {
    return 0.5;
  }
}

self.onmessage = async (ev: MessageEvent<SimRequest | PositionRequest | SuggestRequest>) => {
  const post = (m: SimMessage) => (self as unknown as Worker).postMessage(m);
  try {
    if (!reg) {
      const r = await fetch(ev.data.cardsUrl);
      if (!r.ok) throw new Error(`dati delle carte: ${r.status}`);
      reg = new Registry(new CardDB(await r.json()), IMPLS);
    }
    if (ev.data.type === "suggest") {
      const q = ev.data;
      const opp = reg.deck(parseDeck(q.opp.text, reg.db, q.opp.name));
      const base = reg.deck(parseDeck(q.base, reg.db, "base"));
      const cands = q.swaps.map(x => ({ id: x.id, deck: reg!.deck(parseDeck(x.text, reg!.db, x.id)), res: [] as number[] }));
      const baseRes: number[] = [];
      const total = (cands.length + 1) * q.first + (Math.min(q.keep, cands.length) + 1) * q.second;
      let done = 0;
      const tick = () => { done++; if (done % 4 === 0) post({ type: "progress", done, total }); };
      const round = (from: number, to: number, list: typeof cands) => {
        for (let k = from; k < to; k++) { baseRes.push(play(base, opp, q.seed + k)); tick(); }
        for (const c of list) for (let k = from; k < to; k++) { c.res.push(play(c.deck, opp, q.seed + k)); tick(); }
      };
      round(0, q.first, cands);
      const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / Math.max(1, x.length);
      const top = [...cands].sort((a, b) => mean(b.res) - mean(a.res)).slice(0, q.keep);
      round(q.first, q.first + q.second, top);
      const items: SuggestItem[] = cands.map(c => {
        const n = c.res.length, d = c.res.map((v, k) => v - baseRes[k]);
        const md = mean(d), sd = Math.sqrt(d.reduce((s, v) => s + (v - md) ** 2, 0) / Math.max(1, n - 1));
        return { id: c.id, games: n, wr: mean(c.res), baseWr: mean(baseRes.slice(0, n)), delta: md, se: sd / Math.sqrt(Math.max(1, n)) };
      }).sort((a, b) => b.games - a.games || b.delta - a.delta);
      post({ type: "suggest", base: { wr: mean(baseRes), games: baseRes.length }, items });
      return;
    }
    if (ev.data.type === "position") {
      const q = ev.data;
      const mine = reg.deck(parseDeck(q.mine, reg.db, "mine"));
      const opp = reg.deck(parseDeck(q.opp.text, reg.db, q.opp.name));
      const position = findPosition(mine, opp, q.opp.name, q.seed, { rollouts: q.rollouts, maxGames: 8, onProgress: text => post({ type: "status", text }) });
      post({ type: "position", position });
      return;
    }
    const { lists, opponents, games, seed } = ev.data;
    const total = lists.length * opponents.length * games;
    let done = 0;
    const decks = lists.map(l => ({ id: l.id, cards: reg!.deck(parseDeck(l.text, reg!.db, l.id)) }));
    for (let o = 0; o < opponents.length; o++) {
      const opp = reg.deck(parseDeck(opponents[o].text, reg.db, opponents[o].name));
      for (const d of decks) {
        let wins = 0;
        for (let k = 0; k < games; k++) {
          const s = seed + o * 1000 + k;
          try {
            const m = playGame([d.cards, opp], [new BasicAgent(), new BasicAgent()], s, { first: k % 2 });
            const w = m.g.s.winner;
            wins += w === 0 ? 1 : w === -1 ? 0.5 : 0;
          } catch {
            wins += 0.5; // una partita che si blocca per un effetto non gestito vale come pareggio
          }
          done++;
          if (done % 2 === 0 || done === total) post({ type: "progress", done, total });
        }
        post({ type: "result", id: d.id, vs: opponents[o].name, wins, games });
      }
    }
    post({ type: "done" });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
