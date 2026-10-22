/**
 * Motore della partita a punti di decisione.
 *
 * Tutta la partita è un generatore: ogni volta che serve una scelta
 * (un'azione, quali carte cercare, chi promuovere) si ferma con `yield`
 * e riprende con la risposta. `Match` tiene la storia delle risposte:
 * con lo stesso seme e le stesse risposte la partita si riproduce identica,
 * ed è così che si clona una partita a metà, anche dentro un effetto.
 */
import type { Action, Attack, BlockKind, CardDef, DamageCtx, Decision, EType, Gen, Mon, Passive, Player, State } from "./types.js";

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
    return maxHp(this, m) - m.damage;
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

/** Mette in panchina una carta (già tolta da dove stava) e applica gli effetti "quando va in panchina". */
export function putOnBench(g: G, player: number, card: number): Mon {
  const m = newMon(card, g.s.turn);
  g.p(player).bench.push(m);
  if (player === g.s.current) for (const a of passives(g)) a.p.benched?.(g, m, player, a.owner, a.self);
  return m;
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

/** Energie fornite da una carta Energia attaccata, tenendo conto degli effetti passivi. */
export function provided(g: G, e: number): string[] {
  const base = [g.def(e).provides ?? "C"];
  const ps = passives(g).filter(a => a.p.energyProvides);
  if (!ps.length) return base;
  const owner = g.inPlay(0).some(m => m.energies.includes(e)) ? 0 : 1;
  for (const a of ps) { const r = a.p.energyProvides!(g, e, owner, a.owner, a.self); if (r) return r; }
  return base;
}

export function canPay(g: G, energies: number[], cost: string[]): boolean {
  const pool = energies.flatMap(e => provided(g, e));
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

// --- effetti passivi --------------------------------------------------------

export interface ActivePassive { p: Passive; owner: number; self: Mon | null; card: number }

/** Tutti gli effetti passivi in gioco: Pokémon in campo, Strumenti, Stadio. */
/** Abilità spente da uno Stadio (es. Team Rocket's Watchtower: i Pokémon incolori non hanno Abilità). */
export function abilitiesOff(g: G, m: Mon): boolean {
  if (g.s.stadium === null) return false;
  const tags = g.def(g.s.stadium).tags ?? [];
  return tags.includes("colorless_no_abilities") && g.top(m).type === "C";
}

export function passives(g: G): ActivePassive[] {
  const out: ActivePassive[] = [];
  const toolsOff = g.s.stadium !== null && (g.def(g.s.stadium).tags ?? []).includes("tools_off");
  for (const i of [0, 1]) {
    for (const m of g.inPlay(i)) {
      const top = m.stack[m.stack.length - 1];
      const d = g.def(top);
      if (d.passive && !(d.kind === "pokemon" && (d.abilities?.length || d.tags?.includes("ability_passive")) && abilitiesOff(g, m))) {
        out.push({ p: d.passive, owner: i, self: m, card: top });
      }
      for (const e of m.energies) { const ed = g.def(e); if (ed.passive) out.push({ p: ed.passive, owner: i, self: m, card: e }); }
      if (!toolsOff) for (const t of m.tools) { const td = g.def(t); if (td.passive) out.push({ p: td.passive, owner: i, self: m, card: t }); }
    }
  }
  for (const e of g.s.turnEffects) {
    const d = g.def(e.card);
    if (e.until >= g.s.turn && d.turnPassive) out.push({ p: d.turnPassive, owner: e.owner, self: null, card: e.card });
  }
  if (g.s.stadium !== null) {
    const d = g.def(g.s.stadium);
    if (d.passive) out.push({ p: d.passive, owner: g.s.stadiumOwner, self: null, card: g.s.stadium });
  }
  return out;
}

export function ownerOf(g: G, m: Mon): number {
  return g.inPlay(0).includes(m) ? 0 : 1;
}

/** Vero se gli effetti di attacchi e Abilità di `sourcePlayer` non hanno effetto su `target`. */
export function prevented(g: G, target: Mon, sourcePlayer: number): boolean {
  if (ownerOf(g, target) === sourcePlayer) return false;
  if (target.used.protect === g.s.turn) return true;
  return passives(g).some(a => a.p.preventsEffects?.(g, target, sourcePlayer, a.owner, a.self));
}

export function blocked(g: G, player: number, what: BlockKind, card: number | null): boolean {
  return passives(g).some(a => a.p.blocks?.(g, player, what, card, a.owner, a.self));
}

export function attackCost(g: G, m: Mon, atk: Attack): string[] {
  const owner = ownerOf(g, m);
  let less = 0;
  for (const a of passives(g)) if (a.p.attackCostLess) less += a.p.attackCostLess(g, m, atk, owner, a.owner, a.self);
  const cost = [...atk.cost];
  for (; less > 0; less--) { const k = cost.lastIndexOf("C"); if (k < 0) break; cost.splice(k, 1); }
  for (; less < 0; less++) cost.push("C"); // costo in più (es. Nighttime Mine)
  return cost;
}

export function weaknessOf(g: G, m: Mon): EType | undefined {
  const owner = ownerOf(g, m);
  let w = g.top(m).weakness;
  for (const a of passives(g)) if (a.p.weakness) w = a.p.weakness(g, m, owner, a.owner, a.self) ?? w;
  return w;
}

export function canHeal(g: G, m: Mon): boolean {
  const owner = ownerOf(g, m);
  return !passives(g).some(a => a.p.noHeal?.(g, m, owner, a.owner, a.self));
}

export function maxHp(g: G, m: Mon): number {
  let hp = g.top(m).hp ?? 0;
  const owner = g.inPlay(0).includes(m) ? 0 : 1;
  for (const a of passives(g)) if (a.p.hp) hp += a.p.hp(g, m, owner, a.owner, a.self);
  return hp;
}

export function benchMax(g: G, player: number): number {
  let n = 5;
  for (const a of passives(g)) if (a.p.benchSize) n = Math.max(n, a.p.benchSize(g, player, a.owner));
  return n;
}

export function retreatCost(g: G, m: Mon): number {
  let c = g.top(m).retreat ?? 0;
  const owner = ownerOf(g, m);
  for (const a of passives(g)) if (a.p.retreat) c += a.p.retreat(g, m, owner, a.owner, a.self);
  return Math.max(0, c);
}

export function switchActive(p: Player, benchIdx: number): void {
  const nw = p.bench.splice(benchIdx, 1)[0];
  const old = p.active!;
  old.conditions = [];
  p.bench.push(old);
  p.active = nw;
  nw.used.became_active = -1; // -1 = appena diventato attivo; markActive scrive il turno
}

/** Scrive il turno sui Pokémon appena diventati attivi (switchActive non conosce il turno). */
export function markActive(g: G): void {
  for (const p of g.s.players) if (p.active && p.active.used.became_active === -1) p.active.used.became_active = g.s.turn;
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
      if (p.bench.length < benchMax(g, s.current)) acts.push({ kind: "bench", card: c });
    } else if (d.kind === "pokemon" && d.evolvesFrom) {
      if (s.turn <= 2 || blocked(g, s.current, "evolve", c)) continue;
      for (const t of slots(p)) {
        const m = slot(p, t);
        const fresh = m.enteredTurn >= s.turn || m.evolvedTurn >= s.turn;
        const allowed = !fresh || passives(g).some(a => a.p.evolveSameTurn?.(g, m, c, s.current, a.owner));
        if (g.top(m).name === d.evolvesFrom && allowed) {
          acts.push({ kind: "evolve", card: c, target: t });
        }
      }
    } else if (d.kind === "energy") {
      if ((d.tags ?? []).includes("ace_spec") && blocked(g, s.current, "ace", c)) continue;
      if (!p.energyAttached) for (const t of slots(p)) acts.push({ kind: "attach", card: c, target: t });
    } else if (d.kind === "trainer") {
      if (d.sub === "supporter" && (p.supporterPlayed || (firstTurn && !(d.tags ?? []).includes("first_turn_ok")))) continue;
      if ((d.sub === "item" || d.sub === "supporter" || d.sub === "stadium" || d.sub === "tool") && blocked(g, s.current, d.sub, c)) continue;
      if ((d.tags ?? []).includes("ace_spec") && blocked(g, s.current, "ace", c)) continue;
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
      if (ab.trigger) return;
      if (abilitiesOff(g, m)) return;
      if ((ab.oncePerTurn ?? true) && m.used[ab.name] === s.turn) return;
      if (ab.canUse && !ab.canUse(g, s.current, m)) return;
      if (blocked(g, s.current, "ability", m.stack[m.stack.length - 1])) return;
      acts.push({ kind: "ability", target: t, index });
    });
  }
  if (s.stadium !== null) {
    const sd = g.def(s.stadium);
    if (sd.stadiumAction && p.flags.stadium_used !== s.turn && (!sd.stadiumAction.canUse || sd.stadiumAction.canUse(g, s.current))) {
      acts.push({ kind: "stadium" });
    }
  }
  const a = p.active;
  const stuck = a && (a.conditions.includes("asleep") || a.conditions.includes("paralyzed"));
  if (a && p.bench.length && !p.retreated && !stuck && a.used.no_retreat !== s.turn && a.energies.length >= retreatCost(g, a)) {
    p.bench.forEach((_, t) => acts.push({ kind: "retreat", target: t }));
  }
  if (a && !stuck && !(firstTurn && s.current === s.first) && a.used.no_attack !== s.turn) {
    (g.top(a).attacks ?? []).forEach((atk, index) => {
      if (a.used["lock:" + atk.name] === s.turn) return; // "durante il tuo prossimo turno non può usare questo attacco"
      if (canPay(g, a.energies, attackCost(g, a, atk))) acts.push({ kind: "attack", index });
    });
    // Memory Helix (Mew ex): può usare gli attacchi dei Pokémon in panchina, pagandone il costo
    if ((g.top(a).tags ?? []).includes("memory_helix") && !abilitiesOff(g, a)) {
      p.bench.forEach((m, from) => (g.top(m).attacks ?? []).forEach((atk, index) => {
        if (canPay(g, a.energies, attackCost(g, a, atk))) acts.push({ kind: "attack", index, from });
      }));
    }
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
    case "attack": return `attacco ${g.top(a.from !== undefined ? g.me().bench[a.from] : g.me().active!).attacks![a.index].name}`;
    case "stadium": return `usa lo Stadio ${g.name(g.s.stadium!)}`;
  }
}

// --- applicazione delle azioni ----------------------------------------------

/** Evoluzione dalla mano (azione normale o Rare Candy), con le Abilità "quando evolve". */
export function* evolveFromHand(g: G, me: number, m: Mon, card: number): Gen {
  const p = g.p(me);
  removeFromHand(p, card);
  m.stack.push(card);
  m.evolvedTurn = g.s.turn;
  m.conditions = [];
  for (const ab of g.top(m).abilities ?? []) {
    if (ab.trigger !== "evolve" || abilitiesOff(g, m) || (ab.canUse && !ab.canUse(g, me, m))) continue;
    if ((yield* choose(g, me, "trigger_" + ab.name, ["usa"], 0, 1)).length) {
      m.used[ab.name] = g.s.turn;
      yield* ab.use(g, me, m);
    }
  }
}

function removeFromHand(p: Player, c: number) {
  p.hand.splice(p.hand.indexOf(c), 1);
}

/** Applica un'azione. Restituisce true se il turno è finito. */
export function* apply(g: G, a: Action): Gen<boolean> {
  const s = g.s, me = s.current, p = g.me();
  g.say(describe(g, a));
  switch (a.kind) {
    case "end":
      return true;
    case "bench": {
      removeFromHand(p, a.card);
      const m = putOnBench(g, me, a.card);
      // Abilità "quando giochi questo Pokémon dalla mano in panchina" (es. Meowth ex)
      for (const ab of g.top(m).abilities ?? []) {
        if (ab.trigger !== "bench" || abilitiesOff(g, m) || (ab.canUse && !ab.canUse(g, me, m))) continue;
        if ((yield* choose(g, me, "trigger_" + ab.name, ["usa"], 0, 1)).length) {
          m.used[ab.name] = s.turn;
          yield* ab.use(g, me, m);
        }
      }
      break;
    }
    case "evolve":
      yield* evolveFromHand(g, me, slot(p, a.target), a.card);
      break;
    case "attach": {
      removeFromHand(p, a.card);
      const m = slot(p, a.target);
      m.energies.push(a.card);
      p.energyAttached = true;
      const d = g.def(a.card);
      if (d.onAttach) yield* d.onAttach(g, me, m);
      break;
    }
    case "stadium":
      p.flags.stadium_used = s.turn;
      yield* g.def(s.stadium!).stadiumAction!.use(g, me);
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
        if (d.turnPassive) s.turnEffects.push({ card: a.card, owner: me, until: s.turn });
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
    case "attack": {
      const att = p.active!;
      yield* attack(g, a.index, a.from);
      // Festival Lead: con Festival Grounds in campo si può attaccare due volte
      if (p.active === att && (g.top(att).tags ?? []).includes("festival_lead") && !abilitiesOff(g, att)
          && s.stadium !== null && g.name(s.stadium) === "Festival Grounds" && g.opp().active
          && (yield* choose(g, me, "festival_lead", ["sì"], 0, 1)).length) {
        yield* attack(g, a.index, a.from);
      }
      return true;
    }
  }
  yield* checkKO(g);
  return false;
}

/**
 * Danno di un attacco: modificatori "prima" (es. +40 di Black Belt), poi debolezza
 * e resistenza solo sull'attivo, poi modificatori "dopo" (es. riduzioni del danno subito).
 */
export function applyDamage(g: G, attacker: Mon, target: Mon, base: number, toActive = true): number {
  const ctx: DamageCtx = {
    attacker, attackerOwner: ownerOf(g, attacker), target, targetOwner: ownerOf(g, target), toActive, damage: base,
  };
  // regola Tera: in panchina non subisce danni dagli attacchi
  if (!toActive && (g.top(target).tags ?? []).includes("tera")) return 0;
  // protezione "durante il prossimo turno dell'avversario" (es. Dig di Dunsparce)
  if (target.used.protect === g.s.turn && ctx.attackerOwner !== ctx.targetOwner) return 0;
  // protezione solo dai Pokémon ex (es. Acerola's Mischief)
  if (target.used.protect_ex === g.s.turn && ctx.attackerOwner !== ctx.targetOwner && (g.top(attacker).tags ?? []).includes("ex")) return 0;
  const ps = passives(g);
  if (ctx.damage > 0) for (const a of ps) if (a.p.damageBefore) ctx.damage = a.p.damageBefore(g, ctx, a.owner, a.self);
  // "il Pokémon in difesa fa N danni in meno" (es. Growl), prima di debolezza e resistenza
  if (ctx.damage > 0 && attacker.used.weaken_turn === g.s.turn) ctx.damage -= attacker.used.weaken ?? 0;
  if (toActive && ctx.damage > 0) {
    const at = g.top(attacker).type, td = g.top(target), w = weaknessOf(g, target);
    if (w && w === at) ctx.damage *= 2;
    if (td.resistance && td.resistance === at) ctx.damage -= 30;
  }
  if (ctx.damage > 0) for (const a of ps) if (a.p.damageAfter) ctx.damage = a.p.damageAfter(g, ctx, a.owner, a.self);
  // "subisce N danni in meno" fino al prossimo turno dell'avversario (es. Iron Feathers), dopo debolezza e resistenza
  if (ctx.damage > 0 && target.used.reduce_turn === g.s.turn && ctx.attackerOwner !== ctx.targetOwner) ctx.damage -= target.used.reduce ?? 0;
  const dmg = Math.max(0, ctx.damage);
  target.damage += dmg;
  if (dmg > 0 && ctx.attackerOwner !== ctx.targetOwner) for (const a of ps) a.p.damaged?.(g, target, ctx.targetOwner, a.owner, a.self);
  return dmg;
}

/** Attacco dell'attivo; con `from` usa l'attacco di un Pokémon in panchina (Memory Helix). */
export function* attack(g: G, index: number, from?: number): Gen {
  const s = g.s, p = g.me(), o = g.opp();
  const att = p.active!;
  const atk = (from !== undefined ? g.top(p.bench[from]).attacks! : g.top(att).attacks!)[index];
  g.say(`attacca con ${atk.name}`);
  if (att.conditions.includes("confused") && rand(s) < 0.5) {
    att.damage += 30;
    g.say("confuso: croce, 30 danni a sé stesso");
    yield* checkKO(g);
    return;
  }
  s.attacking = s.current;
  let dmg = atk.damage;
  if (atk.effect) {
    const r = yield* atk.effect(g, s.current);
    if (typeof r === "number") dmg = r;
  }
  if (dmg && o.active) applyDamage(g, att, o.active, dmg);
  if (atk.after) yield* atk.after(g, s.current);
  yield* checkKO(g);
  s.attacking = -1;
}

/** KO, premi, fine partita e promozione dei nuovi attivi. */
export function* checkKO(g: G): Gen {
  const s = g.s;
  const order = [s.current, 1 - s.current];
  for (const i of order) {
    const p = g.p(i);
    for (const m of g.inPlay(i)) {
      if (m.damage < maxHp(g, m)) continue;
      if (s.attacking === 1 - i && passives(g).some(a => a.p.survives?.(g, m, i, a.owner, a.self))) {
        m.damage = maxHp(g, m) - 10;
        continue;
      }
      let prizes = g.top(m).prizes ?? 1;
      const byAttack = s.attacking === 1 - i;
      for (const a of passives(g)) if (a.p.prizes) prizes += a.p.prizes(g, m, i, byAttack, a.owner, a.self);
      prizes = Math.max(0, prizes);
      g.say(`KO ${g.top(m).name} di P${i}`);
      if (m === p.active) p.active = null;
      else p.bench.splice(p.bench.indexOf(m), 1);
      p.discard.push(...monCards(m));
      p.flags.ko_turn = s.turn;
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
      p.active.used.became_active = s.turn;
    }
    // panchina oltre il massimo (es. Area Zero Underdepths che lascia il campo): si scarta
    const max = benchMax(g, i);
    if (p.bench.length > max) {
      for (const m of yield* choose(g, i, "bench_discard", [...p.bench], p.bench.length - max, p.bench.length - max)) {
        p.bench.splice(p.bench.indexOf(m), 1);
        p.discard.push(...monCards(m));
      }
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
  s.turnEffects = s.turnEffects.filter(e => e.until > s.turn);
  for (const i of [s.current, 1 - s.current]) {
    const m = g.p(i).active;
    if (!m) continue;
    const has = (c: string) => m.conditions.includes(c);
    const drop = (c: string) => { m.conditions = m.conditions.filter(x => x !== c); };
    if (s.stadium !== null && (g.def(s.stadium).tags ?? []).includes("no_conditions_with_energy") && m.energies.length) m.conditions = [];
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
    markActive(g);
    const a = yield* chooseOne(g, g.s.current, "action", legalActions(g));
    const done = yield* apply(g, a);
    markActive(g);
    // alcuni effetti fanno finire il turno (es. Lumiose City)
    if (done || g.me().flags.end_turn === g.s.turn) break;
  }
  // effetti "alla fine del tuo turno" (es. Powerglass, Ignition Energy)
  for (const x of passives(g)) x.p.endOfTurn?.(g, g.s.current, x.owner, x.self);
  yield* checkKO(g);
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
      supporterPlayed: false, energyAttached: false, retreated: false, stadiumPlayed: false, flags: {},
    } as Player;
  }) as [Player, Player];
  const s: State = {
    cards, players, turn: 0, current: 0, first: 0, stadium: null, stadiumOwner: 0, turnEffects: [], attacking: -1,
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
