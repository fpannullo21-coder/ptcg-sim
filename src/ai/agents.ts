/** Giocatori semplici: casuale (per i test) e base con poche regole generali. */
import { G, rand, slot } from "../engine/game.js";
import type { Action, Decision, Mon, State } from "../engine/types.js";
import type { Agent } from "../engine/game.js";

/** Casualità propria dell'agente, separata da quella della partita. */
class Rng {
  s: Pick<State, "rng">;
  constructor(seed: number) { this.s = { rng: seed | 0 }; }
  next(): number { return rand(this.s as State); }
  int(n: number): number { return Math.floor(this.next() * n); }
}

export class RandomAgent implements Agent {
  rng: Rng;
  constructor(seed = 1) { this.rng = new Rng(seed); }
  decide(_g: G, d: Decision): number[] {
    const n = d.min + this.rng.int(d.max - d.min + 1);
    const idx = d.options.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, n);
  }
}

/** Panchina, evoluzione, Allenatori, Energia sull'attivo, poi l'attacco più forte. */
export class GreedyAgent implements Agent {
  decide(g: G, d: Decision): number[] {
    const p = g.p(d.player);
    const all = d.options.map((_, i) => i);
    switch (d.kind) {
      case "action": {
        const acts = d.options as Action[];
        const pick = (pred: (a: Action) => boolean) => acts.findIndex(pred);
        const order: ((a: Action) => boolean)[] = [
          a => a.kind === "bench" && p.bench.length < 4,
          a => a.kind === "evolve",
          a => a.kind === "trainer",
          a => a.kind === "ability",
          a => a.kind === "attach" && a.target === -1,
          a => a.kind === "attach",
        ];
        for (const pred of order) {
          const i = pick(pred);
          if (i >= 0) return [i];
        }
        const attacks = all.filter(i => acts[i].kind === "attack");
        if (attacks.length) {
          const atk = g.top(p.active!).attacks!;
          return [attacks.reduce((b, i) =>
            atk[(acts[i] as { index: number }).index].damage > atk[(acts[b] as { index: number }).index].damage ? i : b)];
        }
        return [pick(a => a.kind === "end")];
      }
      case "setup_active": {
        const cards = d.options as number[];
        return [all.reduce((b, i) => ((g.def(cards[i]).hp ?? 0) > (g.def(cards[b]).hp ?? 0) ? i : b))];
      }
      case "promote": {
        const score = (t: number) => { const m: Mon = slot(p, t); return m.energies.length * 1000 + g.hpLeft(m); };
        const opts = d.options as number[];
        return [all.reduce((b, i) => (score(opts[i]) > score(opts[b]) ? i : b))];
      }
      case "mulligan_draw":
        return [d.options.length - 1];
      default:
        return all.slice(0, d.max);
    }
  }
}
