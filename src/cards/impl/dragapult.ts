/** Dragapult ex e i Pokémon che lo accompagnano (Dusknoir, Blaziken, Munkidori, Budew, Chi-Yu). */
import type { Impl } from "../registry.js";
import type { Mon } from "../../engine/types.js";
import * as fx from "../effects.js";
import { abilitiesOff } from "../../engine/game.js";

const hasDarkEnergy = (g: Parameters<typeof fx.draw>[0], m: Mon) => m.energies.some(e => g.def(e).provides === "D" || g.def(e).provides === "*");
const watchfulEye = (g: Parameters<typeof fx.draw>[0]) =>
  [0, 1].some(i => g.inPlay(i).some(m => (g.top(m).tags ?? []).includes("watchful_eye") && !abilitiesOff(g, m)));

/** Cursed Blast: n segnalini su un Pokémon avversario, poi questo Pokémon va KO. */
const cursedBlast = (n: number) => ({
  canUse: (g: Parameters<typeof fx.draw>[0], me: number) => !fx.dampInPlay(g) && g.inPlay(1 - me).some(m => !fx.prevented(g, m, me)),
  *use(g: Parameters<typeof fx.draw>[0], me: number, mon: Mon) {
    const pool = g.inPlay(1 - me).filter(m => !fx.prevented(g, m, me) && !fx.benchCountersBlocked(g, m, me));
    if (!pool.length) { mon.damage = Math.max(mon.damage, fx.maxHp(g, mon)); return; }
    const t = yield* fx.chooseOne(g, me, "counters", pool);
    t.damage += 10 * n;
    mon.damage = Math.max(mon.damage, fx.maxHp(g, mon));
  },
});

export const DRAGAPULT: Impl[] = [
  {
    name: "Drakloak",
    abilities: {
      "Recon Directive": {
        canUse: (g, me) => g.p(me).deck.length > 0,
        *use(g, me) { yield* fx.lookTop(g, me, 2, fx.any, 1, 1, "bottom", "recon"); },
      },
    },
  },
  {
    name: "Dragapult ex",
    attacks: {
      "Phantom Dive": { *after(g, me) { yield* fx.placeCounters(g, me, 6, "opp", "counters", m => m !== g.p(1 - me).active); } },
    },
  },
  {
    name: "Duskull",
    version: c => (c.attacks ?? []).some(a => a.name === "Come and Get You"),
    attacks: {
      "Come and Get You": {
        *effect(g, me) {
          const p = g.p(me);
          const pool = p.discard.filter(c => g.def(c).name === "Duskull");
          for (const c of yield* fx.choose(g, me, "recover", pool, 0, Math.min(3, fx.benchFree(g, me)))) {
            p.discard.splice(p.discard.indexOf(c), 1);
            fx.benchCard(g, me, c);
          }
        },
      },
    },
  },
  { name: "Dusclops", abilities: { "Cursed Blast": cursedBlast(5) } },
  {
    name: "Dusknoir",
    abilities: { "Cursed Blast": cursedBlast(13) },
    attacks: {
      "Shadow Bind": { *after(g, me) { const o = g.p(1 - me).active; if (o && !fx.prevented(g, o, me)) o.used.no_retreat = g.s.turn + 1; } },
    },
  },
  {
    name: "Budew",
    attacks: {
      "Itchy Pollen": { *after(g, me) { fx.untilOpponentsNextTurn(g, me, fx.topCard(g.p(me).active!)); } },
    },
    turnPassive: { blocks: (_g, player, what, _c, owner) => what === "item" && player !== owner },
  },
  {
    name: "Patrat",
    version: c => (c.abilities ?? []).some(a => a.name === "Watchful Eye"),
    abilities: {},
    covers: ["Watchful Eye"],
    tags: ["watchful_eye"],
  },
  {
    name: "Munkidori",
    abilities: {
      "Adrena-Brain": {
        canUse: (g, me, mon) => hasDarkEnergy(g, mon) && g.inPlay(me).some(m => m.damage > 0) && !watchfulEye(g),
        *use(g, me) {
          const from = yield* fx.chooseOne(g, me, "counters_from", g.inPlay(me).filter(m => m.damage > 0));
          const pool = g.inPlay(1 - me).filter(m => !fx.prevented(g, m, me));
          if (!pool.length) return;
          const to = yield* fx.chooseOne(g, me, "counters", pool);
          fx.moveCounters(from, to, 3);
        },
      },
    },
    attacks: {
      "Mind Bend": {
        *after(g, me) {
          const o = g.p(1 - me).active;
          if (o) fx.inflict(g, me, o, "confused");
        },
      },
    },
  },
  {
    name: "Torchic",
    version: c => (c.attacks ?? []).some(a => a.name === "Collect"),
    attacks: { Collect: { *effect(g, me) { fx.draw(g, me, 1); } } },
  },
  {
    name: "Combusken",
    version: c => (c.attacks ?? []).some(a => a.name === "Double Kick"),
    attacks: { "Double Kick": { *effect(g) { return 40 * ((fx.flip(g) ? 1 : 0) + (fx.flip(g) ? 1 : 0)); } } },
  },
  {
    name: "Blaziken ex",
    abilities: {
      "Seething Spirit": {
        canUse: (g, me) => g.p(me).discard.some(c => fx.isBasicEnergy(g, c)),
        *use(g, me) { yield* fx.attachFromDiscard(g, me, fx.isBasicEnergy, 1, "attach_discard", 1); },
      },
    },
    attacks: { "Smolder-sault": { *after(g, me) { g.p(me).active!.used.no_attack = g.s.turn + 2; } } },
  },
  {
    name: "Chi-Yu",
    version: c => (c.attacks ?? []).some(a => a.name === "Ground Melter"),
    attacks: {
      Allure: { *effect(g, me) { fx.draw(g, me, 2); } },
      "Ground Melter": {
        *effect(g) { return g.s.stadium !== null ? 120 : 60; },
        *after(g) { fx.discardStadium(g); },
      },
    },
  },
  {
    name: "Meowth ex",
    abilities: {
      "Last-Ditch Catch": {
        trigger: "bench",
        canUse: (g, me) => g.p(me).flags.last_ditch !== g.s.turn,
        *use(g, me) {
          g.p(me).flags.last_ditch = g.s.turn;
          yield* fx.searchDeck(g, me, fx.isSupporter, 1, "hand", 0, "search");
        },
      },
    },
    attacks: {
      "Tuck Tail": {
        *after(g, me) {
          const p = g.p(me), m = p.active;
          if (!m) return;
          p.active = null;
          p.hand.push(...m.stack, ...m.energies, ...m.tools);
        },
      },
    },
  },
  {
    name: "Fezandipiti ex",
    abilities: {
      "Flip the Script": {
        canUse: (g, me) => fx.koLastTurn(g, me) && g.p(me).flags.flip_script !== g.s.turn && g.p(me).deck.length > 0,
        *use(g, me) { g.p(me).flags.flip_script = g.s.turn; fx.draw(g, me, 3); },
      },
    },
    attacks: {
      "Cruel Arrow": {
        *effect(g, me) {
          const t = yield* fx.chooseOne(g, me, "snipe", g.inPlay(1 - me));
          fx.damageTo(g, me, t, 100);
          return 0;
        },
      },
    },
  },
];
