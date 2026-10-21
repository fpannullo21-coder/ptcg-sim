import { describe as suite, expect, test } from "vitest";
import { applyDamage, attack, retreatCost } from "../src/engine/game.js";
import { position, run } from "./kit.js";

suite("carte del meta", () => {
  test("Crustle: nessun danno dai Pokémon ex", () => {
    const g = position({ active: "Dragapult ex" }, { active: "DRI-12" }, 5, 0);
    expect(applyDamage(g, g.p(0).active!, g.p(1).active!, 200)).toBe(0);
    const h = position({ active: "Dreepy" }, { active: "DRI-12" }, 5, 0);
    expect(applyDamage(h, h.p(0).active!, h.p(1).active!, 70)).toBeGreaterThan(0);
  });

  test("Rabsca: niente danni da attacchi alla panchina", () => {
    const g = position({ active: "Dragapult ex" }, { active: "Grookey", bench: ["TEF-24"] }, 5, 0);
    expect(applyDamage(g, g.p(0).active!, g.p(1).bench[0], 60, false)).toBe(0);
  });

  test("Punk Helmet: 4 segnalini a chi colpisce il Pokémon Oscurità attivo", () => {
    const g = position({ active: "Dreepy" }, { active: ["N's Zoroark ex", "Punk Helmet"] }, 5, 0);
    applyDamage(g, g.p(0).active!, g.p(1).active!, 30);
    expect(g.p(0).active!.damage).toBe(40);
  });

  test("Iron Feathers: 60 danni in meno nel turno dell'avversario", () => {
    const g = position({ active: "Empoleon ex" }, { active: "Dragapult ex" }, 5, 0);
    g.p(0).active!.used.reduce_turn = 6;
    g.p(0).active!.used.reduce = 60;
    g.s.turn = 6; g.s.current = 1;
    expect(applyDamage(g, g.p(1).active!, g.p(0).active!, 200)).toBe(140);
  });

  test("Riolu: Accelerating Stab non si può usare due turni di fila", () => {
    const g = position({ active: ["MEG-76", "Fighting Energy"] }, { active: "Shuppet" }, 5, 0);
    run(attack(g, 0));
    expect(g.p(0).active!.used["lock:Accelerating Stab"]).toBe(7);
  });

  test("Growing Grass Energy: +20 PS a un Pokémon Erba", () => {
    const g = position({ active: ["Grookey", "Growing Grass Energy"] });
    expect(g.hpLeft(g.p(0).active!)).toBe((g.top(g.p(0).active!).hp ?? 0) + 20);
  });

  test("Latias ex e Mega Lopunny: i Pokémon Base senza ritirata, Gale Thrust +170 se appena entrato", () => {
    const g = position({ active: "Buneary", bench: ["Latias ex"] });
    expect(retreatCost(g, g.p(0).active!)).toBe(0);
  });
});
