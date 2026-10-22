/** N's Zoroark, Festival Lead, Alakazam, Hydrapple. */
import type { Impl } from "../registry.js";
import type { Mon } from "../../engine/types.js";
import * as fx from "../effects.js";
import { switchActive } from "../../engine/game.js";

type G = Parameters<typeof fx.draw>[0];
const ruleBox = (g: G, m: Mon) => fx.hasRuleBox(g, m);
const isEx = (g: G, m: Mon | null) => !!m && (g.top(m).tags ?? []).includes("ex");
const grassBasic = (g: G, c: number) => fx.isBasicEnergy(g, c) && g.def(c).provides === "G";
const festivalLead = { abilities: {}, covers: ["Festival Lead"], tags: ["festival_lead"] };
const noRetreatNext = { *after(g: G, me: number) { const o = g.p(1 - me).active; if (o && !fx.prevented(g, o, me)) o.used.no_retreat = g.s.turn + 1; } };

/** Usa l'attacco di un'altra carta Pokémon come attacco di questo Pokémon (Night Joker). */
function* copyFrom(g: G, me: number, sources: Mon[]) {
  const opts: [number, number][] = [];
  // un attacco che copia altri attacchi (un altro Night Joker) non si può copiare: andrebbe all'infinito
  for (const m of sources) (g.top(m).attacks ?? []).forEach((a, i) => { if (a.name !== "Night Joker") opts.push([fx.topCard(m), i]); });
  if (!opts.length) return 0;
  const [card, i] = yield* fx.chooseOne(g, me, "copy_attack", opts);
  const atk = g.def(card).attacks![i];
  g.p(me).active!.used.copied = card * 10 + i;
  if (atk.effect) { const r = yield* atk.effect(g, me); if (typeof r === "number") return r; }
  return atk.damage;
}
function* copiedAfter(g: G, me: number) {
  const m = g.p(me).active;
  if (!m || m.used.copied === undefined) return;
  const atk = g.def(Math.floor(m.used.copied / 10)).attacks![m.used.copied % 10];
  delete m.used.copied;
  if (atk.after) yield* atk.after(g, me);
}

const pushDown = {
  *after(g: G, me: number) {
    const o = g.p(1 - me);
    if (o.bench.length) switchActive(o, yield* fx.chooseOne(g, 1 - me, "switch", o.bench.map((_, i) => i)));
  },
};

export const MIDRANGE: Impl[] = [
  // --- N's Zoroark ---
  {
    name: "N's Zoroark ex",
    abilities: {
      Trade: {
        canUse: (g, me) => g.p(me).hand.length > 0 && g.p(me).deck.length > 0,
        *use(g, me) { yield* fx.discardFromHand(g, me, 1, fx.any, 1, "discard"); fx.draw(g, me, 2); },
      },
    },
    attacks: {
      "Night Joker": {
        *effect(g, me) { return yield* copyFrom(g, me, g.p(me).bench.filter(m => g.top(m).name.startsWith("N's "))); },
        after: copiedAfter,
      },
    },
  },
  { name: "N's Zekrom", attacks: { "Rampaging Thunder": { *after(g, me) { g.p(me).active!.used.no_attack = g.s.turn + 2; } } }, covers: ["Shred"] },
  {
    name: "N's Darmanitan",
    attacks: {
      "Back Draft": { estimate: 60, *effect(g, me) { return 30 * g.p(1 - me).discard.filter(c => fx.isBasicEnergy(g, c)).length; } },
      "Flamebody Cannon": {
        estimate: 180,
        *effect(g, me) {
          // le Energie si scartano dal Pokémon che attacca (anche se l'attacco è copiato da Night Joker)
          const m = g.p(me).active!;
          g.p(me).discard.push(...m.energies.splice(0));
          const pool = g.p(1 - me).bench.filter(x => !fx.prevented(g, x, me));
          if (pool.length) fx.damageTo(g, me, yield* fx.chooseOne(g, me, "snipe", pool), 90);
          return 90;
        },
      },
    },
  },
  { name: "N's Reshiram", attacks: { "Powerful Rage": { *effect(g, me) { return 20 * Math.floor(g.p(me).active!.damage / 10); } } } },
  {
    name: "N's Purrloin",
    attacks: {
      "Thieving Swipe": {
        *after(g, me) {
          const o = g.p(1 - me);
          if (!o.hand.length) return;
          const c = yield* fx.chooseOne(g, me, "thieving_swipe", [...o.hand]);
          o.hand.splice(o.hand.indexOf(c), 1);
          o.deck.unshift(c);
        },
      },
    },
  },
  {
    name: "Yveltal",
    version: c => (c.attacks ?? []).some(a => a.name === "Clutch"),
    attacks: { Clutch: noRetreatNext },
  },
  {
    name: "Pecharunt ex",
    abilities: {
      "Subjugating Chains": {
        canUse: (g, me) => g.p(me).flags.chains !== g.s.turn && g.p(me).bench.some(m => g.top(m).type === "D" && g.top(m).name !== "Pecharunt ex"),
        *use(g, me) {
          const p = g.p(me);
          g.p(me).flags.chains = g.s.turn;
          const t = yield* fx.chooseOne(g, me, "switch", p.bench.filter(m => g.top(m).type === "D" && g.top(m).name !== "Pecharunt ex"));
          switchActive(p, p.bench.indexOf(t));
          if (!p.active!.conditions.includes("poisoned")) p.active!.conditions.push("poisoned");
        },
      },
    },
    attacks: { "Irritated Outburst": { *effect(g, me) { return 60 * (6 - g.p(1 - me).prizes.length); } } },
  },
  {
    name: "Janine's Secret Art",
    *play(g, me) {
      const p = g.p(me);
      for (const t of yield* fx.choose(g, me, "attach_discard_target", g.inPlay(me).filter(m => g.top(m).type === "D"), 0, 2)) {
        const e = p.deck.find(c => fx.isBasicEnergy(g, c) && g.def(c).provides === "D");
        if (e === undefined) break;
        p.deck.splice(p.deck.indexOf(e), 1);
        t.energies.push(e);
        if (t === p.active && !t.conditions.includes("poisoned")) t.conditions.push("poisoned");
      }
      fx.shuffleDeck(g, me);
    },
  },
  {
    name: "N's PP Up",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.isBasicEnergy(g, c)) && g.p(me).bench.some(m => g.top(m).name.startsWith("N's ")),
    *play(g, me) {
      const p = g.p(me);
      yield* fx.attachFromDiscard(g, me, fx.isBasicEnergy, 1, "attach_discard", 1, m => p.bench.includes(m) && g.top(m).name.startsWith("N's "));
    },
  },
  {
    name: "Binding Mochi",
    passive: {
      damageBefore: (_g, ctx, owner, self) =>
        ctx.attacker === self && ctx.attackerOwner === owner && ctx.toActive && ctx.targetOwner !== owner && self.conditions.includes("poisoned")
          ? ctx.damage + 40 : ctx.damage,
    },
  },
  { name: "N's Castle", passive: { retreat: (g, mon) => (g.top(mon).name.startsWith("N's ") ? -99 : 0) } },
  // --- Festival Lead ---
  {
    name: "Thwackey",
    version: c => (c.abilities ?? []).some(a => a.name === "Boom Boom Groove"),
    abilities: {
      "Boom Boom Groove": {
        canUse: (g, me) => { const a = g.p(me).active; return !!a && (g.top(a).tags ?? []).includes("festival_lead") && g.p(me).deck.length > 0; },
        *use(g, me) { yield* fx.searchDeck(g, me, fx.any, 1, "hand", 0, "search"); },
      },
    },
  },
  {
    name: "Goldeen",
    version: c => (c.abilities ?? []).some(a => a.name === "Festival Lead"),
    ...festivalLead,
    attacks: {
      Whirlpool: {
        *after(g, me) {
          const o = g.p(1 - me).active;
          if (o?.energies.length && !fx.prevented(g, o, me) && fx.flip(g)) fx.discardEnergy(g, o, 1 - me, 1);
        },
      },
    },
  },
  { name: "Seaking", version: c => (c.abilities ?? []).some(a => a.name === "Festival Lead"), ...festivalLead, attacks: { "Rapid Draw": { *after(g, me) { fx.draw(g, me, 2); } } } },
  { name: "Dipplin", version: c => (c.abilities ?? []).some(a => a.name === "Festival Lead"), ...festivalLead, attacks: { "Do the Wave": { *effect(g, me) { return 20 * g.p(me).bench.length; } } } },
  { name: "Psyduck", version: c => (c.abilities ?? []).some(a => a.name === "Damp"), abilities: {}, covers: ["Damp"], tags: ["damp"] },
  { name: "Moltres", version: c => (c.attacks ?? []).some(a => a.name === "Fighting Wings"), attacks: { "Fighting Wings": { *effect(g, me) { return isEx(g, g.p(1 - me).active) ? 110 : 20; } } } },
  { name: "Applin", version: c => (c.attacks ?? []).some(a => a.name === "Tumbling Attack"), attacks: { "Tumbling Attack": { *effect(g) { return fx.flip(g) ? 30 : 10; } } } },
  {
    name: "Gladion's Final Battle",
    canPlay: (g, me) => g.p(me).hand.length === 1,
    turnPassive: {
      damageBefore: (g, ctx, owner) =>
        ctx.attackerOwner === owner && ctx.targetOwner !== owner && ctx.toActive && !ruleBox(g, ctx.attacker) ? ctx.damage + 80 : ctx.damage,
    },
  },
  {
    name: "Brave Bangle",
    passive: {
      damageBefore: (g, ctx, owner, self) =>
        ctx.attacker === self && ctx.attackerOwner === owner && ctx.toActive && ctx.targetOwner !== owner && !ruleBox(g, self) && isEx(g, ctx.target)
          ? ctx.damage + 30 : ctx.damage,
    },
  },
  { name: "Festival Grounds", tags: ["no_conditions_with_energy"] },
  {
    name: "Mist Energy",
    provides: "C",
    passive: { preventsEffects: (g, target, source, owner, self) => target === self && source !== owner && g.s.attacking === source },
  },
  // --- Alakazam ---
  {
    name: "Abra",
    version: c => (c.attacks ?? []).some(a => a.name === "Teleportation Attack"),
    attacks: { "Teleportation Attack": { *after(g, me) { yield* fx.switchOwn(g, me); } } },
  },
  {
    name: "Kadabra",
    version: c => (c.abilities ?? []).some(a => a.name === "Psychic Draw"),
    abilities: { "Psychic Draw": { trigger: "evolve", *use(g, me) { fx.draw(g, me, 2); } } },
  },
  {
    name: "Alakazam",
    version: c => (c.abilities ?? []).some(a => a.name === "Psychic Draw"),
    abilities: { "Psychic Draw": { trigger: "evolve", *use(g, me) { fx.draw(g, me, 3); } } },
    attacks: {
      "Powerful Hand": {
        *effect(g, me) {
          const o = g.p(1 - me).active;
          if (o && !fx.prevented(g, o, me)) o.damage += 20 * g.p(me).hand.length;
          return 0;
        },
      },
    },
  },
  {
    name: "Dunsparce",
    version: c => (c.attacks ?? []).some(a => a.name === "Trading Places"),
    attacks: { "Trading Places": { *effect(g, me) { yield* fx.switchOwn(g, me); return 0; } } },
  },
  {
    name: "Hilda",
    *play(g, me) {
      yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).kind === "pokemon" && gg.def(c).sub !== "basic", 1, "hand", 0, "search");
      yield* fx.searchDeck(g, me, fx.isEnergy, 1, "hand", 0, "search");
    },
  },
  {
    name: "Eri",
    *play(g, me) {
      const o = g.p(1 - me);
      for (const c of yield* fx.choose(g, me, "eri", o.hand.filter(x => g.def(x).sub === "item"), 0, 2)) {
        o.hand.splice(o.hand.indexOf(c), 1);
        o.discard.push(c);
      }
    },
  },
  {
    name: "Lana's Aid",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.noRuleBox(g, c) || fx.isBasicEnergy(g, c)),
    *play(g, me) { yield* fx.recover(g, me, fx.or(fx.noRuleBox, fx.isBasicEnergy), 3, "hand", "recover"); },
  },
  {
    name: "Sacred Ash",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.isPokemon(g, c)),
    *play(g, me) { yield* fx.recover(g, me, fx.isPokemon, 5, "deck", "sacred_ash"); },
  },
  { name: "Battle Cage", tags: ["battle_cage"] },
  { name: "Enriching Energy", provides: "C", *onAttach(g, me) { fx.draw(g, me, 4); } },
  {
    name: "Strange Timepiece",
    canPlay: (g, me) => g.inPlay(me).some(m => m.stack.length > 1 && g.top(m).type === "P"),
    *play(g, me) {
      const p = g.p(me);
      const m = yield* fx.chooseOne(g, me, "devolve", g.inPlay(me).filter(x => x.stack.length > 1 && g.top(x).type === "P"));
      const n = yield* fx.chooseOne(g, me, "devolve_count", Array.from({ length: m.stack.length - 1 }, (_, i) => i + 1));
      p.hand.push(...m.stack.splice(m.stack.length - n));
      m.evolvedTurn = g.s.turn;
    },
  },
  {
    name: "Prime Catcher",
    canPlay: (g, me) => g.p(1 - me).bench.length > 0,
    *play(g, me) { if (yield* fx.gust(g, me)) yield* fx.switchOwn(g, me); },
  },
  // --- Hydrapple ---
  { name: "Bayleef", version: c => (c.attacks ?? []).some(a => a.name === "Push Down"), attacks: { "Push Down": pushDown } },
  {
    name: "Meganium",
    version: c => (c.abilities ?? []).some(a => a.name === "Wild Growth"),
    abilities: {},
    covers: ["Wild Growth"],
    passive: { energyProvides: (g, e, energyOwner, owner) => (energyOwner === owner && grassBasic(g, e) ? ["G", "G"] : undefined) },
  },
  {
    name: "Hydrapple ex",
    abilities: {
      "Ripening Charge": {
        canUse: (g, me) => g.p(me).hand.some(c => grassBasic(g, c)),
        *use(g, me) {
          const p = g.p(me);
          const e = yield* fx.chooseOne(g, me, "teal_dance", p.hand.filter(c => grassBasic(g, c)));
          const t = yield* fx.chooseOne(g, me, "attach_discard_target", g.inPlay(me));
          p.hand.splice(p.hand.indexOf(e), 1);
          t.energies.push(e);
          fx.heal(g, t, 30);
        },
      },
    },
    attacks: { "Syrup Storm": { *effect(g, me) { return 30 + 30 * g.inPlay(me).reduce((n, m) => n + fx.providedCount(g, m, "G"), 0); } } },
  },
  {
    name: "Celebi",
    version: c => (c.attacks ?? []).some(a => a.name === "Traverse Time"),
    attacks: {
      "Traverse Time": {
        *effect(g, me) {
          yield* fx.searchDeck(g, me, (gg, c) => (gg.def(c).kind === "pokemon" && gg.def(c).type === "G") || gg.def(c).sub === "stadium", 3, "hand", 0, "search");
        },
      },
    },
  },
  {
    name: "Briar",
    canPlay: (g, me) => g.p(1 - me).prizes.length === 2,
    turnPassive: {
      prizes: (g, _ko, koOwner, byAttack, owner) => {
        const a = g.p(owner).active;
        return byAttack && koOwner !== owner && !!a && (g.top(a).tags ?? []).includes("tera") ? 1 : 0;
      },
    },
  },
  {
    name: "Bug Catching Set",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) { yield* fx.lookTop(g, me, 7, (gg, c) => (gg.def(c).kind === "pokemon" && gg.def(c).type === "G") || grassBasic(gg, c), 2, 0, "shuffle", "search"); },
  },
  {
    name: "Forest of Vitality",
    passive: {
      evolveSameTurn: (g, mon, evo) => g.s.turn > 2 && g.top(mon).type === "G" && g.def(evo).type === "G",
    },
  },
];
