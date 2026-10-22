/**
 * Giocatore con valutazione della posizione e ricerca di un passo.
 *
 * Per ogni azione possibile la prova su una copia della partita (le sotto-scelte,
 * come cosa cercare con Ultra Ball, le fa il giocatore base), valuta la posizione
 * che ne risulta e sceglie la migliore. Prima fa tutto ciò che migliora la
 * posizione, poi sceglie tra attaccare e passare.
 *
 * La valutazione guarda: premi, danni sui Pokémon (pesati per i premi che valgono),
 * attaccanti pronti o quasi pronti, minacce di KO al prossimo turno, sviluppo del
 * campo, carte in mano e nel mazzo.
 */
import { apply, attackCost, canPay, G, GameOver, legalActions, maxHp } from "../engine/game.js";
import type { Action, Decision, Mon } from "../engine/types.js";
import { BasicAgent } from "./basic.js";
import { atkDamage } from "./plan.js";

export interface EvalWeights {
  prize: number; damage: number; ready: number; nearly: number; threat: number;
  bench: number; evolved: number; energy: number; hand: number; deckLow: number; oppReady: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  prize: 1000, damage: 350, ready: 2.2, nearly: 0.8, threat: 250,
  bench: 35, evolved: 60, energy: 18, hand: 14, deckLow: 120, oppReady: 1.2,
};

export class EvalAgent extends BasicAgent {
  w: EvalWeights;
  constructor(opts: { benchMax?: number; weights?: Partial<EvalWeights> } = {}) {
    super(opts);
    this.w = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  }

  /** Miglior danno stampato o stimato di un Pokémon e quante Energie gli mancano per usarlo. */
  potential(g: G, m: Mon): { dmg: number; need: number } {
    let best = { dmg: 0, need: 9 };
    for (const a of g.top(m).attacks ?? []) {
      if (m.used["lock:" + a.name] === g.s.turn + 1) continue;
      const dmg = atkDamage(a);
      const need = this.need(g, m.energies, attackCost(g, m, a));
      if (dmg - 40 * need > best.dmg - 40 * best.need) best = { dmg, need };
    }
    return best;
  }

  /** Valutazione della posizione dal punto di vista di `me`. */
  evaluate(g: G, me: number): number {
    const w = this.w, s = g.s;
    if (s.winner === me) return 1e7;
    if (s.winner === 1 - me) return -1e7;
    const p = g.p(me), o = g.p(1 - me);
    let v = w.prize * (o.prizes.length - p.prizes.length);
    const side = (who: number, sign: number) => {
      const mons = g.inPlay(who);
      let readySum: number[] = [];
      for (const m of mons) {
        const hp = maxHp(g, m), prizes = g.top(m).prizes ?? 1;
        v -= sign * w.damage * prizes * Math.min(1, m.damage / Math.max(1, hp)) * (m.damage >= hp - 10 ? 1.3 : 1);
        if (g.top(m).sub !== "basic") v += sign * w.evolved;
        v += sign * w.energy * Math.min(m.energies.length, 4);
        const pot = this.potential(g, m);
        readySum.push(pot.need === 0 ? w.ready * pot.dmg : w.nearly * pot.dmg / (1 + pot.need));
      }
      readySum = readySum.sort((a, b) => b - a).slice(0, 2);
      const r = readySum.reduce((a, b) => a + b, 0);
      v += sign * (sign > 0 ? r : r * (w.oppReady / w.ready));
      v += sign * w.bench * Math.min(g.p(who).bench.length, 4);
    };
    side(me, 1);
    side(1 - me, -1);
    // minaccia: il mio attivo può mettere KO l'attivo avversario al prossimo turno (e viceversa)
    if (p.active && o.active) {
      const mine = this.potential(g, p.active), theirs = this.potential(g, o.active);
      if (mine.need <= 1 && mine.dmg >= g.hpLeft(o.active)) v += w.threat * (g.top(o.active).prizes ?? 1);
      if (theirs.need <= 1 && theirs.dmg >= g.hpLeft(p.active)) v -= w.threat * (g.top(p.active).prizes ?? 1);
    }
    v += w.hand * Math.min(p.hand.length, 8);
    if (p.deck.length < 6) v -= w.deckLow * (6 - p.deck.length);
    return v;
  }

  /** Esegue un'azione sulla copia, con le sotto-scelte del giocatore base. Vero se il turno è finito. */
  private run(copy: G, a: Action): boolean {
    const it = apply(copy, a);
    let r = it.next();
    for (let guard = 0; !r.done && guard < 300; guard++) r = it.next(super.decide(copy, r.value));
    return r.done ? (r.value as boolean) : true;
  }

  /**
   * Prova un'azione su una copia e lascia finire il turno al giocatore base:
   * così si vedono anche le combinazioni (Ultra Ball, poi panchina, poi Energia, poi attacco).
   */
  tryAction(g: G, me: number, a: Action): number {
    const copy = new G(structuredClone(g.s), g.reg);
    try {
      let done = this.run(copy, a);
      for (let k = 0; !done && k < 40; k++) {
        const acts = legalActions(copy);
        const b = acts[super.decide(copy, { player: me, kind: "action", options: acts, min: 1, max: 1 })[0]];
        if (b.kind === "end") break;
        done = this.run(copy, b);
      }
    } catch (e) {
      if (e instanceof GameOver) return copy.s.winner === me ? 1e7 : -1e7;
      throw e;
    }
    return this.evaluate(copy, me);
  }

  override decide(g: G, d: Decision): number[] {
    if (d.kind !== "action") return super.decide(g, d);
    const me = d.player;
    const acts = d.options as Action[];
    // candidati: la scelta del giocatore base, gli attacchi, la fine del turno e le altre azioni (al massimo `width`)
    const base = super.decide(g, d)[0];
    const others = acts.map((_, i) => i).filter(i => i !== base && acts[i].kind !== "end" && acts[i].kind !== "attack");
    const pickOthers = others.length > this.width ? others.filter((_, k) => k % Math.ceil(others.length / this.width) === 0) : others;
    const cands = [...new Set([base, ...acts.map((a, i) => (a.kind === "attack" || a.kind === "end" ? i : -1)).filter(i => i >= 0), ...pickOthers])];
    let bi = base, bv = -Infinity;
    for (const i of cands) {
      const v = acts[i].kind === "end" ? this.evaluate(g, me) : this.tryAction(g, me, acts[i]);
      if (v > bv + (i === base ? -1 : 0)) { bv = v; bi = i; }
    }
    return [bi];
  }

  width = 6;
}

void canPay;
