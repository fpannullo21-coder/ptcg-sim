/**
 * Giocatore base generico: regole di buon senso valide per qualsiasi mazzo.
 * È il punto di partenza dei piani di mazzo (fase 1) e il giocatore delle
 * continuazioni del giocatore forte (fase 2).
 *
 * Ordine del turno: Abilità ed evoluzioni, panchina, ricerca, Energia,
 * Supporter, poi l'attacco migliore. Boss's Orders solo se dà un KO.
 */
import { apply, attack, attackCost, canPay, G, GameOver, provided, retreatCost, slot } from "../engine/game.js";
import type { Agent } from "../engine/game.js";
import { atkDamage, derivePlan, type Plan } from "./plan.js";
import type { Action, Attack, CardDef, Decision, Mon } from "../engine/types.js";

const SEARCH = new Set(["search", "ultra_ball", "poke_pad", "puppet_pull", "poffin", "telepathic", "explorer", "pokegear",
  "night_stretcher", "recover", "procurement", "look_top", "patch_energy", "attach_discard"]);
const DISCARD = new Set(["discard", "ultra_ball_discard", "prism_discard", "retreat_discard"]);

export class BasicAgent implements Agent {
  constructor(public opts: { benchMax?: number } = {}) {}

  private plans: (Plan | null)[] = [null, null];
  /** Piano della lista del giocatore (ricavato una volta sola alla prima decisione). */
  plan(g: G, me: number): Plan {
    return (this.plans[me] ??= derivePlan(g, me));
  }

  /** Quanto vale mettere in campo questo Pokémon adesso, secondo il piano. */
  benchValue(g: G, me: number, c: number): number {
    const d = g.def(c), e = this.plan(g, me).get(d.name);
    if (!e) return 20;
    const inPlay = g.inPlay(me).filter(m => g.top(m).name === d.name || m.stack.some(x => g.def(x).name === d.name)).length;
    if (inPlay >= e.max) return 5;
    return e.value - 10 * inPlay;
  }

  // --- valutazioni --------------------------------------------------------

  /** Danno stampato del miglior attacco pagabile adesso da questo Pokémon. */
  bestDamage(g: G, m: Mon): { atk: Attack | null; dmg: number } {
    let best: { atk: Attack | null; dmg: number } = { atk: null, dmg: -1 };
    for (const a of g.top(m).attacks ?? []) {
      if (canPay(g, m.energies, attackCost(g, m, a)) && atkDamage(a) > best.dmg) best = { atk: a, dmg: atkDamage(a) };
    }
    return best;
  }

  /** Simboli del costo non ancora coperti da queste Energie (prima i tipi, poi gli incolori). */
  need(g: G, energies: number[], cost: string[]): number {
    const pool = energies.flatMap(e => provided(g, e));
    let missing = 0, colorless = 0;
    for (const c of cost) {
      if (c === "C") { colorless++; continue; }
      let k = pool.indexOf(c);
      if (k < 0) k = pool.indexOf("*");
      if (k < 0) missing++; else pool.splice(k, 1);
    }
    return missing + Math.max(0, colorless - pool.length);
  }

  /** Quanto aiuta attaccare l'Energia `e` al Pokémon `m`: 0 se non avvicina nessun attacco utile. */
  energyHelp(g: G, m: Mon, e: number): number {
    let best = 0;
    for (const a of g.top(m).attacks ?? []) {
      if (atkDamage(a) <= 0) continue;
      const cost = attackCost(g, m, a);
      const before = this.need(g, m.energies, cost), after = this.need(g, [...m.energies, e], cost);
      if (after < before) best = Math.max(best, 10 + Math.max(atkDamage(a), 30) / 10 + (after === 0 ? 20 : 0));
    }
    return best;
  }

  /** L'attaccante su cui concentrare le Energie: il più forte tra quelli più vicini a essere pronti. */
  focus(g: G, me: number): Mon | null {
    let best: Mon | null = null, bv = 0;
    for (const m of g.inPlay(me)) {
      for (const a of g.top(m).attacks ?? []) {
        const dmg = atkDamage(a);
        const v = dmg / (1 + this.need(g, m.energies, attackCost(g, m, a))) + (m === g.p(me).active ? 5 : 0);
        if (v > bv) { bv = v; best = m; }
      }
    }
    return best;
  }

  /** Quanto manca, in Energie, all'attacco più forte del Pokémon. */
  energyGap(g: G, m: Mon): number {
    const atks = g.top(m).attacks ?? [];
    if (!atks.length) return 0;
    const strongest = atks.reduce((a, b) => (atkDamage(b) >= atkDamage(a) ? b : a));
    return Math.max(0, attackCost(g, m, strongest).length - m.energies.length);
  }

  private drawAbility = new Map<string, boolean>();
  /** Vero se l'Abilità serve soprattutto a pescare (provata una volta su una copia della partita). */
  isDrawAbility(g: G, me: number, a: Action): boolean {
    const m = slot(g.p(me), (a as { target: number }).target);
    const name = g.top(m).abilities![(a as { index: number }).index].name;
    const known = this.drawAbility.get(name);
    if (known !== undefined) return known;
    const copy = new G(structuredClone(g.s), g.reg);
    const before = { hand: copy.p(me).hand.length, deck: copy.p(me).deck.length };
    let draw = false;
    try {
      const it = apply(copy, a);
      let r = it.next();
      for (let k = 0; !r.done && k < 50; k++) r = it.next(this.decide(copy, r.value));
      draw = copy.p(me).deck.length < before.deck && copy.p(me).hand.length > before.hand;
    } catch { draw = false; }
    this.drawAbility.set(name, draw);
    return draw;
  }

  /** Quanto conviene tenere una carta invece di scartarla: le carte "carburante" (es. Hide 'n' Sneak) si scartano volentieri. */
  keep(g: G, me: number, c: number): number {
    const fuel = this.plan(g, me).fuel;
    const isFuel = !!fuel && (g.def(c).tags ?? []).includes(fuel);
    // una copia del carburante può servire in campo se non ce n'è nessuna; le altre vanno negli scarti
    return this.want(g, me, c) - (isFuel ? 70 : 0);
  }

  /** Quanto vale avere in mano questa carta adesso (più alto = più utile). */
  want(g: G, me: number, c: number): number {
    const d = g.def(c), p = g.p(me);
    const inPlay = g.inPlay(me);
    const inHand = p.hand.filter(x => g.def(x).name === d.name).length;
    if (d.kind === "pokemon") {
      if (d.evolvesFrom && inPlay.some(m => g.top(m).name === d.evolvesFrom)) return 90 - 20 * inHand;
      if (d.sub === "basic") return this.benchValue(g, me, c) - 15 * inHand;
      return (this.plan(g, me).get(d.name)?.value ?? 50) * 0.6 - 15 * inHand;
    }
    if (d.kind === "energy") return inPlay.some(m => this.energyGap(g, m) > 0) ? 55 - 20 * inHand : 15;
    if (d.sub === "supporter") return p.hand.some(x => g.def(x).sub === "supporter") ? 25 : 65;
    return 35 - 10 * inHand;
  }

  // --- decisioni ----------------------------------------------------------

  decide(g: G, d: Decision): number[] {
    const me = d.player;
    const idx = d.options.map((_, i) => i);
    const top = (score: (o: unknown) => number, n: number) =>
      idx.sort((a, b) => score(d.options[b]) - score(d.options[a])).slice(0, n);

    if (d.kind === "action") return [this.action(g, me, d.options as Action[])];
    if (d.kind === "mulligan_draw") return [d.options.length - 1];
    if (d.kind === "setup_active") {
      // in attivo il Pokémon meno prezioso e più facile da ritirare; mai la base di una linea evolutiva se c'è altro
      return top(c => -(g.def(c as number).retreat ?? 0) * 10 - ((g.def(c as number).tags ?? []).includes("ex") ? 50 : 0)
        - (this.plan(g, me).get(g.def(c as number).name)?.role === "line" ? 25 : 0), 1);
    }
    if (d.kind === "setup_bench") {
      const ranked = top(c => this.benchValue(g, me, c as number), d.max);
      return ranked.filter(i => this.benchValue(g, me, d.options[i] as number) >= 50).slice(0, this.opts.benchMax ?? 3);
    }
    if (d.kind === "promote" || d.kind === "switch") {
      const p = g.p(me);
      // le opzioni possono essere indici della panchina o direttamente i Pokémon
      return top(t => { const m = typeof t === "number" ? slot(p, t) : (t as Mon); return this.bestDamage(g, m).dmg * 2 + g.hpLeft(m) / 10 - this.energyGap(g, m) * 30; }, 1);
    }
    if (d.kind === "gust") {
      const o = g.p(1 - me), mine = g.p(me).active;
      const dmg = mine ? this.bestDamage(g, mine).dmg : 0;
      return top(t => { const m = typeof t === "number" ? slot(o, t) : (t as Mon); return (g.hpLeft(m) <= dmg ? 100 * (g.top(m).prizes ?? 1) : 0) - g.hpLeft(m) / 10; }, 1);
    }
    if (d.kind === "counters" || d.kind === "spiritual_end") {
      return top(m => (m as Mon).damage * (g.top(m as Mon).prizes ?? 1) - g.hpLeft(m as Mon) / 10, d.max);
    }
    if (d.kind.endsWith("_target")) return top(m => this.energyGap(g, m as Mon) * 10 + (g.top(m as Mon).attacks?.length ?? 0), 1);
    if (d.kind === "copy_attack") {
      // attacco copiato (Night Joker): il più forte, il costo dell'attacco copiato non conta
      return top(o => { const [card, i] = o as [number, number]; return atkDamage(g.def(card).attacks![i]); }, 1);
    }
    if (d.kind === "gwynn") return top(c => -this.keep(g, me, c as number), d.max);
    if (d.kind === "mill" || d.kind === "blender") {
      // scarta prima le carte che contano negli scarti (Hide 'n' Sneak), poi le meno utili
      return top(c => -this.keep(g, me, c as number), d.max);
    }
    if (d.kind === "naveen") return top(c => -this.keep(g, me, c as number), Math.max(d.min, g.p(me).hand.length - 3));
    if (DISCARD.has(d.kind)) return top(c => -this.keep(g, me, c as number), d.min);
    if (SEARCH.has(d.kind) || typeof d.options[0] === "number") {
      return top(c => this.want(g, me, c as number), d.max);
    }
    return idx.slice(0, d.max);
  }

  action(g: G, me: number, acts: Action[]): number {
    const p = g.p(me), o = g.p(1 - me);
    const benchMax = this.opts.benchMax ?? 4;
    const score = (a: Action): number => {
      switch (a.kind) {
        case "ability": {
          // le Abilità che pescano si usano con giudizio: con la mano piena o il mazzo corto si perde a mazzo finito
          if (!this.isDrawAbility(g, me, a)) return 70;
          if (p.deck.length <= 6) return -1;
          if (p.hand.length >= 7) return -1;
          return p.deck.length > 15 ? (p.hand.length <= 4 ? 70 : 30) : p.hand.length <= 3 ? 30 : -1;
        }
        case "evolve": return 80;
        case "bench": {
          // lascia un posto libero per le linee evolutive, metti prima ciò che serve al piano
          const v = this.benchValue(g, me, a.card);
          if (p.bench.length >= benchMax) return -1;
          if (p.bench.length >= benchMax - 1 && v < 60) return -1;
          return v >= 30 ? 25 + v / 2 : -1;
        }
        case "stadium": return p.hand.length >= 4 ? 20 : -1;
        case "attach": {
          const m = slot(p, a.target);
          const help = this.energyHelp(g, m, a.card);
          if (help <= 0) return -1;
          return (a.target === -1 ? 30 : 22) + help + (m === this.focus(g, me) ? 25 : 0);
        }
        case "trainer": return this.trainerScore(g, me, g.def(a.card), a.card);
        case "retreat": {
          if (!o.active || (g.s.turn === 1 && g.s.first === me)) return -1;
          const now = this.bestAttackValue(g, me);
          const then = this.valueIfActive(g, me, a.target);
          // conviene se il Pokémon in panchina fa molto di più, tenendo conto delle Energie scartate
          return then > now + 30 + 20 * retreatCost(g, p.active!) ? 30 : -1;
        }
        default: return -1;
      }
    };
    let best = -1, bestScore = 0;
    acts.forEach((a, i) => { const s = score(a); if (s > bestScore) { best = i; bestScore = s; } });
    if (best >= 0) return best;
    const attacks = acts.map((a, i) => [a, i] as const).filter(([a]) => a.kind === "attack");
    if (attacks.length && o.active) {
      let bi = attacks[0][1], bv = -Infinity;
      for (const [a, i] of attacks) {
        const v = this.attackValue(g, me, (a as { index: number }).index, (a as { from?: number }).from);
        if (v > bv) { bv = v; bi = i; }
      }
      return bi;
    }
    return acts.findIndex(a => a.kind === "end");
  }

  /**
   * Valore di un attacco provato su una copia della partita: danni e segnalini
   * fatti all'avversario, premi presi, vittoria. Così "30+" o Matcha Spin
   * vengono valutati per quello che fanno davvero in questa posizione.
   */
  attackValue(g: G, me: number, index: number, from?: number): number {
    const copy = new G(structuredClone(g.s), g.reg);
    const before = copy.inPlay(1 - me).reduce((s, m) => s + m.damage, 0);
    const prizes = copy.p(me).prizes.length;
    try {
      const it = attack(copy, index, from);
      let r = it.next();
      for (let guard = 0; !r.done && guard < 200; guard++) r = it.next(this.decide(copy, r.value));
    } catch (e) {
      if (e instanceof GameOver) return copy.s.winner === me ? 1e6 : -1e6;
      throw e;
    }
    const after = copy.inPlay(1 - me).reduce((s, m) => s + m.damage, 0);
    return (after - before) + 1000 * (prizes - copy.p(me).prizes.length);
  }

  bestAttackValue(g: G, me: number): number {
    const a = g.p(me).active;
    if (!a || a.used.no_attack === g.s.turn) return 0;
    let best = 0;
    (g.top(a).attacks ?? []).forEach((atk, i) => {
      if (canPay(g, a.energies, attackCost(g, a, atk))) best = Math.max(best, this.attackValue(g, me, i));
    });
    return best;
  }

  /** Valore del miglior attacco se il Pokémon in panchina `t` fosse l'attivo (provato su una copia). */
  valueIfActive(g: G, me: number, t: number): number {
    const copy = new G(structuredClone(g.s), g.reg);
    const p = copy.p(me);
    const nw = p.bench.splice(t, 1)[0];
    p.bench.push(p.active!);
    p.active = nw;
    return this.bestAttackValue(copy, me);
  }

  trainerScore(g: G, me: number, d: CardDef, card: number): number {
    const p = g.p(me), o = g.p(1 - me);
    if (d.name === "Boss's Orders" || d.name === "Prime Catcher" || d.name === "Pokémon Catcher") {
      const dmg = p.active ? this.bestDamage(g, p.active).dmg : 0;
      return o.bench.some(m => g.hpLeft(m) <= dmg) && !(o.active && g.hpLeft(o.active) <= dmg && (g.top(o.active).prizes ?? 1) >= 2) ? 45 : -1;
    }
    if (d.sub === "supporter") {
      if (d.name === "Black Belt's Training") return o.active && (g.top(o.active).tags ?? []).includes("ex") ? 10 : -1;
      if (p.deck.length < 10 && p.hand.length >= 4) return -1;
      return p.hand.length <= 5 ? 35 : 20;
    }
    if (d.sub === "stadium") return 15;
    if (d.sub === "tool") return 25;
    void card;
    return 40;
  }
}
