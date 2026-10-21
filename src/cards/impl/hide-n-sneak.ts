/** Hide n' Sneak (Pitch Black) e i Pokémon che lo accompagnano. */
import type { Impl } from "../registry.js";
import type { Passive } from "../../engine/types.js";
import * as fx from "../effects.js";

const HNS = fx.hasTag("hide_n_sneak");
const hnsInDiscard = (g: Parameters<typeof fx.countDiscard>[0], me: number) => fx.countDiscard(g, me, HNS);

/** Hide 'n' Sneak: niente effetti di attacchi e Abilità avversari su questo Pokémon (il danno resta). */
export const hideNSneak: Passive = {
  preventsEffects: (_g, target, source, owner, self) => target === self && source !== owner,
};
const hns = { abilities: {}, covers: ["Hide 'n' Sneak"], passive: hideNSneak };

export const HIDE_N_SNEAK: Impl[] = [
  { name: "Shuppet", ...hns },
  {
    name: "Banette", ...hns,
    attacks: {
      "Puppet Pull": { *effect(g, me) { yield* fx.searchDeck(g, me, fx.any, 1, "hand", 0, "puppet_pull"); } },
    },
  },
  {
    name: "Poltchageist", ...hns,
    attacks: {
      "Furtive Drop": {
        *effect(g, me) {
          const a = g.p(1 - me).active;
          if (a && !fx.prevented(g, a, me)) a.damage += 10;
        },
      },
    },
  },
  {
    name: "Sinistcha", ...hns,
    attacks: {
      "Matcha Spin": { *effect(g, me) { if (hnsInDiscard(g, me) >= 6) fx.countersEach(g, me, 4); } },
    },
  },
  {
    name: "Dhelmise",
    version: c => (c.attacks ?? []).some(a => a.name === "Vengeful Anchor"),
    attacks: {
      "Vengeful Anchor": { *effect(g, me) { return 30 + (hnsInDiscard(g, me) >= 4 ? 140 : 0); } },
    },
  },
  {
    name: "Spiritomb",
    version: c => (c.attacks ?? []).some(a => a.name === "Spiritual End"),
    attacks: {
      "Spiritual End": {
        *effect(g, me) {
          if (hnsInDiscard(g, me) < 13) return;
          const pool = g.inPlay(1 - me).filter(m => !fx.prevented(g, m, me) && m.damage > 0);
          for (const m of yield* fx.choose(g, me, "spiritual_end", pool, Math.min(2, pool.length), 2)) m.damage *= 4;
        },
      },
    },
  },
  {
    name: "Telepathic Psychic Energy",
    provides: "P",
    *onAttach(g, me, mon) {
      if (g.top(mon).type !== "P") return;
      yield* fx.searchDeck(g, me, fx.and(fx.isBasicPokemon, fx.ofType("P")), 2, "bench", 0, "telepathic");
    },
  },
  // Dunsparce TEF / Dudunsparce TEF: la linea di pescata usata nelle liste con Dunsparce
  {
    name: "Dunsparce",
    version: c => (c.attacks ?? []).some(a => a.name === "Dig"),
    attacks: {
      Dig: { *effect(g, me) { if (fx.flip(g)) g.p(me).active!.used.protect = g.s.turn + 1; } },
    },
  },
  {
    name: "Dudunsparce",
    version: c => (c.abilities ?? []).some(a => a.name === "Run Away Draw"),
    abilities: {
      "Run Away Draw": {
        canUse: (g, me, mon) => g.p(me).deck.length > 0 && (mon !== g.p(me).active || g.p(me).bench.length > 0),
        *use(g, me, mon) {
          const p = g.p(me);
          fx.draw(g, me, 3);
          if (p.active === mon) p.active = null;
          else p.bench.splice(p.bench.indexOf(mon), 1);
          p.deck.push(...mon.stack, ...mon.energies, ...mon.tools);
          fx.shuffleDeck(g, me);
        },
      },
    },
  },
  {
    name: "Dudunsparce ex",
    attacks: {
      "Tenacious Tail": { *effect(g, me) { return 60 * g.inPlay(1 - me).filter(m => (g.top(m).tags ?? []).includes("ex")).length; } },
    },
    covers: ["Destructive Drill"], // ignora gli effetti sull'attivo avversario: per ora danno pieno
  },
];
