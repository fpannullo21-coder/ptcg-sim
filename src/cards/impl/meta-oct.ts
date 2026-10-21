/**
 * Carte del meta di ottobre 2026 che mancavano: Zoroark, Slowking, Festival Lead,
 * Alakazam, Crustle, Hydrapple, Excadrill, Lucario Hariyama, Rocket's Honchkrow,
 * Sharpedo, Lopunny e Allenatori comuni.
 */
import type { Impl } from "../registry.js";
import type { Mon } from "../../engine/types.js";
import * as fx from "../effects.js";
import { applyDamage, checkKO, maxHp, switchActive } from "../../engine/game.js";

type G = Parameters<typeof fx.draw>[0];
const isTR = (g: G, c: number) => g.def(c).name.startsWith("Team Rocket's");
const trSupporter = (g: G, c: number) => fx.isSupporter(g, c) && isTR(g, c);
const markTR = (g: G, me: number) => { g.p(me).flags.tr_supporter = g.s.turn; };
const selfDamage = (n: number) => ({ *after(g: G, me: number) { const a = g.p(me).active; if (a) a.damage += n; } });
const lockSelf = (name: string) => ({ *after(g: G, me: number) { const a = g.p(me).active; if (a) a.used["lock:" + name] = g.s.turn + 2; } });
const reduceNext = (n: number) => ({ *after(g: G, me: number) { const a = g.p(me).active; if (a) { a.used.reduce_turn = g.s.turn + 1; a.used.reduce = n; } } });
const isBasicType = (t: string) => (g: G, c: number) => fx.isBasicEnergy(g, c) && g.def(c).provides === t;
const isEvolution = (g: G, c: number) => g.def(c).kind === "pokemon" && g.def(c).sub !== "basic";
const callForFamily = { *effect(g: G, me: number) { yield* fx.searchDeck(g, me, fx.isBasicPokemon, 2, "bench", 0, "call_for_family"); return 0; } };
const searchSupporter = { *effect(g: G, me: number) { yield* fx.searchDeck(g, me, fx.isSupporter, 1, "hand", 0, "search"); return 0; } };
const attacker = (g: G, owner: number) => g.p(1 - owner).active;

/** Sposta i segnalini dove fanno più premi (Strange Hacking): scelta automatica, la migliore in modo greedy. */
function hackCounters(g: G, me: number) {
  const opp = g.inPlay(1 - me).filter(m => !fx.prevented(g, m, me));
  const targets = [...opp].sort((a, b) => (g.top(b).prizes ?? 1) - (g.top(a).prizes ?? 1) || g.hpLeft(a) - g.hpLeft(b));
  for (const t of targets) {
    const need = Math.ceil(g.hpLeft(t) / 10);
    const donors = opp.filter(m => m !== t && m.damage > 0);
    const pool = donors.reduce((s, m) => s + m.damage / 10, 0);
    if (pool < need) continue;
    let left = need;
    for (const d of donors.sort((a, b) => (g.top(a).prizes ?? 1) - (g.top(b).prizes ?? 1))) {
      const k = Math.min(left, d.damage / 10);
      fx.moveCounters(d, t, k);
      left -= k;
      if (!left) break;
    }
  }
}

export const META_OCT: Impl[] = [
  // --- Strumenti ed Energie che reagiscono al danno ---
  {
    name: "Punk Helmet",
    passive: {
      damaged: (g, mon, owner, _o, self) => {
        if (mon !== self || g.p(owner).active !== mon || g.top(mon).type !== "D") return;
        const a = attacker(g, owner);
        if (a) a.damage += 40;
      },
    },
  },
  {
    name: "Spiky Energy",
    provides: "C",
    passive: {
      damaged: (g, mon, owner, _o, self) => {
        if (mon !== self || g.p(owner).active !== mon) return;
        const a = attacker(g, owner);
        if (a) a.damage += 20;
      },
    },
  },
  {
    name: "Handheld Fan",
    passive: {
      damaged: (g, mon, owner, _o, self) => {
        if (mon !== self || g.p(owner).active !== mon) return;
        const a = attacker(g, owner), bench = g.p(1 - owner).bench;
        if (a && a.energies.length && bench.length) bench[0].energies.push(a.energies.pop()!);
      },
    },
  },
  {
    name: "Growing Grass Energy",
    provides: "G",
    passive: { hp: (g, mon, _mo, _o, self) => (mon === self && g.top(mon).type === "G" ? 20 : 0) },
  },
  {
    name: "Team Rocket's Energy",
    provides: "*",
    passive: {
      // 2 Energie in qualsiasi combinazione di Psico e Oscurità: i mazzi Team Rocket usano solo questi tipi
      energyProvides: (g, e) => (g.def(e).name === "Team Rocket's Energy" ? ["*", "*"] : undefined),
    },
    *onAttach(g, me, mon) {
      if (g.top(mon).name.startsWith("Team Rocket's")) return;
      const e = mon.energies.findIndex(x => g.def(x).name === "Team Rocket's Energy");
      if (e >= 0) g.p(me).discard.push(mon.energies.splice(e, 1)[0]);
    },
  },
  {
    name: "Ignition Energy",
    provides: "C",
    passive: {
      energyProvides: (g, e) => {
        if (g.def(e).name !== "Ignition Energy") return undefined;
        const holder = [...g.inPlay(0), ...g.inPlay(1)].find(m => m.energies.includes(e));
        return holder && g.top(holder).sub !== "basic" ? ["C", "C", "C"] : ["C"];
      },
      endOfTurn: (g, player, owner, self) => {
        if (player !== owner || !self) return;
        for (const e of self.energies.filter(x => g.def(x).name === "Ignition Energy")) {
          self.energies.splice(self.energies.indexOf(e), 1);
          g.p(owner).discard.push(e);
        }
      },
    },
  },
  {
    name: "Powerglass",
    passive: {
      endOfTurn: (g, player, owner, self) => {
        if (player !== owner || !self || g.p(owner).active !== self) return;
        const p = g.p(owner);
        const e = p.discard.find(c => fx.isBasicEnergy(g, c));
        if (e !== undefined) { p.discard.splice(p.discard.indexOf(e), 1); self.energies.push(e); }
      },
    },
  },
  // --- Stadi ---
  { name: "Nighttime Mine", passive: { attackCostLess: (g, mon) => ((g.top(mon).tags ?? []).includes("tera") ? -1 : 0) } },
  { name: "Gravity Mountain", passive: { hp: (g, mon) => (g.top(mon).sub === "stage2" ? -30 : 0) } },
  {
    name: "Team Rocket's Factory",
    stadiumAction: { canUse: (g, me) => g.p(me).flags.tr_supporter === g.s.turn, *use(g, me) { fx.draw(g, me, 2); } },
  },
  {
    name: "Lumiose City",
    stadiumAction: {
      canUse: (g, me) => fx.benchFree(g, me) > 0 && g.p(me).deck.some(c => fx.isBasicPokemon(g, c)),
      *use(g, me) {
        yield* fx.searchDeck(g, me, fx.isBasicPokemon, 1, "bench", 0, "lumiose");
        g.p(me).flags.end_turn = g.s.turn;
      },
    },
  },
  // --- Supporter ---
  {
    name: "Brock's Scouting",
    *play(g, me) {
      const mode = yield* fx.chooseOne(g, me, "brock_mode", ["2 Pokémon Base", "1 Pokémon Evoluzione"]);
      if (mode.startsWith("2")) yield* fx.searchDeck(g, me, fx.isBasicPokemon, 2, "hand", 0, "search");
      else yield* fx.searchDeck(g, me, isEvolution, 1, "hand", 0, "search");
    },
  },
  {
    name: "Acerola's Mischief",
    canPlay: (g, me) => g.p(1 - me).prizes.length <= 2,
    *play(g, me) { (yield* fx.chooseOne(g, me, "acerola", g.inPlay(me))).used.protect_ex = g.s.turn + 1; },
  },
  {
    name: "Kieran",
    turnPassive: {
      damageBefore: (g, ctx, owner) =>
        g.p(owner).flags.kieran === g.s.turn && ctx.attackerOwner === owner && ctx.targetOwner !== owner && ctx.toActive
          && (g.top(ctx.target).tags ?? []).includes("ex") ? ctx.damage + 30 : ctx.damage,
    },
    *play(g, me) {
      const opts = ["+30 ai Pokémon ex", ...(g.p(me).bench.length ? ["cambia l'attivo"] : [])];
      const mode = yield* fx.chooseOne(g, me, "kieran", opts);
      if (mode.startsWith("+30")) g.p(me).flags.kieran = g.s.turn;
      else yield* fx.switchOwn(g, me);
    },
  },
  {
    name: "Team Rocket's Petrel",
    *play(g, me) { markTR(g, me); yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).kind === "trainer", 1, "hand", 0, "search"); },
  },
  {
    name: "Xerosic's Machinations",
    *play(g, me) {
      const o = g.p(1 - me);
      if (o.hand.length > 3) yield* fx.discardFromHand(g, 1 - me, o.hand.length - 3, fx.any, o.hand.length - 3, "discard");
    },
  },
  {
    name: "Pokémon Center Lady",
    canPlay: (g, me) => g.inPlay(me).some(m => m.damage > 0 || m.conditions.length > 0),
    *play(g, me) {
      const m = yield* fx.chooseOne(g, me, "heal_target", g.inPlay(me).filter(x => x.damage > 0 || x.conditions.length));
      fx.heal(g, m, 60);
      m.conditions = [];
    },
  },
  {
    name: "Bianca's Devotion",
    canPlay: (g, me) => g.inPlay(me).some(m => m.damage > 0 && g.hpLeft(m) <= 30),
    *play(g, me) {
      const m = yield* fx.chooseOne(g, me, "heal_target", g.inPlay(me).filter(x => x.damage > 0 && g.hpLeft(x) <= 30));
      fx.heal(g, m, m.damage);
    },
  },
  {
    name: "Wally's Compassion",
    canPlay: (g, me) => g.inPlay(me).some(m => m.damage > 0 && (g.top(m).tags ?? []).includes("mega")),
    *play(g, me) {
      const m = yield* fx.chooseOne(g, me, "heal_target", g.inPlay(me).filter(x => x.damage > 0 && (g.top(x).tags ?? []).includes("mega")));
      const before = m.damage;
      fx.heal(g, m, m.damage);
      if (m.damage < before) g.p(me).hand.push(...m.energies.splice(0));
    },
  },
  {
    name: "Team Rocket's Archer",
    canPlay: (g, me) => g.p(me).flags.ko_turn === g.s.turn - 1,
    *play(g, me) {
      markTR(g, me);
      fx.shuffleHandIntoDeck(g, me);
      fx.shuffleHandIntoDeck(g, 1 - me);
      fx.draw(g, me, 5);
      fx.draw(g, 1 - me, 3);
    },
  },
  {
    name: "Team Rocket's Ariana",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) {
      markTR(g, me);
      const allTR = g.inPlay(me).every(m => g.top(m).name.startsWith("Team Rocket's"));
      fx.drawUntil(g, me, allTR ? 8 : 5);
    },
  },
  {
    name: "Team Rocket's Proton",
    tags: ["first_turn_ok"],
    *play(g, me) { markTR(g, me); yield* fx.searchDeck(g, me, (gg, c) => fx.isBasicPokemon(gg, c) && isTR(gg, c), 3, "hand", 0, "search"); },
  },
  {
    name: "Team Rocket's Giovanni",
    canPlay: (g, me) => {
      const p = g.p(me);
      return !!p.active && g.top(p.active).name.startsWith("Team Rocket's") && p.bench.some(m => g.top(m).name.startsWith("Team Rocket's"));
    },
    *play(g, me) {
      markTR(g, me);
      const p = g.p(me);
      const idx = p.bench.map((m, i) => [m, i] as const).filter(([m]) => g.top(m).name.startsWith("Team Rocket's")).map(([, i]) => i);
      switchActive(p, yield* fx.chooseOne(g, me, "switch", idx));
      yield* fx.gust(g, me);
    },
  },
  // --- Oggetti ---
  {
    name: "Tool Scrapper",
    canPlay: g => [...g.inPlay(0), ...g.inPlay(1)].some(m => m.tools.length),
    *play(g, me) {
      const opts: { m: Mon; t: number; owner: number }[] = [];
      for (const owner of [1 - me, me]) for (const m of g.inPlay(owner)) for (const t of m.tools) opts.push({ m, t, owner });
      for (const o of yield* fx.choose(g, me, "tool_scrapper", opts, 0, 2)) {
        o.m.tools.splice(o.m.tools.indexOf(o.t), 1);
        g.p(o.owner).discard.push(o.t);
      }
    },
  },
  {
    name: "Pokémon Catcher",
    version: c => (c.rules ?? []).some(r => r.startsWith("Flip a coin")),
    canPlay: (g, me) => g.p(1 - me).bench.length > 0,
    *play(g, me) { if (fx.flip(g)) yield* fx.gust(g, me); },
  },
  {
    name: "Jumbo Ice Cream",
    canPlay: (g, me) => { const a = g.p(me).active; return !!a && a.damage > 0 && a.energies.length >= 3; },
    *play(g, me) { fx.heal(g, g.p(me).active!, 80); },
  },
  {
    name: "Enhanced Hammer",
    canPlay: (g, me) => g.inPlay(1 - me).some(m => m.energies.some(e => g.def(e).sub === "special_energy")),
    *play(g, me) {
      const opts = g.inPlay(1 - me).flatMap(m => m.energies.filter(e => g.def(e).sub === "special_energy").map(e => ({ m, e })));
      const { m, e } = yield* fx.chooseOne(g, me, "hammer", opts);
      m.energies.splice(m.energies.indexOf(e), 1);
      g.p(1 - me).discard.push(e);
    },
  },
  {
    name: "Energy Recycler",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.isBasicEnergy(g, c)),
    *play(g, me) { yield* fx.recover(g, me, fx.isBasicEnergy, 5, "deck", "recycler"); },
  },
  {
    name: "Fighting Gong",
    *play(g, me) {
      yield* fx.searchDeck(g, me, (gg, c) => isBasicType("F")(gg, c) || (fx.isBasicPokemon(gg, c) && gg.def(c).type === "F"), 1, "hand", 0, "search");
    },
  },
  {
    name: "Premium Power Pro",
    turnPassive: {
      damageBefore: (g, ctx, owner) =>
        ctx.attackerOwner === owner && ctx.targetOwner !== owner && ctx.toActive && g.top(ctx.attacker).type === "F" ? ctx.damage + 30 : ctx.damage,
    },
  },
  {
    name: "Team Rocket's Transceiver",
    *play(g, me) { yield* fx.searchDeck(g, me, trSupporter, 1, "hand", 0, "search"); },
  },
  {
    name: "Roto-Stick",
    canPlay: (g, me) => g.p(me).deck.length > 0,
    *play(g, me) { yield* fx.lookTop(g, me, 4, fx.isSupporter, 4, 0, "shuffle", "look_top"); },
  },
  {
    name: "Miracle Headset",
    canPlay: (g, me) => g.p(me).discard.some(c => fx.isSupporter(g, c)),
    *play(g, me) { yield* fx.recover(g, me, fx.isSupporter, 2, "hand", "recover"); },
  },
  // --- Pokémon ---
  {
    name: "Tatsugiri",
    version: c => (c.abilities ?? []).some(a => a.name === "Attract Customers"),
    abilities: {
      "Attract Customers": {
        canUse: (g, me, mon) => g.p(me).active === mon && g.p(me).deck.length > 0,
        *use(g, me) { yield* fx.lookTop(g, me, 6, fx.isSupporter, 1, 0, "shuffle", "look_top"); },
      },
    },
  },
  {
    name: "Mew ex",
    version: c => (c.abilities ?? []).some(a => a.name === "Memory Helix"),
    tags: ["memory_helix"],
    abilities: {},
    covers: ["Memory Helix"],
    attacks: {
      "Teleportation Burst": {
        *after(g, me) { if (g.p(me).bench.length && (yield* fx.choose(g, me, "teleport", ["sì"], 0, 1)).length) yield* fx.switchOwn(g, me); },
      },
    },
  },
  { name: "Applin", version: c => (c.attacks ?? []).some(a => a.name === "Find a Friend"), attacks: { "Find a Friend": { *effect(g, me) { yield* fx.searchDeck(g, me, fx.isPokemon, 1, "hand", 0, "search"); } } } },
  { name: "Rellor", version: c => (c.attacks ?? []).some(a => a.name === "Slight Intrusion"), attacks: { "Slight Intrusion": selfDamage(10) } },
  {
    name: "Rabsca",
    version: c => (c.abilities ?? []).some(a => a.name === "Spherical Shield"),
    abilities: {},
    covers: ["Spherical Shield"],
    passive: {
      damageAfter: (g, ctx, owner) => (ctx.targetOwner === owner && ctx.attackerOwner !== owner && !ctx.toActive ? 0 : ctx.damage),
      preventsEffects: (g, target, source, owner) => source !== owner && g.p(owner).bench.includes(target),
    },
    attacks: { Psychic: { *effect(g, me) { const o = g.p(1 - me).active; return 10 + 30 * (o ? o.energies.length : 0); } } },
  },
  {
    name: "Alakazam",
    version: c => (c.attacks ?? []).some(a => a.name === "Strange Hacking"),
    attacks: {
      "Strange Hacking": {
        *effect(g, me) {
          const o = g.p(1 - me).active;
          if (o) fx.inflict(g, me, o, "confused");
          hackCounters(g, me);
          return 0;
        },
      },
      Psychic: { *effect(g, me) { const o = g.p(1 - me).active; return 10 + 50 * (o ? o.energies.length : 0); } },
    },
  },
  {
    name: "Annihilape",
    version: c => (c.attacks ?? []).some(a => a.name === "Destined Fight"),
    attacks: {
      Tantrum: { *after(g, me) { const a = g.p(me).active; if (a) a.conditions = [...a.conditions.filter(c => !["asleep", "paralyzed", "confused"].includes(c)), "confused"]; } },
      "Destined Fight": {
        *after(g, me) {
          const a = g.p(me).active, o = g.p(1 - me).active;
          if (o && !fx.prevented(g, o, me)) o.damage = maxHp(g, o);
          if (a) a.damage = maxHp(g, a);
          yield* checkKO(g);
        },
      },
    },
  },
  {
    name: "Elgyem",
    version: c => (c.attacks ?? []).some(a => a.name === "Slight Shift"),
    attacks: {
      "Slight Shift": {
        *effect(g, me) {
          const o = g.p(1 - me);
          if (o.active && o.active.energies.length && o.bench.length && !fx.prevented(g, o.active, me)) o.bench[0].energies.push(o.active.energies.pop()!);
        },
      },
    },
  },
  { name: "Dedenne", version: c => (c.attacks ?? []).some(a => a.name === "Electromagnetic Sonar"), attacks: { "Electromagnetic Sonar": { *effect(g, me) { yield* fx.recover(g, me, (gg, c) => gg.def(c).kind === "trainer", 1, "hand", "recover"); } } } },
  {
    name: "Dwebble",
    version: c => (c.attacks ?? []).some(a => a.name === "Ascension"),
    attacks: {
      Ascension: {
        *effect(g, me) {
          const a = g.p(me).active!;
          const [c] = yield* fx.searchDeck(g, me, (gg, x) => gg.def(x).evolvesFrom === g.top(a).name, 1, "hand", 0, "search");
          if (c !== undefined) yield* fx.evolveWith(g, me, a, c);
          return 0;
        },
      },
    },
  },
  {
    name: "Crustle",
    version: c => (c.abilities ?? []).some(a => a.name === "Mysterious Rock Inn"),
    abilities: {},
    covers: ["Mysterious Rock Inn", "Superb Scissors"],
    passive: {
      damageAfter: (g, ctx, owner, self) =>
        ctx.target === self && ctx.attackerOwner !== owner && (g.top(ctx.attacker).tags ?? []).includes("ex") ? 0 : ctx.damage,
    },
  },
  {
    name: "Chikorita",
    version: c => (c.attacks ?? []).some(a => a.name === "Growl"),
    attacks: {
      Growl: { *after(g, me) { const o = g.p(1 - me).active; if (o && !fx.prevented(g, o, me)) { o.used.weaken_turn = g.s.turn + 1; o.used.weaken = 20; } } },
    },
  },
  { name: "Tapu Bulu", version: c => (c.attacks ?? []).some(a => a.name === "Wood Hammer"), attacks: { "Wood Hammer": selfDamage(30) } },
  { name: "Beldum", version: c => (c.attacks ?? []).some(a => a.name === "Iron Tackle"), attacks: { "Iron Tackle": selfDamage(10) } },
  {
    name: "Metang",
    version: c => (c.abilities ?? []).some(a => a.name === "Metal Maker"),
    abilities: {
      "Metal Maker": {
        canUse: (g, me) => g.p(me).deck.length > 0,
        *use(g, me) {
          const p = g.p(me);
          const top = p.deck.splice(Math.max(0, p.deck.length - 4));
          for (const c of top.filter(x => isBasicType("M")(g, x))) {
            const t = yield* fx.chooseOne(g, me, "attach_target", g.inPlay(me));
            t.energies.push(c);
          }
          p.deck.unshift(...top.filter(x => !isBasicType("M")(g, x)));
        },
      },
    },
  },
  { name: "Drilbur", version: c => (c.attacks ?? []).some(a => a.name === "Call for Family"), attacks: { "Call for Family": callForFamily } },
  { name: "Toxel", version: c => (c.attacks ?? []).some(a => a.name === "Call for Family"), attacks: { "Call for Family": callForFamily } },
  {
    name: "Mega Excadrill ex",
    attacks: {
      Undermine: { *effect(g, me) { const o = g.p(1 - me); o.discard.push(...o.deck.splice(Math.max(0, o.deck.length - 2))); } },
      "Maximum Drilling": {
        *effect(g, me) {
          const a = g.p(me).active!;
          return 200 + (a.energies.length >= 3 + 2 ? 130 : 0); // costo {M}{M}{M} più 2 Energie extra
        },
      },
    },
  },
  { name: "Piplup", version: c => (c.attacks ?? []).some(a => a.name === "Call for Support"), attacks: { "Call for Support": searchSupporter } },
  {
    name: "Empoleon ex",
    abilities: {},
    covers: ["Emperor's Stance"],
    passive: { preventsEffects: (_g, target, source, owner, self) => target === self && source !== owner },
    attacks: { "Iron Feathers": reduceNext(60) },
  },
  {
    name: "Genesect ex",
    abilities: {
      "Metallic Signal": {
        canUse: (g, me) => g.p(me).deck.length > 0,
        *use(g, me) { yield* fx.searchDeck(g, me, (gg, c) => isEvolution(gg, c) && gg.def(c).type === "M", 2, "hand", 0, "search"); },
      },
    },
    attacks: { "Protect Charge": reduceNext(30) },
  },
  {
    name: "Mega Skarmory ex",
    attacks: {
      "Sonic Ripper": {
        *effect(g, me) {
          const p = g.p(me), a = p.active!;
          p.deck.push(...a.energies.splice(0));
          fx.shuffleDeck(g, me);
          const t = yield* fx.chooseOne(g, me, "counters", g.inPlay(1 - me));
          applyDamage(g, a, t, 220, t === g.p(1 - me).active);
          return 0;
        },
      },
    },
  },
  {
    name: "Abra",
    version: c => (c.abilities ?? []).some(a => a.name === "Teleporter"),
    abilities: {
      Teleporter: {
        canUse: (g, me, mon) => g.p(me).active === mon && g.p(me).bench.length > 0,
        *use(g, me, mon) {
          const p = g.p(me);
          p.active = null;
          p.deck.push(...mon.stack, ...mon.energies, ...mon.tools);
          fx.shuffleDeck(g, me);
        },
      },
    },
  },
  { name: "Riolu", version: c => (c.attacks ?? []).some(a => a.name === "Accelerating Stab"), attacks: { "Accelerating Stab": lockSelf("Accelerating Stab") } },
  {
    name: "Mega Lucario ex",
    attacks: {
      "Aura Jab": {
        *after(g, me) {
          const p = g.p(me);
          if (!p.bench.length) return;
          for (const c of yield* fx.choose(g, me, "attach_discard", p.discard.filter(x => isBasicType("F")(g, x)), 0, 3)) {
            const t = yield* fx.chooseOne(g, me, "attach_discard_target", p.bench);
            p.discard.splice(p.discard.indexOf(c), 1);
            t.energies.push(c);
          }
        },
      },
      "Mega Brave": lockSelf("Mega Brave"),
    },
  },
  {
    name: "Solrock",
    version: c => (c.attacks ?? []).some(a => a.name === "Cosmic Beam"),
    attacks: {
      "Cosmic Beam": {
        *effect(g, me) {
          const p = g.p(me), o = g.p(1 - me).active;
          if (!p.bench.some(m => g.top(m).name === "Lunatone") || !o) return 0;
          applyDamage(g, p.active!, o, 70, false); // senza debolezza né resistenza
          return 0;
        },
      },
    },
  },
  {
    name: "Hariyama",
    version: c => (c.abilities ?? []).some(a => a.name === "Heave-Ho Catcher"),
    abilities: {
      "Heave-Ho Catcher": { trigger: "evolve", canUse: (g, me) => g.p(1 - me).bench.length > 0, *use(g, me) { yield* fx.gust(g, me); } },
    },
    attacks: { "Wild Press": selfDamage(70) },
  },
  {
    name: "Lunatone",
    version: c => (c.abilities ?? []).some(a => a.name === "Lunar Cycle"),
    abilities: {
      "Lunar Cycle": {
        canUse: (g, me) => g.p(me).flags.lunar !== g.s.turn && g.inPlay(me).some(m => g.top(m).name === "Solrock")
          && g.p(me).hand.some(c => isBasicType("F")(g, c)) && g.p(me).deck.length > 0,
        *use(g, me) {
          g.p(me).flags.lunar = g.s.turn;
          yield* fx.discardFromHand(g, me, 1, isBasicType("F"), 1, "discard");
          fx.draw(g, me, 3);
        },
      },
    },
  },
  {
    name: "Team Rocket's Murkrow",
    attacks: {
      Deceit: searchSupporter,
      Torment: {
        *after(g, me) {
          const o = g.p(1 - me).active;
          if (!o || fx.prevented(g, o, me)) return;
          const atks = g.top(o).attacks ?? [];
          if (!atks.length) return;
          const best = atks.reduce((a, b) => (b.damage >= a.damage ? b : a));
          o.used["lock:" + best.name] = g.s.turn + 1;
        },
      },
    },
  },
  {
    name: "Team Rocket's Honchkrow",
    attacks: {
      "Rocket Feathers": {
        *effect(g, me) { return 60 * (yield* fx.discardFromHand(g, me, 99, trSupporter, 0, "rocket_feathers")).length; },
      },
    },
  },
  {
    name: "Team Rocket's Porygon",
    attacks: {
      Hacking: {
        *effect(g, me) {
          if (!g.p(me).hand.length) return;
          yield* fx.discardFromHand(g, me, 1, fx.any, 1, "discard");
          if (g.p(1 - me).hand.length) yield* fx.discardFromHand(g, 1 - me, 1, fx.any, 1, "discard");
        },
      },
    },
  },
  { name: "Team Rocket's Porygon2", attacks: { "R Command": { *effect(g, me) { return 20 * fx.countDiscard(g, me, trSupporter); } } } },
  {
    name: "Team Rocket's Articuno",
    abilities: {},
    covers: ["Repelling Veil"],
    passive: {
      preventsEffects: (g, target, source, owner) =>
        source !== owner && g.inPlay(owner).includes(target) && g.top(target).sub === "basic" && g.top(target).name.startsWith("Team Rocket's"),
    },
    attacks: {
      "Dark Frost": {
        *effect(g, me) { const a = g.p(me).active!; return 60 + (a.energies.some(e => g.def(e).name === "Team Rocket's Energy") ? 60 : 0); },
      },
    },
  },
  { name: "Carvanha", version: c => (c.attacks ?? []).some(a => a.name === "Reckless Charge"), attacks: { "Reckless Charge": selfDamage(10) } },
  {
    name: "Mega Sharpedo ex",
    attacks: {
      "Greedy Fang": { *effect(g, me) { fx.draw(g, me, 2); } },
      "Hungry Jaws": { *effect(g, me) { return 120 + (g.p(me).active!.damage > 0 ? 150 : 0); } },
    },
  },
  {
    name: "Toxtricity",
    version: c => (c.abilities ?? []).some(a => a.name === "Sinister Surge"),
    abilities: {
      "Sinister Surge": {
        canUse: (g, me) => g.p(me).bench.some(m => g.top(m).type === "D") && g.p(me).deck.some(c => isBasicType("D")(g, c)),
        *use(g, me) {
          const p = g.p(me);
          const e = p.deck.find(c => isBasicType("D")(g, c))!;
          const t = yield* fx.chooseOne(g, me, "attach_target", p.bench.filter(m => g.top(m).type === "D"));
          p.deck.splice(p.deck.indexOf(e), 1);
          t.energies.push(e);
          t.damage += 20;
          fx.shuffleDeck(g, me);
        },
      },
    },
  },
  {
    name: "Buneary",
    version: c => (c.attacks ?? []).some(a => a.name === "Run Around"),
    attacks: { "Run Around": { *after(g, me) { yield* fx.switchOwn(g, me); } } },
  },
  {
    name: "Mega Lopunny ex",
    covers: ["Spiky Hopper"],
    attacks: {
      "Gale Thrust": {
        *effect(g, me) { return 60 + (g.p(me).active!.used.became_active === g.s.turn ? 170 : 0); },
      },
    },
  },
  {
    name: "Fan Rotom",
    version: c => (c.abilities ?? []).some(a => a.name === "Fan Call"),
    abilities: {
      "Fan Call": {
        canUse: (g, me) => g.s.turn <= 2 && g.p(me).flags.fan_call !== g.s.turn,
        *use(g, me) {
          g.p(me).flags.fan_call = g.s.turn;
          yield* fx.searchDeck(g, me, (gg, c) => gg.def(c).kind === "pokemon" && gg.def(c).type === "C" && (gg.def(c).hp ?? 0) <= 100, 3, "hand", 0, "search");
        },
      },
    },
    attacks: { "Assault Landing": { *effect(g) { return g.s.stadium === null ? 0 : undefined; } } },
  },
];
