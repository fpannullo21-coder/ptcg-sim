/**
 * Motore della partita a punti di decisione.
 *
 * Tutta la partita è un generatore: ogni volta che serve una scelta
 * (un'azione, quali carte cercare, chi promuovere) si ferma con `yield`
 * e riprende con la risposta. `Match` tiene la storia delle risposte:
 * con lo stesso seme e le stesse risposte la partita si riproduce identica,
 * ed è così che si clona una partita a metà, anche dentro un effetto.
 */
import type { Action, CardDef, Decision, Gen, Mon, Player, State } from "./types.js";

export class GameOver extends Error {}

// --- casualità riproducibile (mulberry32) -----------------------------------

export function rand(s: State): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: State, a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// --- contesto della partita -------------------------------------------------

export class G {
  log: string[] = [];
  constructor(public s: State, public reg: Map<string, CardDef>, public verbose = false) {}

  def(card: number): CardDef {
    return this.reg.get(this.s.cards[card])!;
  }
  top(m: Mon): CardDef {
    return this.def(m.stack[m.stack.length - 1]);
  }
  hpLeft(m: Mon): number {
    return (this.top(m).hp ?? 0) - m.damage;
  }
  p(i: number): Player {
    return this.s.players[i];
  }
  me(): Player {
    return this.s.players[this.s.current];
  }
  opp(): Player {
    return this.s.players[1 - this.s.current];
  }
  inPlay(i: number): Mon[] {
    const p = this.p(i);
    return p.active ? [p.active, ...p.bench] : [...p.bench];
  }
  name(card: number): string {
    return this.def(card).name;
  }
  say(msg: string): void {
    if (this.verbose) this.log.push(`T${this.s.turn} P${this.s.current}: ${msg}`);
  }
  end(winner: number, why: string): never {
    this.s.winner = winner;
    this.s.why = why;
    this.say(`FINE: vince P${winner} (${why})`);
    throw new GameOver();
  }
}

/** Chiede una scelta. Se non c'è niente da decidere risponde da solo. */
export function* choose<T>(
  g: G, player: number, kind: string, options: T[], min: number, max: number, prompt?: string,
): Gen<T[]> {
  max = Math.min(max, options.length);
  min = Math.min(min, max);
  if (max === 0) return [];
  if (min === options.length) return [...options];
  const d: Decision = { player, kind, options, min, max, prompt };
  const idx = yield d;
  if (idx.length < min || idx.length > max || new Set(idx).size !== idx.length
      || idx.some(i => i < 0 || i >= options.length)) {
    throw new Error(`risposta non valida a ${kind}: ${JSON.stringify(idx)}`);
  }
  return idx.map(i => options[i]);
}

export function* chooseOne<T>(g: G, player: number, kind: string, options: T[], prompt?: string): Gen<T> {
  return (yield* choose(g, player, kind, options, 1, 1, prompt))[0];
}

// --- utilità di campo -------------------------------------------------------

export function newMon(card: number, turn: number): Mon {
  return { stack: [card], energies: [], tools: [], damage: 0, enteredTurn: turn, evolvedTurn: -1, conditions: [], used: {} };
}

export function slot(p: Player, t: number): Mon {
  return t === -1 ? p.active! : p.bench[t];
}

export function slots(p: Player): number[] {
  return [...(p.active ? [-1] : []), ...p.bench.map((_, i) => i)];
}

export function monCards(m: Mon): number[] {
  return [...m.stack, ...m.energies, ...m.tools];
}

export function isBasicPokemon(g: G, c: number): boolean {
  const d = g.def(c);
  return d.kind === "pokemon" && d.sub === "basic";
}

export function draw(g: G, i: number, n: number): void {
  const p = g.p(i);
  for (let k = 0; k < n && p.deck.length; k++) p.hand.push(p.deck.pop()!);
}

export function canPay(g: G, energies: number[], cost: string[]): boolean {
  const pool = energies.map(e => g.def(e).provides ?? "C") as string[];
  let colorless = 0;
  for (const c of cost) {
    if (c === "C") { colorless++; continue; }
    let k = pool.indexOf(c);
    if (k < 0) k = pool.indexOf("*");
    if (k < 0) return false;
    pool.splice(k, 1);
  }
  return pool.length >= colorless;
}

export function retreatCost(g: G, m: Mon): number {
  let c = g.top(m).retreat ?? 0;
  for (const t of m.tools) c -= g.def(t).retreatMinus ?? 0;
  return Math.max(0, c);
}

export function switchActive(p: Player, benchIdx: number): void {
  const nw = p.bench.splice(benchIdx, 1)[0];
  const old = p.active!;
  old.conditions = [];
  p.bench.push(old);
  p.active = nw;
}

// --- preparazione -----------------------------------------------------------

function* setup(g: G): Gen {
  const s = g.s;
  const mull = [0, 0];
  for (const i of [0, 1]) {
    const p = g.p(i);
    shuffle(s, p.deck);
    for (;;) {
      draw(g, i, 7);
      if (p.hand.some(c => isBasicPokemon(g, c))) break;
      mull[i]++;
      p.deck.push(...p.hand);
      p.hand = [];
      shuffle(s, p.deck);
    }
  }
  for (const i of [0, 1]) {
    const p = g.p(i);
    const a = yield* chooseOne(g, i, "setup_active", p.hand.filter(c => isBasicPokemon(g, c)));
    p.hand.splice(p.hand.indexOf(a), 1);
    p.active = newMon(a, 0);
    const bench = yield* choose(g, i, "setup_bench", p.hand.filter(c => isBasicPokemon(g, c)), 0, 5);
    for (const c of bench) {
      p.hand.splice(p.hand.indexOf(c), 1);
      p.bench.push(newMon(c, 0));
    }
  }
  for (const i of [0, 1]) {
    const p = g.p(i);
    for (let k = 0; k < 6; k++) p.prizes.push(p.deck.pop()!);
  }
  for (const i of [0, 1]) {
    const extra = mull[1 - i];
    if (extra > 0) {
      const n = yield* chooseOne(g, i, "mulligan_draw", Array.from({ length: extra + 1 }, (_, k) => k));
      draw(g, i, n);
    }
  }
}

// --- azioni legali ----------------------------------------------------------

export function legalActions(g: G): Action[] {
  const s = g.s, p = g.me();
  const acts: Action[] = [{ kind: "end" }];
  const firstTurn = s.turn === 1;
  const seen = new Set<string>();
  for (const c of p.hand) {
    const d = g.def(c);
    // carte identiche in mano danno le stesse azioni: ne teniamo una sola
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    if (d.kind === "pokemon" && d.sub === "basic") {
      if (p.bench.length < 5) acts.push({ kind: "bench", card: c });
    } else if (d.kind === "pokemon" && d.evolvesFrom) {
      if (s.turn <= 2) continue;
      for (const t of slots(p)) {
        const m = slot(p, t);
        if (g.top(m).name === d.evolvesFrom && m.enteredTurn < s.turn && m.evolvedTurn < s.turn) {
          acts.push({ kind: "evolve", card: c, target: t });
        }
      }
    } else if (d.kind === "energy") {
      if (!p.energyAttached) for (const t of slots(p)) acts.push({ kind: "attach", card: c, target: t });
    } else if (d.kind === "trainer") {
      if (d.sub === "supporter" && (p.supporterPlayed || firstTurn)) continue;
      if (d.sub === "stadium" && (p.stadiumPlayed || (s.stadium !== null && g.name(s.stadium) === d.name))) continue;
      if (d.canPlay && !d.canPlay(g, s.current)) continue;
      if (d.sub === "tool") {
        for (const t of slots(p)) if (slot(p, t).tools.length === 0) acts.push({ kind: "trainer", card: c, target: t });
      } else {
        acts.push({ kind: "trainer", card: c });
      }
    }
  }
  for (const t of slots(p)) {
    const m = slot(p, t);
    (g.top(m).abilities ?? []).forEach((ab, index) => {
      if ((ab.oncePerTurn ?? true) && m.used[ab.name] === s.turn) return;
      if (ab.canUse && !ab.canUse(g, s.current, m)) return;
      acts.push({ kind: "ability", target: t, index });
    });
  }
  const a = p.active;
  const stuck = a && (a.conditions.includes("asleep") || a.conditions.includes("paralyzed"));
  if (a && p.bench.length && !p.retreated && !stuck && a.energies.length >= retreatCost(g, a)) {
    p.bench.forEach((_, t) => acts.push({ kind: "retreat", target: t }));
  }
  if (a && !stuck && !(firstTurn && s.current === s.first)) {
    (g.top(a).attacks ?? []).forEach((atk, index) => {
      if (canPay(g, a.energies, atk.cost)) acts.push({ kind: "attack", index });
    });
  }
  return acts;
}

export function describe(g: G, a: Action): string {
  const t = (x: number) => (x === -1 ? "attivo" : `panchina ${x}`);
  switch (a.kind) {
    case "end": return "fine turno";
    case "bench": return `panchina: ${g.name(a.card)}`;
    case "evolve": return `evolve ${t(a.target)} in ${g.name(a.card)}`;
    case "attach": return `${g.name(a.card)} su ${t(a.target)}`;
    case "trainer": return `gioca ${g.name(a.card)}${a.target !== undefined ? " su " + t(a.target) : ""}`;
    case "ability": return `Abilità ${g.top(slot(g.me(), a.target)).abilities![a.index].name} (${t(a.target)})`;
    case "retreat": return `ritirata verso panchina ${a.target}`;
    case "attack": return `attacco ${g.top(g.me().active!).attacks![a.index].name}`;
  }
}

// --- applicazione delle azioni ----------------------------------------------

function removeFromHand(p: Player, c: number) {
  p.hand.splice(p.hand.indexOf(c), 1);
}

/** Applica un'azione. Restituisce true se il turno è finito. */
function* apply(g: G, a: Action): Gen<boolean> {
  const s = g.s, me = s.current, p = g.me();
  g.say(describe(g, a));
  switch (a.kind) {
    case "end":
      return true;
    case "bench":
      removeFromHand(p, a.card);
      p.bench.push(newMon(a.card, s.turn));
      break;
    case "evolve": {
      const m = slot(p, a.target);
      removeFromHand(p, a.card);
      m.stack.push(a.card);
      m.evolvedTurn = s.turn;
      m.conditions = [];
      break;
    }
    case "attach":
      removeFromHand(p, a.card);
      slot(p, a.target).energies.push(a.card);
      p.energyAttached = true;
      break;
    case "trainer": {
      const d = g.def(a.card);
      removeFromHand(p, a.card);
      if (d.sub === "tool") {
        slot(p, a.target!).tools.push(a.card);
      } else if (d.sub === "stadium") {
        if (s.stadium !== null) g.p(s.stadiumOwner).discard.push(s.stadium);
        s.stadium = a.card;
        s.stadiumOwner = me;
        p.stadiumPlayed = true;
      } else {
        if (d.sub === "supporter") p.supporterPlayed = true;
        if (d.play) yield* d.play(g, me);
        p.discard.push(a.card);
      }
      break;
    }
    case "ability": {
      const m = slot(p, a.target);
      const ab = g.top(m).abilities![a.index];
      m.used[ab.name] = s.turn;
      yield* ab.use(g, me, m);
      break;
    }
    case "retreat": {
      const cost = retreatCost(g, p.active!);
      const paid = yield* choose(g, me, "retreat_discard", p.active!.energies, cost, cost);
      for (const e of paid) {
        p.active!.energies.splice(p.active!.energies.indexOf(e), 1);
        p.discard.push(e);
      }
      switchActive(p, a.target);
      p.retreated = true;
      break;
    }
    case "attack":
      yield* attack(g, a.index);
      return true;
  }
  yield* checkKO(g);
  return false;
}

export function applyDamage(g: G, attacker: Mon, target: Mon, base: number, toActive = true): number {
  let dmg = base;
  if (toActive && dmg > 0) {
    const at = g.top(attacker).type, td = g.top(target);
    if (td.weakness && td.weakness === at) dmg *= 2;
    if (td.resistance && td.resistance === at) dmg -= 30;
  }
  dmg = Math.max(0, dmg);
  target.damage += dmg;
  return dmg;
}

function* attack(g: G, index: number): Gen {
  const s = g.s, p = g.me(), o = g.opp();
  const att = p.active!;
  const atk = g.top(att).attacks![index];
  g.say(`attacca con ${atk.name}`);
  if (att.conditions.includes("confused") && rand(s) < 0.5) {
    att.damage += 30;
    g.say("confuso: croce, 30 danni a sé stesso");
    yield* checkKO(g);
    return;
  }
  let dmg = atk.damage;
  if (atk.effect) {
    const r = yield* atk.effect(g, s.current);
    if (typeof r === "number") dmg = r;
  }
  if (dmg && o.active) applyDamage(g, att, o.active, dmg);
  yield* checkKO(g);
}

/** KO, premi, fine partita e promozione dei nuovi attivi. */
export function* checkKO(g: G): Gen {
  const s = g.s;
  const order = [s.current, 1 - s.current];
  for (const i of order) {
    const p = g.p(i);
    for (const m of g.inPlay(i)) {
      if (m.damage < (g.top(m).hp ?? 0)) continue;
      const prizes = g.top(m).prizes ?? 1;
      g.say(`KO ${g.top(m).name} di P${i}`);
      if (m === p.active) p.active = null;
      else p.bench.splice(p.bench.indexOf(m), 1);
      p.discard.push(...monCards(m));
      takePrizes(g, 1 - i, prizes);
    }
  }
  const done = order.filter(i => g.p(i).prizes.length === 0);
  const empty = order.filter(i => !g.p(i).active && !g.p(i).bench.length);
  const winners = new Set([...done, ...empty.map(i => 1 - i)]);
  if (winners.size === 2) g.end(-1, "pareggio");
  if (winners.size === 1) g.end([...winners][0], done.length ? "premi" : "nessun Pokémon in campo");
  for (const i of order) {
    const p = g.p(i);
    if (!p.active) {
      const t = yield* chooseOne(g, i, "promote", p.bench.map((_, k) => k));
      p.active = p.bench.splice(t, 1)[0];
    }
  }
}

/** I premi si prendono coperti: sceglierli equivale a prenderli a caso. */
export function takePrizes(g: G, i: number, n: number): void {
  const p = g.p(i);
  for (let k = 0; k < n && p.prizes.length; k++) {
    const j = Math.floor(rand(g.s) * p.prizes.length);
    p.hand.push(p.prizes.splice(j, 1)[0]);
  }
}

// --- turni ------------------------------------------------------------------

function* betweenTurns(g: G): Gen {
  const s = g.s;
  for (const i of [s.current, 1 - s.current]) {
    const m = g.p(i).active;
    if (!m) continue;
    const has = (c: string) => m.conditions.includes(c);
    const drop = (c: string) => { m.conditions = m.conditions.filter(x => x !== c); };
    if (has("poisoned")) m.damage += 10;
    if (has("burned")) { m.damage += 20; if (rand(s) < 0.5) drop("burned"); }
    if (has("asleep") && rand(s) < 0.5) drop("asleep");
    if (has("paralyzed") && i === s.current) drop("paralyzed");
  }
  yield* checkKO(g);
}

function* turn(g: G, maxActions = 300): Gen {
  const p = g.me();
  p.supporterPlayed = p.energyAttached = p.retreated = p.stadiumPlayed = false;
  if (!p.deck.length) g.end(1 - g.s.current, "mazzo finito");
  draw(g, g.s.current, 1);
  for (let k = 0; k < maxActions; k++) {
    const a = yield* chooseOne(g, g.s.current, "action", legalActions(g));
    if (yield* apply(g, a)) return;
  }
}

export function* gameLoop(g: G, maxTurns = 100): Gen {
  yield* setup(g);
  g.s.current = g.s.first;
  for (let t = 1; t <= maxTurns; t++) {
    g.s.turn = t;
    yield* turn(g);
    yield* betweenTurns(g);
    g.s.current = 1 - g.s.current;
  }
  g.end(-1, "limite di turni");
}

// --- partita completa -------------------------------------------------------

export interface MatchOptions {
  first?: number;
  maxTurns?: number;
  verbose?: boolean;
}

export function newState(decks: CardDef[][], seed: number): { s: State; reg: Map<string, CardDef> } {
  const reg = new Map<string, CardDef>();
  const cards: string[] = [];
  const players = decks.map(deck => {
    const ids = deck.map(d => {
      reg.set(d.id, d);
      cards.push(d.id);
      return cards.length - 1;
    });
    return {
      deck: ids, hand: [], prizes: [], discard: [], active: null, bench: [],
      supporterPlayed: false, energyAttached: false, retreated: false, stadiumPlayed: false,
    } as Player;
  }) as [Player, Player];
  const s: State = {
    cards, players, turn: 0, current: 0, first: 0, stadium: null, stadiumOwner: 0,
    winner: null, why: "", rng: seed | 0,
  };
  return { s, reg };
}

/** Una partita in corso. `pending` è la decisione che aspetta risposta. */
export class Match {
  g: G;
  pending: Decision | null = null;
  history: number[][] = [];
  private it: Gen;

  constructor(public decks: CardDef[][], public seed: number, public opts: MatchOptions = {}) {
    const { s, reg } = newState(decks, seed);
    s.first = opts.first ?? (rand(s) < 0.5 ? 0 : 1);
    this.g = new G(s, reg, opts.verbose ?? false);
    this.it = gameLoop(this.g, opts.maxTurns ?? 100);
    this.advance(() => this.it.next());
  }

  private advance(step: () => IteratorResult<Decision, void>) {
    try {
      const r = step();
      this.pending = r.done ? null : r.value;
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
      this.pending = null;
    }
  }

  get over(): boolean {
    return this.pending === null;
  }

  answer(idx: number[]): void {
    if (!this.pending) throw new Error("partita finita");
    this.history.push(idx);
    this.advance(() => this.it.next(idx));
  }

  /** Copia esatta della partita, rigiocando le stesse risposte. */
  clone(): Match {
    const m = new Match(this.decks, this.seed, { ...this.opts, verbose: false });
    for (const h of this.history) m.answer(h);
    return m;
  }
}

export interface Agent {
  decide(g: G, d: Decision): number[];
}

export function playGame(decks: CardDef[][], agents: [Agent, Agent], seed: number, opts: MatchOptions = {}): Match {
  const m = new Match(decks, seed, opts);
  while (m.pending) m.answer(agents[m.pending.player].decide(m.g, m.pending));
  return m;
}
