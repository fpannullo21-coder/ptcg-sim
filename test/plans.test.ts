import { describe as suite, expect, test } from "vitest";
import { legalActions } from "../src/engine/game.js";
import { BasicAgent } from "../src/ai/basic.js";
import { topCard } from "../src/cards/effects.js";
import { position } from "./kit.js";

suite("piani di mazzo (risposte di Francesco)", () => {
  test("Night Joker: Darmanitan per due Base, Zekrom per i Pokémon grandi", () => {
    const zoroark = { active: ["N's Zoroark ex", "Darkness Energy", "Darkness Energy"] as [string, ...string[]], bench: ["JTG-27", "ASC-155"] };
    const a = new BasicAgent();
    const best = (g: ReturnType<typeof position>) => {
      const opts = g.p(0).bench.flatMap(m => (g.top(m).attacks ?? []).map((_, i) => [topCard(m), i] as [number, number]));
      const [c, i] = opts.reduce((x, y) => (a.copyValue(g, 0, y[0], y[1]) > a.copyValue(g, 0, x[0], x[1]) ? y : x));
      return g.def(c).attacks![i].name;
    };
    expect(best(position(zoroark, { active: "Dreepy", bench: ["Dreepy"] }))).toBe("Flamebody Cannon");
    expect(best(position(zoroark, { active: "Dragapult ex", bench: ["Dragapult ex"] }))).toBe("Rampaging Thunder");
  });

  test("Seek Inspiration: Trifrost sui Pokémon Base piccoli", () => {
    const g = position({ active: ["SCR-58", "Psychic Energy", "Psychic Energy"], deck: ["SFA-47", "CRI-61"] }, { active: "PBL-6", bench: ["PBL-5", "PBL-5"] }, 5, 0);
    const a = new BasicAgent();
    const [kyurem, metagross] = [...g.p(0).deck].reverse();
    expect(a.seekValue(g, 0, kyurem)).toBeGreaterThan(a.seekValue(g, 0, metagross));
  });

  test("Slowking: l'Energia va allo Slowpoke in panchina, non a Mega Kangaskhan ex in attivo", () => {
    const g = position({ active: "Mega Kangaskhan ex", bench: ["SCR-57"], hand: ["Psychic Energy"], deck: ["SCR-58"] }, { active: "Dreepy" }, 5, 0);
    const acts = legalActions(g);
    const pick = acts[new BasicAgent().action(g, 0, acts)];
    expect(pick.kind).toBe("attach");
    expect((pick as { target: number }).target).toBe(0);
  });
});

suite("Honchkrow (risposte di Francesco)", () => {
  test("Rocket Feathers scarta solo i Supporter che servono per il KO", () => {
    const g = position(
      { active: ["Team Rocket's Honchkrow", "Team Rocket's Energy"], hand: ["Team Rocket's Ariana", "Team Rocket's Petrel", "Team Rocket's Archer", "Team Rocket's Giovanni"] },
      { active: "Dreepy" }, 5, 0);
    const opts = [...g.p(0).hand];
    const pick = new BasicAgent().decide(g, { player: 0, kind: "rocket_feathers", options: opts, min: 0, max: 99 });
    // Dreepy ha 70 PS: bastano due Supporter, e si scartano prima Archer e Giovanni
    expect(pick.map(i => g.name(opts[i])).sort()).toEqual(["Team Rocket's Archer", "Team Rocket's Giovanni"]);
  });
});

suite("contro Dragapult (risposte di Francesco)", () => {
  test("Zoroark ex danneggiato copia Powerful Rage di N's Reshiram", () => {
    const g = position({ active: ["N's Zoroark ex", "Darkness Energy", "Darkness Energy"], bench: ["JTG-116", "ASC-155"] }, { active: "Dragapult ex" });
    g.p(0).active!.damage = 200;
    const a = new BasicAgent();
    const opts = g.p(0).bench.flatMap(m => (g.top(m).attacks ?? []).map((_, i) => [topCard(m), i] as [number, number]));
    const [c, i] = opts.reduce((x, y) => (a.copyValue(g, 0, y[0], y[1]) > a.copyValue(g, 0, x[0], x[1]) ? y : x));
    expect(g.def(c).attacks![i].name).toBe("Powerful Rage");
  });

  test("Basic Box: Lillie's Clefairy ex in panchina appena l'avversario ha un Drago in campo", () => {
    const g = position({ active: "Mega Kangaskhan ex", bench: ["Latias ex"], hand: ["Lillie's Clefairy ex"] }, { active: "Dreepy" });
    const a = new BasicAgent();
    expect(a.benchValue(g, 0, g.p(0).hand[0])).toBeGreaterThanOrEqual(95);
  });
});
