/** Allenatori, Energie e Pokémon di supporto più giocati nel formato. */
import type { Impl } from "../registry.js";
import * as fx from "../effects.js";

const others = (g: Parameters<typeof fx.draw>[0], me: number) => g.p(me).hand.length - 1; // carte in mano oltre a quella giocata

export const STAPLES: Impl[] = [
  // --- Supporter ---
  {
    name: "Lillie's Determination",
    *play(g, me) {
      fx.shuffleHandIntoDeck(g, me);
      fx.draw(g, me, g.p(me).prizes.length === 6 ? 8 : 6);
    },
  },
  {
    name: "Gwynn",
    *play(g, me) {
      const n = (yield* fx.discardFromHand(g, me, 2, fx.noRuleBox, 0, "gwynn")).length;
      fx.draw(g, me, 3 * n);
    },
  },
  {
    name: "Explorer's Guidance",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) { yield* fx.lookTop(g, me, 6, fx.any, 2, 2, "discard", "explorer"); },
  },
  {
    name: "Boss's Orders",
    canPlay: (g, me) => g.p(1 - me).bench.length > 0,
    *play(g, me) { yield* fx.gust(g, me); },
  },
  {
    name: "Naveen",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) {
      yield* fx.discardFromHand(g, me, g.p(me).hand.length, fx.any, 0, "naveen");
      fx.drawUntil(g, me, 5);
    },
  },
  {
    name: "Black Belt's Training",
    turnPassive: {
      damageBefore: (g, ctx, owner) =>
        ctx.attackerOwner === owner && ctx.targetOwner !== owner && ctx.toActive && (g.top(ctx.target).tags ?? []).includes("ex")
          ? ctx.damage + 40 : ctx.damage,
    },
  },
  // --- Oggetti ---
  {
    name: "Ultra Ball",
    canPlay: (g, me) => others(g, me) >= 2,
    *play(g, me) {
      yield* fx.discardFromHand(g, me, 2, fx.any, 2, "ultra_ball_discard");
      yield* fx.searchDeck(g, me, fx.isPokemon, 1, "hand", 0, "ultra_ball");
    },
  },
  {
    name: "Poké Pad",
    *play(g, me) { yield* fx.searchDeck(g, me, fx.noRuleBox, 1, "hand", 0, "poke_pad"); },
  },
  {
    name: "Night Stretcher",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.isPokemon(g, c) || fx.isBasicEnergy(g, c)),
    *play(g, me) { yield* fx.recover(g, me, fx.or(fx.isPokemon, fx.isBasicEnergy), 1, "hand", "night_stretcher"); },
  },
  {
    name: "Pokégear 3.0",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) { yield* fx.lookTop(g, me, 7, fx.isSupporter, 1, 0, "shuffle", "pokegear"); },
  },
  {
    name: "Buddy-Buddy Poffin",
    canPlay: (g, me) => g.p(me).bench.length < 5,
    *play(g, me) { yield* fx.searchDeck(g, me, fx.and(fx.isBasicPokemon, fx.hpAtMost(70)), 2, "bench", 0, "poffin"); },
  },
  {
    name: "Brilliant Blender",
    *play(g, me) { yield* fx.mill(g, me, 5, fx.any, "blender"); },
  },
  {
    name: "Wondrous Patch",
    canPlay: (g, me) =>
      g.p(me).discard.some(c => fx.isBasicEnergy(g, c) && g.def(c).provides === "P") && g.p(me).bench.some(m => g.top(m).type === "P"),
    *play(g, me) {
      const p = g.p(me);
      const e = yield* fx.chooseOne(g, me, "patch_energy", p.discard.filter(c => fx.isBasicEnergy(g, c) && g.def(c).provides === "P"));
      const t = yield* fx.chooseOne(g, me, "patch_target", p.bench.filter(m => g.top(m).type === "P"));
      p.discard.splice(p.discard.indexOf(e), 1);
      t.energies.push(e);
    },
  },
  // --- Strumenti ---
  { name: "Air Balloon", passive: { retreat: (_g, mon, _mo, _o, self) => (mon === self ? -2 : 0) } },
  // --- Stadi ---
  {
    name: "Prism Tower",
    stadiumAction: {
      canUse: (g, me) => g.p(me).hand.length >= 2 && g.p(me).deck.length > 0,
      *use(g, me) {
        yield* fx.discardFromHand(g, me, 2, fx.any, 2, "prism_discard");
        fx.draw(g, me, 1);
      },
    },
  },
  { name: "Jamming Tower", tags: ["tools_off"] },
  // --- Energie ---
  {
    name: "Legacy Energy",
    provides: "*",
    passive: {
      prizes: (g, ko, _koOwner, byAttack, owner, self) => {
        if (ko !== self || !byAttack || g.p(owner).flags.legacy) return 0;
        g.p(owner).flags.legacy = 1;
        return -1;
      },
    },
  },
  // --- Pokémon di supporto ---
  {
    name: "Lillie's Clefairy ex",
    abilities: {},
    covers: ["Fairy Zone"],
    passive: { weakness: (g, mon, monOwner, owner) => (monOwner !== owner && g.top(mon).type === "N" ? "P" : undefined) },
    attacks: {
      "Full Moon Rondo": { *effect(g) { return 20 + 20 * (g.p(0).bench.length + g.p(1).bench.length); } },
    },
  },
  {
    name: "Latias ex",
    abilities: {},
    covers: ["Skyliner"],
    passive: { retreat: (g, mon, monOwner, owner) => (monOwner === owner && g.top(mon).sub === "basic" ? -99 : 0) },
    attacks: {
      "Eon Blade": { *effect(g, me) { g.p(me).active!.used.no_attack = g.s.turn + 2; } },
    },
  },
  {
    name: "Bloodmoon Ursaluna ex",
    abilities: {},
    covers: ["Seasoned Skill"],
    passive: {
      attackCostLess: (g, mon, atk, monOwner, owner, self) =>
        mon === self && atk.name === "Blood Moon" ? 6 - g.p(1 - owner).prizes.length : 0,
    },
    attacks: {
      "Blood Moon": { *effect(g, me) { g.p(me).active!.used.no_attack = g.s.turn + 2; } },
    },
  },
  {
    name: "Yveltal",
    version: c => (c.abilities ?? []).some(a => a.name === "Life-Locked"),
    abilities: {},
    covers: ["Life-Locked"],
    passive: { noHeal: (g, mon, monOwner, owner) => monOwner !== owner && g.p(monOwner).active === mon },
  },
  {
    name: "Shaymin",
    version: c => (c.abilities ?? []).some(a => a.name === "Flower Curtain"),
    abilities: {},
    covers: ["Flower Curtain"],
    passive: {
      damageAfter: (g, ctx, owner) =>
        ctx.targetOwner === owner && ctx.attackerOwner !== owner && !ctx.toActive && !fx.hasRuleBox(g, ctx.target) ? 0 : ctx.damage,
    },
  },
  {
    name: "Genesect",
    version: c => (c.abilities ?? []).some(a => a.name === "ACE Nullifier"),
    abilities: {},
    covers: ["ACE Nullifier"],
    passive: { blocks: (_g, player, what, _c, owner, self) => what === "ace" && player !== owner && !!self && self.tools.length > 0 },
  },
  {
    name: "Patrat",
    version: c => (c.attacks ?? []).some(a => a.name === "Procurement"),
    attacks: {
      Procurement: { *effect(g, me) { yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).sub === "item", 1, "hand", 0, "procurement"); } },
    },
  },
];
