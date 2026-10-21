/**
 * Effetti di base da comporre per descrivere le carte.
 * Ogni effetto che richiede una scelta è un generatore: si usa con `yield*`.
 */
import { abilitiesOff, applyDamage, benchMax, canHeal, evolveFromHand, maxHp, provided, choose, chooseOne, draw as drawCards, G, prevented, putOnBench, rand, shuffle, switchActive } from "../engine/game.js";
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
  if (dest === "bench") k = Math.min(k, benchMax(g, me) - p.bench.length);
  const pool = p.deck.filter(c => f(g, c));
  const picks = yield* choose(g, me, kind, pool, min, k);
  for (const c of picks) {
    p.deck.splice(p.deck.indexOf(c), 1);
    if (dest === "hand") p.hand.push(c);
    else if (dest === "bench") putOnBench(g, me, c);
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
export function* placeCounters(
  g: G, me: number, n: number, side: "opp" | "own" = "opp", kind = "counters", only: (m: Mon) => boolean = () => true,
): Gen {
  const who = side === "opp" ? 1 - me : me;
  for (let k = 0; k < n; k++) {
    const mons = g.inPlay(who).filter(m => only(m) && !prevented(g, m, me) && !(who !== me && benchCountersBlocked(g, m, me)));
    if (!mons.length) return;
    (yield* chooseOne(g, me, kind, mons)).damage += 10;
  }
}

export function countersEach(g: G, me: number, n: number, side: "opp" | "own" = "opp", skip: (m: Mon) => boolean = () => false): void {
  for (const m of g.inPlay(side === "opp" ? 1 - me : me)) {
    if (!skip(m) && !prevented(g, m, me) && !(side === "opp" && benchCountersBlocked(g, m, me))) m.damage += 10 * n;
  }
}

export function heal(g: G, m: Mon, amount: number): void {
  if (canHeal(g, m)) m.damage = Math.max(0, m.damage - amount);
}

export function* attachFromDiscard(g: G, me: number, f: Filter, k = 1, kind = "attach_discard", min = 0, target: (m: Mon) => boolean = () => true): Gen {
  const p = g.p(me);
  if (!g.inPlay(me).some(target)) return;
  for (const c of yield* choose(g, me, kind, p.discard.filter(x => f(g, x)), min, k)) {
    const t = yield* chooseOne(g, me, kind + "_target", g.inPlay(me).filter(target));
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

// --- utilità ricorrenti per le carte del meta ---------------------------------

/** Vero se un Pokémon del giocatore è andato KO durante l'ultimo turno dell'avversario. */
export function koLastTurn(g: G, me: number): boolean {
  return g.p(me).flags.ko_turn === g.s.turn - 1;
}

/** Ogni giocatore rimescola la mano nel mazzo; poi pescano rispettivamente a e b carte. */
export function shuffleBoth(g: G, me: number, mine: number, theirs: number): void {
  shuffleHandIntoDeck(g, me);
  shuffleHandIntoDeck(g, 1 - me);
  draw(g, me, mine);
  draw(g, 1 - me, theirs);
}

/** Fa danno a un Pokémon scelto dell'avversario (debolezza e resistenza solo se è l'attivo). */
export function damageTo(g: G, me: number, target: Mon, dmg: number): void {
  const att = g.p(me).active!;
  applyDamage(g, att, target, dmg, target === g.p(1 - me).active);
}

/** Effetto "durante il prossimo turno dell'avversario": attiva il turnPassive della carta `card`. */
export function untilOpponentsNextTurn(g: G, me: number, card: number): void {
  g.s.turnEffects.push({ card, owner: me, until: g.s.turn + 1 });
}

export function topCard(m: Mon): number {
  return m.stack[m.stack.length - 1];
}

/** Evoluzione da effetto (es. Rare Candy): mette `card` dalla mano sopra il Pokémon. */
export function* evolveWith(g: G, me: number, m: Mon, card: number): Gen {
  yield* evolveFromHand(g, me, m, card);
}

/** Condizione speciale da un attacco o un'Abilità: niente se il bersaglio è protetto o Festival Grounds lo impedisce. */
export function inflict(g: G, me: number, m: Mon, cond: string): void {
  if (prevented(g, m, me)) return;
  if (g.s.stadium !== null && (g.def(g.s.stadium).tags ?? []).includes("no_conditions_with_energy") && m.energies.length) return;
  if (cond === "asleep" || cond === "paralyzed" || cond === "confused") m.conditions = m.conditions.filter(c => !["asleep", "paralyzed", "confused"].includes(c));
  if (!m.conditions.includes(cond)) m.conditions.push(cond);
}

/** Battle Cage: niente segnalini sulla panchina da effetti di attacchi e Abilità avversari. */
export function benchCountersBlocked(g: G, m: Mon, me: number): boolean {
  return g.s.stadium !== null && (g.def(g.s.stadium).tags ?? []).includes("battle_cage")
    && g.p(1 - me).bench.includes(m);
}

export function providedCount(g: G, m: Mon, type: string): number {
  return m.energies.flatMap(e => provided(g, e)).filter(t => t === type || t === "*").length;
}

/** Nome della Base da cui discende uno Stadio 2 (passando per lo Stadio 1 nel registro della partita). */
export function basicOf(g: G, stage2: number): string | undefined {
  const s1 = g.def(stage2).evolvesFrom;
  if (!s1) return undefined;
  for (const d of g.reg.values()) if (d.name === s1 && d.evolvesFrom) return d.evolvesFrom;
  return undefined;
}

export function moveCounters(from: Mon, to: Mon, n: number): void {
  const k = Math.min(n, Math.floor(from.damage / 10));
  from.damage -= 10 * k;
  to.damage += 10 * k;
}

/** Mette in panchina una carta (già tolta da dove stava). */
export function benchCard(g: G, me: number, c: number): Mon {
  return putOnBench(g, me, c);
}

export function discardStadium(g: G): void {
  if (g.s.stadium === null) return;
  g.p(g.s.stadiumOwner).discard.push(g.s.stadium);
  g.s.stadium = null;
}

/** La mano del giocatore va in fondo al mazzo (es. Special Red Card). */
export function shuffleInto(g: G, who: number): void {
  const p = g.p(who);
  const hand = p.hand.splice(0);
  shuffle(g.s, hand);
  p.deck.unshift(...hand);
}

/** Coppie (Pokémon Base in campo, Stadio 2 in mano) per Rare Candy. */
export function rareCandyTargets(g: G, me: number): [Mon, number][] {
  const p = g.p(me);
  const out: [Mon, number][] = [];
  const seen = new Set<string>();
  for (const c of p.hand) {
    const d = g.def(c);
    if (d.kind !== "pokemon" || d.sub !== "stage2" || seen.has(d.id)) continue;
    seen.add(d.id);
    const base = basicOf(g, c);
    for (const m of g.inPlay(me)) {
      if (g.top(m).name === base && g.top(m).sub === "basic" && m.enteredTurn < g.s.turn) out.push([m, c]);
    }
  }
  return out;
}

export { benchMax, maxHp };
export const benchFree = (g: G, me: number) => benchMax(g, me) - g.p(me).bench.length;

/** Damp (Psyduck): niente Abilità che mettono KO il Pokémon che le usa. */
export function dampInPlay(g: G): boolean {
  return [0, 1].some(i => g.inPlay(i).some(m => (g.top(m).tags ?? []).includes("damp") && !abilitiesOff(g, m)));
}
