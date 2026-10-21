/**
 * Effetti di base da comporre per descrivere le carte.
 * Ogni effetto che richiede una scelta è un generatore: si usa con `yield*`.
 */
import { canHeal, choose, chooseOne, draw as drawCards, G, newMon, prevented, rand, shuffle, switchActive } from "../engine/game.js";
import type { Gen, Mon } from "../engine/types.js";

export type Filter = (g: G, c: number) => boolean;

// --- filtri -----------------------------------------------------------------

export const any: Filter = () => true;
export const isPokemon: Filter = (g, c) => g.def(c).kind === "pokemon";
export const isBasicPokemon: Filter = (g, c) => g.def(c).kind === "pokemon" && g.def(c).sub === "basic";
export const isEnergy: Filter = (g, c) => g.def(c).kind === "energy";
export const isBasicEnergy: Filter = (g, c) => g.def(c).sub === "basic_energy";
export const isSupporter: Filter = (g, c) => g.def(c).sub === "supporter";
export const named = (...names: string[]): Filter => (g, c) => names.includes(g.def(c).name);
export const hasTag = (tag: string): Filter => (g, c) => (g.def(c).tags ?? []).includes(tag);
export const hpAtMost = (n: number): Filter => (g, c) => g.def(c).kind === "pokemon" && (g.def(c).hp ?? 0) <= n;
export const and = (...fs: Filter[]): Filter => (g, c) => fs.every(f => f(g, c));
export const or = (...fs: Filter[]): Filter => (g, c) => fs.some(f => f(g, c));

// --- mazzo, mano, scarti ----------------------------------------------------

export function draw(g: G, me: number, n: number): void {
  drawCards(g, me, n);
}

export function drawUntil(g: G, me: number, n: number): void {
  drawCards(g, me, Math.max(0, n - g.p(me).hand.length));
}

export function shuffleHandIntoDeck(g: G, me: number): void {
  const p = g.p(me);
  p.deck.push(...p.hand);
  p.hand = [];
  shuffle(g.s, p.deck);
}

export function shuffleDeck(g: G, me: number): void {
  shuffle(g.s, g.p(me).deck);
}

export { choose, chooseOne, prevented };

export function discardHand(g: G, me: number): void {
  const p = g.p(me);
  p.discard.push(...p.hand);
  p.hand = [];
}

export type Dest = "hand" | "bench" | "discard";

/** Cerca nel mazzo fino a `k` carte che rispettano il filtro. */
export function* searchDeck(g: G, me: number, f: Filter, k = 1, dest: Dest = "hand", min = 0, kind = "search"): Gen<number[]> {
  const p = g.p(me);
  if (dest === "bench") k = Math.min(k, 5 - p.bench.length);
  const pool = p.deck.filter(c => f(g, c));
  const picks = yield* choose(g, me, kind, pool, min, k);
  for (const c of picks) {
    p.deck.splice(p.deck.indexOf(c), 1);
    if (dest === "hand") p.hand.push(c);
    else if (dest === "bench") p.bench.push(newMon(c, g.s.turn));
    else p.discard.push(c);
  }
  shuffle(g.s, p.deck);
  return picks;
}

/** Scarta dal mazzo fino a `k` carte a scelta (es. Brilliant Blender). */
export function* mill(g: G, me: number, k: number, f: Filter = any, kind = "mill"): Gen<number[]> {
  return yield* searchDeck(g, me, f, k, "discard", 0, kind);
}

export function* discardFromHand(g: G, me: number, k: number, f: Filter = any, min = k, kind = "discard"): Gen<number[]> {
  const p = g.p(me);
  const picks = yield* choose(g, me, kind, p.hand.filter(c => f(g, c)), min, k);
  for (const c of picks) {
    p.hand.splice(p.hand.indexOf(c), 1);
    p.discard.push(c);
  }
  return picks;
}

/** Riprende carte dagli scarti, in mano o nel mazzo. */
export function* recover(g: G, me: number, f: Filter, k = 1, to: "hand" | "deck" = "hand", kind = "recover"): Gen<number[]> {
  const p = g.p(me);
  const picks = yield* choose(g, me, kind, p.discard.filter(c => f(g, c)), 0, k);
  for (const c of picks) {
    p.discard.splice(p.discard.indexOf(c), 1);
    (to === "hand" ? p.hand : p.deck).push(c);
  }
  if (to === "deck") shuffle(g.s, p.deck);
  return picks;
}

export function countDiscard(g: G, me: number, f: Filter): number {
  return g.p(me).discard.filter(c => f(g, c)).length;
}

// --- campo ------------------------------------------------------------------

export function* switchOwn(g: G, me: number, kind = "switch"): Gen<boolean> {
  const p = g.p(me);
  if (!p.bench.length) return false;
  switchActive(p, yield* chooseOne(g, me, kind, p.bench.map((_, i) => i)));
  return true;
}

/** Sposta in attivo un Pokémon della panchina avversaria, scelto da me. */
export function* gust(g: G, me: number, kind = "gust"): Gen<boolean> {
  const o = g.p(1 - me);
  if (!o.bench.length) return false;
  switchActive(o, yield* chooseOne(g, me, kind, o.bench.map((_, i) => i)));
  return true;
}

/**
 * Piazza n segnalini (10 danni ciascuno), uno alla volta, sui Pokémon scelti.
 * I segnalini sono un effetto: i Pokémon protetti (es. Hide 'n' Sneak) non si possono scegliere.
 */
export function* placeCounters(g: G, me: number, n: number, side: "opp" | "own" = "opp", kind = "counters"): Gen {
  const who = side === "opp" ? 1 - me : me;
  for (let k = 0; k < n; k++) {
    const mons = g.inPlay(who).filter(m => !prevented(g, m, me));
    if (!mons.length) return;
    (yield* chooseOne(g, me, kind, mons)).damage += 10;
  }
}

export function countersEach(g: G, me: number, n: number, side: "opp" | "own" = "opp", skip: (m: Mon) => boolean = () => false): void {
  for (const m of g.inPlay(side === "opp" ? 1 - me : me)) if (!skip(m) && !prevented(g, m, me)) m.damage += 10 * n;
}

export function heal(g: G, m: Mon, amount: number): void {
  if (canHeal(g, m)) m.damage = Math.max(0, m.damage - amount);
}

export function* attachFromDiscard(g: G, me: number, f: Filter, k = 1, kind = "attach_discard"): Gen {
  const p = g.p(me);
  for (const c of yield* choose(g, me, kind, p.discard.filter(x => f(g, x)), 0, k)) {
    const t = yield* chooseOne(g, me, kind + "_target", g.inPlay(me));
    p.discard.splice(p.discard.indexOf(c), 1);
    t.energies.push(c);
  }
}

export function discardEnergy(g: G, m: Mon, owner: number, n = 1): void {
  for (const e of m.energies.splice(Math.max(0, m.energies.length - n))) g.p(owner).discard.push(e);
}

/**
 * Guarda le prime n carte del mazzo e ne sceglie da min a k che rispettano il filtro.
 * Le scelte vanno in mano; le altre vanno negli scarti, in fondo al mazzo o vengono rimescolate.
 */
export function* lookTop(
  g: G, me: number, n: number, f: Filter, k: number, min = 0,
  rest: "discard" | "shuffle" | "bottom" = "shuffle", kind = "look_top",
): Gen<number[]> {
  const p = g.p(me);
  const top = p.deck.splice(Math.max(0, p.deck.length - n)).reverse();   // la prima è la cima
  const picks = yield* choose(g, me, kind, top.filter(c => f(g, c)), min, k);
  p.hand.push(...picks);
  const others = top.filter(c => !picks.includes(c));
  if (rest === "discard") p.discard.push(...others);
  else if (rest === "bottom") p.deck.unshift(...others);
  else { p.deck.push(...others); shuffle(g.s, p.deck); }
  return picks;
}

/** Nessuna Regola: niente Pokémon ex, Mega, V e simili. */
export const noRuleBox: Filter = (g, c) => {
  const t = g.def(c).tags ?? [];
  return g.def(c).kind === "pokemon" && !t.includes("ex") && !t.includes("mega");
};

export function hasRuleBox(g: G, m: Mon): boolean {
  const t = g.top(m).tags ?? [];
  return t.includes("ex") || t.includes("mega");
}

export const ofType = (t: string): Filter => (g, c) => g.def(c).type === t;

export function flip(g: G): boolean {
  return rand(g.s) < 0.5;
}
