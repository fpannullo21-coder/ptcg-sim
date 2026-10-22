/** Basic Box (Kangaskhan, Ogerpon, Raging Bolt, Iron) e Slowking. */
import type { Impl } from "../registry.js";
import type { Mon } from "../../engine/types.js";
import * as fx from "../effects.js";
import { switchActive } from "../../engine/game.js";

type G = Parameters<typeof fx.draw>[0];
const tags = (g: G, m: Mon) => g.top(m).tags ?? [];
const hasTera = (g: G, me: number) => g.inPlay(me).some(m => tags(g, m).includes("tera"));

/** Scarta tutte le Energie dal Pokémon che attacca; Boomerang Energy resta attaccata. */
export function discardAllEnergy(g: G, me: number, m: Mon): void {
  const keep = m.energies.filter(e => g.def(e).name === "Boomerang Energy");
  for (const e of m.energies) if (!keep.includes(e)) g.p(me).discard.push(e);
  m.energies = keep;
}

/** Danno fisso a k Pokémon avversari scelti (niente debolezza e resistenza in panchina). */
function* spread(g: G, me: number, k: number, dmg: number, only: (m: Mon) => boolean = () => true, noWR = false) {
  const pool = g.inPlay(1 - me).filter(only);
  for (const t of yield* fx.choose(g, me, "snipe", pool, Math.min(k, pool.length), k)) {
    if (noWR) t.damage += dmg;
    else fx.damageTo(g, me, t, dmg);
  }
}

export const BOXES: Impl[] = [
  {
    name: "Mega Kangaskhan ex",
    abilities: {
      "Run Errand": {
        canUse: (g, me, mon) => g.p(me).active === mon && g.p(me).flags.run_errand !== g.s.turn && g.p(me).deck.length > 0,
        *use(g, me) { g.p(me).flags.run_errand = g.s.turn; fx.draw(g, me, 2); },
      },
    },
    attacks: {
      "Rapid-Fire Combo": { *effect(g) { let d = 200; while (fx.flip(g)) d += 50; return d; } },
    },
  },
  {
    name: "Teal Mask Ogerpon ex",
    abilities: {
      "Teal Dance": {
        canUse: (g, me) => g.p(me).hand.some(c => fx.isBasicEnergy(g, c) && g.def(c).provides === "G"),
        *use(g, me, mon) {
          const p = g.p(me);
          const e = yield* fx.chooseOne(g, me, "teal_dance", p.hand.filter(c => fx.isBasicEnergy(g, c) && g.def(c).provides === "G"));
          p.hand.splice(p.hand.indexOf(e), 1);
          mon.energies.push(e);
          fx.draw(g, me, 1);
        },
      },
    },
    attacks: {
      "Myriad Leaf Shower": {
        *effect(g, me) { return 30 + 30 * ((g.p(me).active?.energies.length ?? 0) + (g.p(1 - me).active?.energies.length ?? 0)); },
      },
    },
  },
  {
    name: "Chien-Pao",
    version: c => (c.abilities ?? []).some(a => a.name === "Snow Sink"),
    abilities: {
      "Snow Sink": { trigger: "bench", canUse: g => g.s.stadium !== null, *use(g) { fx.discardStadium(g); } },
    },
    attacks: {
      "Icicle Loop": {
        *after(g, me) {
          const m = g.p(me).active;
          if (!m?.energies.length) return;
          const e = yield* fx.chooseOne(g, me, "return_energy", m.energies);
          m.energies.splice(m.energies.indexOf(e), 1);
          g.p(me).hand.push(e);
        },
      },
    },
  },
  {
    name: "Raging Bolt ex",
    attacks: {
      "Burst Roar": { *effect(g, me) { fx.discardHand(g, me); fx.draw(g, me, 6); } },
      "Bellowing Thunder": {
        *effect(g, me) {
          const p = g.p(me);
          const pool: [Mon, number][] = g.inPlay(me).flatMap(m => m.energies.filter(e => fx.isBasicEnergy(g, e)).map(e => [m, e] as [Mon, number]));
          const picks = yield* fx.choose(g, me, "bolt_discard", pool, 0, pool.length);
          for (const [m, e] of picks) { m.energies.splice(m.energies.indexOf(e), 1); p.discard.push(e); }
          return 70 * picks.length;
        },
      },
    },
  },
  {
    name: "Iron Leaves ex",
    abilities: {
      "Rapid Vernier": {
        trigger: "bench",
        *use(g, me, mon) {
          const p = g.p(me);
          switchActive(p, p.bench.indexOf(mon));
          for (const from of g.inPlay(me).filter(m => m !== mon)) {
            for (const e of yield* fx.choose(g, me, "move_energy", [...from.energies], 0, from.energies.length)) {
              from.energies.splice(from.energies.indexOf(e), 1);
              mon.energies.push(e);
            }
          }
        },
      },
    },
    attacks: { "Prism Edge": { *after(g, me) { g.p(me).active!.used.no_attack = g.s.turn + 2; } } },
  },
  {
    name: "Enamorus",
    version: c => (c.attacks ?? []).some(a => a.name === "Love Resonance"),
    attacks: {
      "Love Resonance": {
        *effect(g, me) {
          const mine = new Set(g.inPlay(me).map(m => g.top(m).type));
          return g.inPlay(1 - me).some(m => mine.has(g.top(m).type)) ? 200 : 80;
        },
      },
    },
  },
  {
    name: "Iron Crown ex",
    abilities: {},
    covers: ["Cobalt Command"],
    passive: {
      damageBefore: (g, ctx, owner) =>
        ctx.attackerOwner === owner && ctx.toActive && ctx.targetOwner !== owner && tags(g, ctx.attacker).includes("future") && g.top(ctx.attacker).name !== "Iron Crown ex"
          ? ctx.damage + 20 : ctx.damage,
    },
    attacks: { "Twin Shotels": { *effect(g, me) { yield* spread(g, me, 2, 50, () => true, true); return 0; } } },
  },
  {
    name: "Wellspring Mask Ogerpon ex",
    attacks: {
      Sob: { *after(g, me) { const o = g.p(1 - me).active; if (o && !fx.prevented(g, o, me)) o.used.no_retreat = g.s.turn + 1; } },
      "Torrential Pump": {
        *after(g, me) {
          const m = g.p(me).active!, o = g.p(1 - me);
          if (m.energies.length < 3 || !o.bench.length) return;
          if (!(yield* fx.choose(g, me, "torrential_pump", ["sì"], 0, 1)).length) return;
          const back = yield* fx.choose(g, me, "return_energy", [...m.energies], 3, 3);
          for (const e of back) { m.energies.splice(m.energies.indexOf(e), 1); g.p(me).deck.push(e); }
          fx.shuffleDeck(g, me);
          const t = yield* fx.chooseOne(g, me, "snipe", o.bench);
          fx.damageTo(g, me, t, 120);
        },
      },
    },
  },
  {
    name: "Passimian",
    version: c => (c.attacks ?? []).some(a => a.name === "Coordinated Throwing"),
    attacks: { "Coordinated Throwing": { *effect(g, me) { return 20 * g.inPlay(me).filter(m => g.top(m).sub === "basic").length; } } },
  },
  // --- Slowking ---
  {
    name: "Slowpoke",
    version: c => (c.attacks ?? []).some(a => a.name === "Dangle Tail"),
    attacks: { "Dangle Tail": { *effect(g, me) { yield* fx.recover(g, me, fx.isPokemon, 1, "hand", "recover"); } } },
  },
  {
    name: "Slowking",
    version: c => (c.attacks ?? []).some(a => a.name === "Seek Inspiration"),
    attacks: {
      "Seek Inspiration": {
        *effect(g, me) {
          const p = g.p(me), m = p.active!;
          if (!p.deck.length) return 0;
          const c = p.deck.pop()!;
          p.discard.push(c);
          const d = g.def(c);
          if (d.kind !== "pokemon" || (d.tags ?? []).includes("ex") || (d.tags ?? []).includes("mega") || !d.attacks?.length) return 0;
          const [, idx] = yield* fx.chooseOne(g, me, "copy_attack", d.attacks.map((_, i) => [c, i] as [number, number]));
          const atk = d.attacks[idx];
          m.used.copied = c * 10 + idx;
          if (atk.effect) { const r = yield* atk.effect(g, me); if (typeof r === "number") return r; }
          return atk.damage;
        },
        *after(g, me) {
          const m = g.p(me).active;
          if (!m || m.used.copied === undefined) return;
          const c = Math.floor(m.used.copied / 10), atk = g.def(c).attacks![m.used.copied % 10];
          delete m.used.copied;
          if (atk.after) yield* atk.after(g, me);
        },
      },
    },
  },
  {
    name: "Metagross",
    version: c => (c.attacks ?? []).some(a => a.name === "Bounce Back"),
    attacks: {
      "Bounce Back": {
        *after(g, me) {
          const o = g.p(1 - me);
          if (!o.bench.length) return;
          switchActive(o, yield* fx.chooseOne(g, 1 - me, "switch", o.bench.map((_, i) => i)));
        },
      },
      "Metallic Hammer": {
        *effect(g, me) {
          const m = g.p(me).active!;
          const metal = m.energies.filter(e => g.def(e).provides === "M" || g.def(e).provides === "*");
          if (metal.length < 3 || !(yield* fx.choose(g, me, "metallic_hammer", ["sì"], 0, 1)).length) return 150;
          for (const e of metal.slice(0, 3)) { m.energies.splice(m.energies.indexOf(e), 1); g.p(me).discard.push(e); }
          return 300;
        },
      },
    },
  },
  {
    name: "Kyurem",
    version: c => (c.attacks ?? []).some(a => a.name === "Trifrost"),
    covers: ["Plasma Bane"],
    abilities: {},
    attacks: {
      Trifrost: {
        *effect(g, me) {
          discardAllEnergy(g, me, g.p(me).active!);
          yield* spread(g, me, 3, 110);
          return 0;
        },
      },
    },
  },
  {
    name: "Annihilape",
    version: c => (c.abilities ?? []).some(a => a.name === "Durable Body"),
    abilities: {},
    covers: ["Durable Body"],
    passive: { survives: (g, mon, _mo, _o, self) => mon === self && fx.flip(g) },
    attacks: {
      "Ghostly Blow": {
        *after(g, me) {
          const pool = g.p(1 - me).bench.filter(m => !fx.prevented(g, m, me));
          if (pool.length) (yield* fx.chooseOne(g, me, "counters", pool)).damage += 50;
        },
      },
    },
  },
  {
    name: "Zeraora",
    version: c => (c.attacks ?? []).some(a => a.name === "Thunder Raid"),
    attacks: {
      "Thunder Raid": {
        *effect(g, me) {
          discardAllEnergy(g, me, g.p(me).active!);
          yield* spread(g, me, 1, 210, m => m !== g.p(1 - me).active && tags(g, m).includes("ex"));
          return 0;
        },
      },
    },
  },
  // --- Allenatori ---
  { name: "Cyrano", *play(g, me) { yield* fx.searchDeck(g, me, (gg, c) => (gg.def(c).tags ?? []).includes("ex"), 3, "hand", 0, "search"); } },
  {
    name: "Ciphermaniac's Codebreaking",
    canPlay: (g, me) => g.p(me).deck.length >= 2,
    *play(g, me) {
      const p = g.p(me);
      const picks = yield* fx.choose(g, me, "ciphermaniac", [...p.deck], 2, 2);
      for (const c of picks) p.deck.splice(p.deck.indexOf(c), 1);
      fx.shuffleDeck(g, me);
      p.deck.push(...picks.reverse()); // la prima scelta in cima
    },
  },
  {
    name: "Surfer",
    canPlay: (g, me) => g.p(me).bench.length > 0,
    *play(g, me) { if (yield* fx.switchOwn(g, me)) fx.drawUntil(g, me, 5); },
  },
  {
    name: "Energy Switch",
    canPlay: (g, me) => g.inPlay(me).length > 1 && g.inPlay(me).some(m => m.energies.some(e => fx.isBasicEnergy(g, e))),
    *play(g, me) {
      const from = yield* fx.chooseOne(g, me, "move_from", g.inPlay(me).filter(m => m.energies.some(e => fx.isBasicEnergy(g, e))));
      const e = yield* fx.chooseOne(g, me, "move_energy", from.energies.filter(x => fx.isBasicEnergy(g, x)));
      const to = yield* fx.chooseOne(g, me, "attach_discard_target", g.inPlay(me).filter(m => m !== from));
      from.energies.splice(from.energies.indexOf(e), 1);
      to.energies.push(e);
    },
  },
  {
    name: "Glass Trumpet",
    canPlay: (g, me) => hasTera(g, me) && g.p(me).discard.some(c => fx.isBasicEnergy(g, c)),
    *play(g, me) {
      const p = g.p(me);
      const targets = yield* fx.choose(g, me, "attach_discard_target", p.bench.filter(m => g.top(m).type === "C"), 0, 2);
      for (const t of targets) {
        const pool = p.discard.filter(c => fx.isBasicEnergy(g, c));
        if (!pool.length) break;
        const e = yield* fx.chooseOne(g, me, "attach_discard", pool);
        p.discard.splice(p.discard.indexOf(e), 1);
        t.energies.push(e);
      }
    },
  },
  {
    name: "Switch",
    canPlay: (g, me) => g.p(me).bench.length > 0,
    *play(g, me) { yield* fx.switchOwn(g, me); },
  },
  {
    name: "Secret Box",
    canPlay: (g, me) => g.p(me).hand.length - 1 >= 3,
    *play(g, me) {
      yield* fx.discardFromHand(g, me, 3, fx.any, 3, "discard");
      for (const sub of ["item", "tool", "supporter", "stadium"]) {
        yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).kind === "trainer" && gg.def(c).sub === sub, 1, "hand", 0, "search");
      }
    },
  },
  { name: "Hero's Cape", passive: { hp: (_g, mon, _mo, _o, self) => (mon === self ? 100 : 0) } },
  {
    name: "Lucky Helmet",
    passive: { damaged: (g, mon, monOwner, _o, self) => { if (mon === self && g.p(monOwner).active === mon) fx.draw(g, monOwner, 2); } },
  },
  {
    name: "Area Zero Underdepths",
    passive: { benchSize: (g, player) => (hasTera(g, player) ? 8 : 5) },
  },
  {
    name: "Academy at Night",
    stadiumAction: {
      canUse: (g, me) => g.p(me).hand.length > 0,
      *use(g, me) {
        const p = g.p(me);
        const c = yield* fx.chooseOne(g, me, "academy", [...p.hand]);
        p.hand.splice(p.hand.indexOf(c), 1);
        p.deck.push(c);
      },
    },
  },
  { name: "Boomerang Energy", provides: "C" },
];
