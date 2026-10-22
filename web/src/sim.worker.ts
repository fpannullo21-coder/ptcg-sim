/**
 * Simulazioni nel browser, in un thread a parte: le liste contro gli avversari, giocatore base
 * per entrambi, primo giocatore alternato e semi comuni tra le liste (per confrontare varianti).
 */
import { CardDB } from "../../src/data/carddb";
import { parseDeck } from "../../src/data/decklist";
import { Registry } from "../../src/cards/registry";
import { IMPLS } from "../../src/cards/impl/index";
import { playGame } from "../../src/engine/game";
import { BasicAgent } from "../../src/ai/basic";

export interface SimRequest {
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
  | { type: "error"; message: string };

let reg: Registry | null = null;

self.onmessage = async (ev: MessageEvent<SimRequest>) => {
  const post = (m: SimMessage) => (self as unknown as Worker).postMessage(m);
  try {
    if (!reg) {
      const r = await fetch(ev.data.cardsUrl);
      if (!r.ok) throw new Error(`dati delle carte: ${r.status}`);
      reg = new Registry(new CardDB(await r.json()), IMPLS);
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
