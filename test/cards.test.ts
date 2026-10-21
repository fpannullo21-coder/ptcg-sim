import { describe as suite, expect, test } from "vitest";
import { applyDamage, attackCost, checkKO, retreatCost, passives } from "../src/engine/game.js";
import type { Gen } from "../src/engine/types.js";
import { position, run, names, actions, most } from "./kit.js";

const HNS6 = ["Shuppet", "Shuppet", "Banette", "Banette", "Poltchageist", "Sinistcha"];
const HNS13 = [...HNS6, "Shuppet", "Shuppet", "Banette", "Banette", "Poltchageist", "Poltchageist", "Sinistcha"];
const DHELMISE = "PBL-91";

function attack(g: ReturnType<typeof position>, name: string) {
  const a = g.me().active!;
  const atk = g.top(a).attacks!.find(x => x.name === name)!;
  const r = atk.effect ? run(atk.effect(g, g.s.current) as Gen<number | void>) : undefined;
  return typeof r === "number" ? r : atk.damage;
}

suite("Hide n' Sneak", () => {
  test("Vengeful Anchor: 30, poi 170 con 4 Hide 'n' Sneak negli scarti", () => {
    expect(attack(position({ active: DHELMISE, discard: HNS6.slice(0, 3) }), "Vengeful Anchor")).toBe(30);
    expect(attack(position({ active: DHELMISE, discard: HNS6.slice(0, 4) }), "Vengeful Anchor")).toBe(170);
  });

  test("Matcha Spin: 4 segnalini su ogni Pokémon avversario solo con 6 negli scarti", () => {
    let g = position({ active: "Sinistcha", discard: HNS6.slice(0, 5) }, { active: "Dragapult ex", bench: ["Drakloak"] });
    attack(g, "Matcha Spin");
    expect(g.inPlay(1).map(m => m.damage)).toEqual([0, 0]);
    g = position({ active: "Sinistcha", discard: HNS6 }, { active: "Dragapult ex", bench: ["Drakloak"] });
    attack(g, "Matcha Spin");
    expect(g.inPlay(1).map(m => m.damage)).toEqual([40, 40]);
  });

  test("Hide 'n' Sneak blocca i segnalini avversari ma non il danno", () => {
    const g = position({ active: "Sinistcha", discard: HNS6 }, { active: "Shuppet", bench: ["Banette"] });
    attack(g, "Matcha Spin");
    expect(g.inPlay(1).map(m => m.damage)).toEqual([0, 0]);
    expect(applyDamage(g, g.p(0).active!, g.p(1).active!, 30)).toBe(30);
  });

  test("Spiritual End quadruplica i segnalini su 2 Pokémon, solo con 13 negli scarti", () => {
    const g = position({ active: "PBL-35", discard: HNS13 }, { active: "Dragapult ex", bench: ["Drakloak", "Dreepy"] });
    g.inPlay(1).forEach(m => (m.damage = 80));
    attack(g, "Spiritual End");
    expect(g.inPlay(1).map(m => m.damage)).toEqual([320, 320, 80]);
    const h = position({ active: "PBL-35", discard: HNS13.slice(0, 12) }, { active: "Dragapult ex" });
    h.p(1).active!.damage = 80;
    attack(h, "Spiritual End");
    expect(h.p(1).active!.damage).toBe(80);
  });

  test("Telepathic Psychic Energy su un Pokémon Psico mette in panchina 2 Pokémon Base Psico", () => {
    const g = position({ active: "Shuppet", hand: ["Telepathic Psychic Energy"], deck: ["Dhelmise", "Shuppet", "Poltchageist"] });
    const a = actions(g).find(x => x.kind === "attach" && x.target === -1)!;
    const d = g.def((a as { card: number }).card);
    g.p(0).hand = [];
    g.p(0).active!.energies.push((a as { card: number }).card);
    run(d.onAttach!(g, 0, g.p(0).active!));
    expect(g.p(0).bench.map(m => g.top(m).name).sort()).toEqual(["Dhelmise", "Shuppet"]);
  });
});

suite("Allenatori", () => {
  test("Lillie's Determination: 8 carte con 6 premi, 6 altrimenti", () => {
    const deck = Array(20).fill("Psychic Energy");
    for (const [prizes, n] of [[6, 8], [5, 6]]) {
      const g = position({ active: "Shuppet", hand: ["Lillie's Determination", "Gwynn"], deck, prizes });
      const c = g.p(0).hand.shift()!;
      run(g.def(c).play!(g, 0));
      expect(g.p(0).hand.length).toBe(n);
    }
  });

  test("Ultra Ball: scarta 2 carte e prende un Pokémon; non si gioca con meno di 2 altre carte", () => {
    let g = position({ active: "Shuppet", hand: ["Ultra Ball", "Gwynn"], deck: ["Dhelmise"] });
    expect(actions(g).some(a => a.kind === "trainer" && g.name((a as { card: number }).card) === "Ultra Ball")).toBe(false);
    g = position({ active: "Shuppet", hand: ["Ultra Ball", "Gwynn", "Naveen"], deck: ["Dhelmise"] });
    const ub = g.p(0).hand[0];
    g.p(0).hand.splice(0, 1);
    run(g.def(ub).play!(g, 0));
    expect(names(g, g.p(0).hand)).toEqual(["Dhelmise"]);
    expect(names(g, g.p(0).discard)).toEqual(["Gwynn", "Naveen"]);
  });

  test("Explorer's Guidance: 2 in mano, 4 negli scarti", () => {
    const eg = position({ active: "Shuppet", hand: ["Explorer's Guidance"], deck: ["Dhelmise", "Banette", "Gwynn", "Naveen", "Ultra Ball", "Poké Pad", "Sinistcha"] });
    const c = eg.p(0).hand.shift()!;
    run(eg.def(c).play!(eg, 0));
    expect(names(eg, eg.p(0).hand)).toEqual(["Banette", "Dhelmise"]);
    expect(eg.p(0).discard.length).toBe(4);
    expect(names(eg, eg.p(0).deck)).toEqual(["Sinistcha"]);
  });

  test("Gwynn: 3 carte per ogni Pokémon senza Regola scartato", () => {
    const g = position({ active: "Shuppet", hand: ["Gwynn", "Banette", "Latias ex", "Shuppet"], deck: Array(10).fill("Psychic Energy") });
    const c = g.p(0).hand.shift()!;
    run(g.def(c).play!(g, 0));
    expect(names(g, g.p(0).discard)).toEqual(["Banette", "Shuppet"]);
    expect(g.p(0).hand.length).toBe(1 + 6);
  });

  test("Black Belt's Training: +40 sull'attivo ex avversario, solo in questo turno", () => {
    const g = position({ active: DHELMISE, hand: ["Black Belt's Training"] }, { active: "Dragapult ex", bench: ["Drakloak"] });
    const bb = g.p(0).hand.shift()!;
    g.s.turnEffects.push({ card: bb, owner: 0, until: g.s.turn });
    expect(applyDamage(g, g.p(0).active!, g.p(1).active!, 170)).toBe(210);
    expect(applyDamage(g, g.p(0).active!, g.p(1).bench[0], 100, false)).toBe(100);
    g.s.turn++;
    expect(passives(g).length).toBe(0);
  });

  test("Jamming Tower spegne gli Strumenti", () => {
    // Dhelmise ha ritirata 3: con Air Balloon 1, con Jamming Tower in campo di nuovo 3
    const g = position({ active: [DHELMISE, "Air Balloon"] });
    expect(retreatCost(g, g.p(0).active!)).toBe(1);
    const jt = position({ active: [DHELMISE, "Air Balloon"], hand: ["Jamming Tower"] });
    jt.s.stadium = jt.p(0).hand.shift()!;
    expect(retreatCost(jt, jt.p(0).active!)).toBe(3);
  });
});

suite("Pokémon di supporto ed Energie", () => {
  test("Legacy Energy: un premio in meno, una sola volta per partita", () => {
    const g = position({ active: ["Shuppet"], bench: [["Dhelmise", "Legacy Energy"], ["Dhelmise", "Legacy Energy"]] }, { active: "Dragapult ex" }, 5, 1);
    g.s.attacking = 1;
    const before = g.p(1).hand.length;
    g.p(0).bench[0].damage = 999;
    run(checkKO(g));
    expect(g.p(1).hand.length - before).toBe(0);
    g.p(0).bench[0].damage = 999;
    run(checkKO(g));
    expect(g.p(1).hand.length - before).toBe(1);
  });

  test("Bloodmoon Ursaluna ex: Blood Moon costa 1 {C} in meno per ogni premio preso dall'avversario", () => {
    // l'avversario (giocatore 1) non ha preso premi: costo pieno
    const g = position({ active: "Bloodmoon Ursaluna ex" }, { prizes: 6 });
    expect(attackCost(g, g.p(0).active!, g.top(g.p(0).active!).attacks![0]).length).toBe(5);
    // l'avversario ne ha presi 3: costa 2
    const h = position({ active: "Bloodmoon Ursaluna ex" }, { prizes: 3 });
    expect(attackCost(h, h.p(0).active!, h.top(h.p(0).active!).attacks![0]).length).toBe(2);
  });

  test("Latias ex: i Pokémon Base non hanno costo di ritirata", () => {
    const g = position({ active: "PBL-91", bench: ["Latias ex"] });
    expect(retreatCost(g, g.p(0).active!)).toBe(0);
  });

  test("Lillie's Clefairy ex: i Pokémon Drago avversari diventano deboli al Psico", () => {
    const g = position({ active: "Lillie's Clefairy ex" }, { active: "Dragapult ex" });
    expect(applyDamage(g, g.p(0).active!, g.p(1).active!, 50)).toBe(100);
  });

  test("Blood Moon: l'attaccante non può attaccare il turno dopo", () => {
    const g = position({ active: ["Bloodmoon Ursaluna ex", "Psychic Energy", "Psychic Energy", "Psychic Energy", "Psychic Energy", "Psychic Energy"] }, { active: "Shuppet" });
    attack(g, "Blood Moon");
    g.s.turn += 2;
    expect(actions(g).some(a => a.kind === "attack")).toBe(false);
    g.s.turn += 2;
    expect(actions(g).some(a => a.kind === "attack")).toBe(true);
  });
});

void most;
