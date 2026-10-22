/**
 * Posizioni per l'Allenatore: da una partita simulata si prende un momento in cui la scelta conta e
 * si calcola con quale percentuale vince ogni mossa candidata.
 *
 * Per ogni mossa: N continuazioni fino alla fine della partita, giocate dal giocatore base per tutti
 * e due, con le carte sconosciute rimescolate a ogni continuazione (determinizzazione). Gira in Node
 * (src/tools/trainer-positions.ts) e nel browser (web/src/sim.worker.ts).
 */
import { apply, describe, G, GameOver, Match, playOn, slot } from "../engine/game.js";
import type { Action, CardDef, Decision, Gen, Mon } from "../engine/types.js";
import { BasicAgent } from "./basic.js";
import { MonteCarloAgent } from "./montecarlo.js";

export interface MonView {
  name: string; hp: number; maxHp: number; type: string; stage: string; weak: string | null; retreat: number;
  energies: string[]; attacks: { name: string; cost: string[]; damage: number }[]; tools: string[];
}
export interface DiscardView {
  total: number;
  /** Carte negli scarti raggruppate per nome, le più numerose prima. */
  cards: { name: string; count: number; kind: string }[];
  /** Pokémon con l'Abilità Hide 'n' Sneak negli scarti (contano per Vengeful Anchor, Matcha Spin, Spiritual End). */
  hideNSneak: number;
}
export interface SideView { active: MonView | null; bench: MonView[]; prizes: number; deck: number; handCount: number; discard: DiscardView }
export interface PositionView {
  turn: number; me: SideView; opp: SideView; hand: string[]; stadium: string | null; energyAttached: boolean; supporterPlayed: boolean;
}
export interface TrainerPosition { vs: string; position: PositionView; options: { label: string; wr: number }[]; rollouts: number }

const policy = new BasicAgent();
const mc = new MonteCarloAgent();

function drive(g: G, it: Gen<unknown>): unknown {
  let r = it.next();
  for (let k = 0; !r.done && k < 50000; k++) r = it.next(policy.decide(g, r.value as Decision));
  return r.value;
}

/** Percentuale di vittoria del giocatore `me` dopo l'azione `a`, su continuazioni fino alla fine. */
export function winRate(g: G, me: number, a: Action, n: number, seed: number): number {
  let w = 0;
  for (let k = 0; k < n; k++) {
    const copy = mc.determinize(g, me, seed + k * 7919);
    try {
      const ended = drive(copy, apply(copy, a)) as boolean;
      drive(copy, playOn(copy, ended, copy.s.turn + 200));
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    if (copy.s.winner === me) w += 1;
    else if (copy.s.winner === -1) w += 0.5;
  }
  return w / n;
}

const PRIORITY: Record<string, number> = { attack: 0, trainer: 1, retreat: 2, ability: 3, evolve: 4, attach: 5, bench: 6, stadium: 7, end: 8 };

/** Etichetta leggibile: i posti in panchina diventano nomi di Pokémon. */
export function label(g: G, me: number, a: Action): string {
  const p = g.p(me);
  const name = (t: number) => g.top(slot(p, t)).name;
  switch (a.kind) {
    case "attack": return `Attacca con ${(a.from !== undefined ? g.top(p.bench[a.from]) : g.top(p.active!)).attacks![a.index].name}`;
    case "retreat": return `Ritirata, entra ${name(a.target)}`;
    case "attach": return `${g.name(a.card)} su ${name(a.target)}`;
    case "evolve": return `Evolvi ${name(a.target)} in ${g.name(a.card)}`;
    case "bench": return `Metti in panchina ${g.name(a.card)}`;
    case "trainer": return `Gioca ${g.name(a.card)}`;
    case "ability": return `Usa ${g.top(slot(p, a.target)).abilities![a.index].name} (${name(a.target)})`;
    case "end": return "Passa il turno";
    default: return describe(g, a);
  }
}

const stage = (d: CardDef) => (d.sub === "basic" ? "Base" : d.sub === "stage1" ? "Fase 1" : d.sub === "stage2" ? "Fase 2" : "");
const monView = (g: G, m: Mon): MonView => ({
  name: g.top(m).name, hp: g.hpLeft(m), maxHp: g.top(m).hp ?? 0, type: g.top(m).type ?? "C", stage: stage(g.top(m)),
  weak: g.top(m).weakness ?? null, retreat: g.top(m).retreat ?? 0,
  energies: m.energies.map(e => g.def(e).provides ?? "C"),
  attacks: (g.top(m).attacks ?? []).map(x => ({ name: x.name, cost: x.cost, damage: x.damage })),
  tools: m.tools.map(t => g.name(t)),
});

function discardView(g: G, i: number): DiscardView {
  const p = g.p(i);
  const by = new Map<string, { name: string; count: number; kind: string }>();
  let hns = 0;
  for (const c of p.discard) {
    const d = g.def(c);
    if ((d.tags ?? []).includes("hide_n_sneak")) hns++;
    const e = by.get(d.name) ?? { name: d.name, count: 0, kind: d.kind === "pokemon" ? "Pokémon" : d.kind === "energy" ? "Energia" : d.sub === "supporter" ? "Supporter" : "Allenatore" };
    e.count++;
    by.set(d.name, e);
  }
  return { total: p.discard.length, cards: [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), hideNSneak: hns };
}

export function snapshot(g: G, me: number): PositionView {
  const side = (i: number): SideView => {
    const p = g.p(i);
    return {
      active: p.active ? monView(g, p.active) : null,
      bench: p.bench.map(m => monView(g, m)),
      prizes: p.prizes.length, deck: p.deck.length, handCount: p.hand.length, discard: discardView(g, i),
    };
  };
  return {
    turn: g.s.turn, me: side(me), opp: side(1 - me), hand: g.p(me).hand.map(c => g.name(c)),
    stadium: g.s.stadium !== null ? g.name(g.s.stadium) : null, energyAttached: g.p(me).energyAttached, supporterPlayed: g.p(me).supporterPlayed,
  };
}

/** Fino a 4 mosse diverse: quella del giocatore base, poi attacchi, Allenatori, ritirate, Abilità. */
export function candidates(g: G, d: Decision): { label: string; index: number }[] {
  const acts = d.options as Action[];
  const chosen = policy.decide(g, d)[0];
  const byLabel = new Map<string, number>();
  acts.forEach((a, i) => { const l = label(g, d.player, a); if (!byLabel.has(l)) byLabel.set(l, i); });
  return [...byLabel.entries()]
    .sort((x, y) => (x[1] === chosen ? -1 : y[1] === chosen ? 1 : (PRIORITY[acts[x[1]].kind] ?? 9) - (PRIORITY[acts[y[1]].kind] ?? 9)))
    .slice(0, 4)
    .map(([l, index]) => ({ label: l, index }));
}

/**
 * Cerca una posizione interessante in una partita della lista `mine` contro `opp`:
 * una decisione dal 3° turno in poi con almeno 3 mosse diverse, dove la migliore vince
 * almeno `minSpread` più della peggiore. Prova più partite se serve.
 */
export function findPosition(
  mine: CardDef[], opp: CardDef[], vs: string, seed: number,
  o: { rollouts?: number; minSpread?: number; maxGames?: number; onProgress?: (msg: string) => void } = {},
): TrainerPosition | null {
  const rollouts = o.rollouts ?? 40, minSpread = o.minSpread ?? 0.08, maxGames = o.maxGames ?? 6;
  let pick = 0;
  for (let game = 0; game < maxGames; game++) {
    const m = new Match([mine, opp], seed + game, { first: (seed + game) % 2 });
    let tried = 0;
    while (m.pending) {
      const d = m.pending, g = m.g;
      if (d.player === 0 && d.kind === "action" && g.s.turn >= 3 && tried < 3 && pick++ % 3 === 0) {
        const cands = candidates(g, d);
        if (cands.length >= 3) {
          tried++;
          o.onProgress?.(`partita ${game + 1}, turno ${g.s.turn}: provo ${cands.length} mosse`);
          const acts = d.options as Action[];
          const opts = cands.map(c => ({ label: c.label, wr: winRate(g, 0, acts[c.index], rollouts, seed * 1000 + game) }));
          const best = Math.max(...opts.map(x => x.wr)), worst = Math.min(...opts.map(x => x.wr));
          if (best - worst >= minSpread) {
            return { vs, position: snapshot(g, 0), options: opts.map(x => ({ ...x, wr: Math.round(x.wr * 100) / 100 })), rollouts };
          }
        }
      }
      m.answer(policy.decide(g, d));
    }
  }
  return null;
}
