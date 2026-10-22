/**
 * Giocatore Monte Carlo.
 *
 * Per ogni scelta di azione prende alcune mosse candidate e, per ciascuna, gioca
 * `rollouts` continuazioni su copie della partita con il giocatore base per tutti
 * e due i giocatori, fino a `depth` turni più avanti; poi valuta la posizione
 * (o il risultato, se la partita è finita) e sceglie la mossa con la media migliore.
 *
 * Non bara: prima di ogni continuazione le carte che non conosce (mano e mazzo
 * dell'avversario, il proprio mazzo, tutti i premi) vengono rimescolate tra loro
 * (determinizzazione). Ogni continuazione usa lo stesso rimescolamento per tutte
 * le mosse candidate (numeri casuali comuni), così il confronto è più preciso.
 */
import { apply, G, GameOver, playOn, rand, shuffle } from "../engine/game.js";
import type { Action, Decision, Gen, State } from "../engine/types.js";
import { BasicAgent } from "./basic.js";
import { EvalAgent } from "./eval.js";

export interface MCOptions {
  rollouts?: number;   // continuazioni per mossa
  depth?: number;      // turni giocati dopo la mossa (2 = fino alla fine del mio prossimo turno)
  width?: number;      // mosse candidate al massimo
  seed?: number;
}

export class MonteCarloAgent extends EvalAgent {
  rollouts: number; depth: number; mcWidth: number;
  private rng: { rng: number };
  private policy = new BasicAgent({ fast: true });

  constructor(o: MCOptions = {}) {
    super();
    this.rollouts = o.rollouts ?? 8;
    this.depth = o.depth ?? 2;
    this.mcWidth = o.width ?? 6;
    this.rng = { rng: o.seed ?? 12345 };
  }

  /** Copia della partita con le carte sconosciute a `me` rimescolate. */
  determinize(g: G, me: number, seed: number): G {
    const s: State = structuredClone(g.s);
    s.rng = seed;
    const opp = s.players[1 - me], mine = s.players[me];
    const hidden = [...opp.hand, ...opp.deck, ...opp.prizes];
    shuffle(s, hidden);
    opp.hand = hidden.splice(0, opp.hand.length);
    opp.prizes = hidden.splice(0, opp.prizes.length);
    opp.deck = hidden;
    const mineHidden = [...mine.deck, ...mine.prizes];
    shuffle(s, mineHidden);
    mine.prizes = mineHidden.splice(0, mine.prizes.length);
    mine.deck = mineHidden;
    return new G(s, g.reg);
  }

  /** Esegue un generatore rispondendo con il giocatore base. */
  private drive(copy: G, it: Gen<unknown>): unknown {
    let r = it.next();
    for (let k = 0; !r.done && k < 20000; k++) r = it.next(this.policy.decide(copy, r.value as Decision));
    return r.value;
  }

  /** Valore (tra -1 e 1) di una mossa in una continuazione. */
  private rollout(g: G, me: number, a: Action, seed: number): number {
    const copy = this.determinize(g, me, seed);
    const until = copy.s.turn + this.depth;
    try {
      const ended = this.drive(copy, apply(copy, a)) as boolean;
      this.drive(copy, playOn(copy, ended, until));
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    if (copy.s.winner === me) return 1;
    if (copy.s.winner === 1 - me) return -1;
    if (copy.s.winner === -1) return 0;
    return Math.tanh(this.evaluate(copy, me) / 1500);
  }

  override decide(g: G, d: Decision): number[] {
    if (d.kind !== "action") return this.policy.decide(g, d);
    const me = d.player, acts = d.options as Action[];
    if (acts.length === 1) return [0];
    // candidati: la scelta del giocatore base, gli attacchi, la fine del turno e qualche altra azione
    const base = this.policy.decide(g, d)[0];
    const others = acts.map((_, i) => i).filter(i => i !== base && acts[i].kind !== "end" && acts[i].kind !== "attack");
    const step = Math.max(1, Math.ceil(others.length / Math.max(1, this.mcWidth - 2)));
    const cands = [...new Set([base, ...acts.map((a, i) => (a.kind === "attack" || a.kind === "end" ? i : -1)).filter(i => i >= 0), ...others.filter((_, k) => k % step === 0)])];
    if (cands.length === 1) return [cands[0]];
    const seeds = Array.from({ length: this.rollouts }, () => Math.floor(rand(this.rng as State) * 2 ** 30));
    let bi = base, bv = -Infinity;
    for (const i of cands) {
      let v = 0;
      for (const sd of seeds) v += this.rollout(g, me, acts[i], sd);
      v /= seeds.length;
      if (i === base) v += 0.02; // a parità, la mossa del giocatore base
      if (v > bv) { bv = v; bi = i; }
    }
    return [bi];
  }
}
