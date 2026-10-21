/** Allenatori ed Energie del meta (secondo blocco). */
import type { Impl } from "../registry.js";
import * as fx from "../effects.js";
import { slots, slot } from "../../engine/game.js";

type G = Parameters<typeof fx.draw>[0];
const typeOf = (g: G, c: number) => g.def(c).provides;

export const TRAINERS: Impl[] = [
  // --- Supporter ---
  {
    name: "Crispin",
    *play(g, me) {
      const p = g.p(me);
      const picks: number[] = [];
      const first = yield* fx.choose(g, me, "crispin", p.deck.filter(c => fx.isBasicEnergy(g, c)), 0, 1);
      picks.push(...first);
      if (first.length) {
        const t0 = typeOf(g, first[0]);
        picks.push(...(yield* fx.choose(g, me, "crispin", p.deck.filter(c => fx.isBasicEnergy(g, c) && typeOf(g, c) !== t0), 0, 1)));
      }
      for (const c of picks) p.deck.splice(p.deck.indexOf(c), 1);
      if (picks.length === 2) {
        const toAttach = yield* fx.chooseOne(g, me, "crispin_attach", picks);
        const t = yield* fx.chooseOne(g, me, "attach_discard_target", g.inPlay(me));
        t.energies.push(toAttach);
        p.hand.push(...picks.filter(c => c !== toAttach));
      } else {
        p.hand.push(...picks);
      }
      fx.shuffleDeck(g, me);
    },
  },
  { name: "Judge", *play(g, me) { fx.shuffleBoth(g, me, 4, 4); } },
  {
    name: "Dawn",
    *play(g, me) {
      for (const st of ["basic", "stage1", "stage2"]) {
        yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).kind === "pokemon" && gg.def(c).sub === st, 1, "hand", 0, "search");
      }
    },
  },
  {
    name: "Rosa's Encouragement",
    canPlay: (g, me) => g.p(me).prizes.length > g.p(1 - me).prizes.length && g.inPlay(me).some(m => g.top(m).sub === "stage2"),
    *play(g, me) {
      const p = g.p(me);
      const t = yield* fx.chooseOne(g, me, "attach_discard_target", g.inPlay(me).filter(m => g.top(m).sub === "stage2"));
      for (const c of yield* fx.choose(g, me, "attach_discard", p.discard.filter(c => fx.isBasicEnergy(g, c)), 0, 2)) {
        p.discard.splice(p.discard.indexOf(c), 1);
        t.energies.push(c);
      }
    },
  },
  // --- Oggetti ---
  {
    name: "Special Red Card",
    canPlay: (g, me) => g.p(1 - me).prizes.length <= 3,
    *play(g, me) {
      const o = g.p(1 - me);
      if (!o.hand.length) return;
      fx.shuffleInto(g, 1 - me);
      fx.draw(g, 1 - me, 3);
    },
  },
  {
    name: "Unfair Stamp",
    canPlay: (g, me) => fx.koLastTurn(g, me),
    *play(g, me) { fx.shuffleBoth(g, me, 5, 2); },
  },
  {
    name: "Crushing Hammer",
    canPlay: (g, me) => g.inPlay(1 - me).some(m => m.energies.length > 0),
    *play(g, me) {
      if (!fx.flip(g)) return;
      const t = yield* fx.chooseOne(g, me, "hammer", g.inPlay(1 - me).filter(m => m.energies.length > 0));
      const e = yield* fx.chooseOne(g, me, "hammer_energy", t.energies);
      t.energies.splice(t.energies.indexOf(e), 1);
      g.p(1 - me).discard.push(e);
    },
  },
  {
    name: "Rare Candy",
    canPlay: (g, me) => g.s.turn > 2 && fx.rareCandyTargets(g, me).length > 0,
    *play(g, me) {
      const pairs = fx.rareCandyTargets(g, me);
      const [m, card] = yield* fx.chooseOne(g, me, "rare_candy", pairs);
      yield* fx.evolveWith(g, me, m, card);
    },
  },
  // --- Stadi ---
  {
    name: "Risky Ruins",
    passive: {
      benched: (g, mon) => {
        const d = g.top(mon);
        if (d.sub === "basic" && d.type !== "D") mon.damage += 20;
      },
    },
  },
  { name: "Team Rocket's Watchtower", tags: ["colorless_no_abilities"] },
];

void slots; void slot;
