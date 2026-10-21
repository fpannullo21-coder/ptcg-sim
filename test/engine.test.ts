import { describe as suite, expect, test } from "vitest";
import { applyDamage, canPay, legalActions, Match, newMon, playGame, G } from "../src/engine/game.js";
import type { Player } from "../src/engine/types.js";
import { GreedyAgent, RandomAgent } from "../src/ai/agents.js";
import { fireDeck, waterDeck, FIRE_E, WATER_E, RANA, SALAMANDRA } from "../src/cards/testset.js";
import * as fx from "../src/cards/effects.js";

const decks = () => [fireDeck(), waterDeck()];

function total(g: G, p: Player) {
  return p.deck.length + p.hand.length + p.prizes.length + p.discard.length
    + [p.active, ...p.bench].filter(Boolean).reduce((n, m) => n + m!.stack.length + m!.energies.length + m!.tools.length, 0);
}

suite("regole", () => {
  test("mazzi da 60", () => {
    expect(fireDeck().length).toBe(60);
    expect(waterDeck().length).toBe(60);
  });

  test("costo degli attacchi", () => {
    const m = new Match([[FIRE_E, WATER_E, ...fireDeck().slice(2)], waterDeck()], 1);
    const g = m.g;
    expect(canPay(g, [0], ["R"])).toBe(true);
    expect(canPay(g, [1], ["R"])).toBe(false);
    expect(canPay(g, [0, 1], ["R", "C"])).toBe(true);
    expect(canPay(g, [0], ["R", "C"])).toBe(false);
  });

  test("500 partite casuali finiscono e nessuna carta si perde", () => {
    for (let s = 1; s <= 500; s++) {
      const m = playGame(decks(), [new RandomAgent(s), new RandomAgent(s + 7)], s);
      expect(m.g.s.winner).not.toBeNull();
      for (const p of m.g.s.players) expect(total(m.g, p)).toBe(60);
    }
  });

  test("con il giocatore base quasi tutte le partite hanno un vincitore", () => {
    const w: Record<string, number> = { "0": 0, "1": 0, "-1": 0 };
    for (let s = 1; s <= 300; s++) w[String(playGame(decks(), [new GreedyAgent(), new GreedyAgent()], s).g.s.winner)]++;
    expect(w["-1"]).toBeLessThan(15);
    expect(w["0"]).toBeGreaterThan(0);
    expect(w["1"]).toBeGreaterThan(0);
  });

  test("debolezza x2", () => {
    const g = new Match(decks(), 1).g;
    g.s.cards.push(RANA.id, SALAMANDRA.id);
    const a = newMon(g.s.cards.length - 2, 0), t = newMon(g.s.cards.length - 1, 0);
    expect(applyDamage(g, a, t, 20)).toBe(40);
  });

  test("chi inizia non attacca al primo turno", () => {
    for (let s = 1; s <= 50; s++) {
      const m = playGame(decks(), [new GreedyAgent(), new GreedyAgent()], s, { verbose: true });
      expect(m.g.log.filter(l => l.startsWith("T1 ") && l.includes("attacca"))).toEqual([]);
    }
  });
});

suite("punti di decisione", () => {
  test("stesso seme e stesse risposte: partita identica", () => {
    const a = playGame(decks(), [new RandomAgent(3), new RandomAgent(4)], 99);
    const b = new Match(decks(), 99);
    for (const h of a.history) b.answer(h);
    expect(b.over).toBe(true);
    expect(JSON.stringify(b.g.s)).toBe(JSON.stringify(a.g.s));
  });

  test("clone a metà partita, anche dentro un effetto", () => {
    const agents = [new RandomAgent(5), new RandomAgent(6)];
    let found = 0;
    for (let seed = 1; seed <= 40 && found < 5; seed++) {
      const m = new Match(decks(), seed);
      while (m.pending && m.pending.kind !== "search") m.answer(agents[m.pending.player].decide(m.g, m.pending));
      if (!m.pending) continue;
      found++;
      const c = m.clone();
      expect(JSON.stringify(c.g.s)).toBe(JSON.stringify(m.g.s));
      expect(c.pending).toEqual(m.pending);
      // da qui le due partite proseguono uguali con le stesse risposte
      const ra = new RandomAgent(seed), rb = new RandomAgent(seed);
      while (m.pending) { m.answer(ra.decide(m.g, m.pending)); c.answer(rb.decide(c.g, c.pending!)); }
      expect(JSON.stringify(c.g.s)).toBe(JSON.stringify(m.g.s));
    }
    expect(found).toBeGreaterThan(0);
  });
});

suite("effetti", () => {
  test("cerca in panchina e in mano", () => {
    const m = new Match(decks(), 2);
    const g = m.g, p = g.p(0);
    const it = fx.searchDeck(g, 0, fx.isBasicEnergy, 3);
    let r = it.next();
    expect(r.done).toBe(false);
    r = it.next([0, 1, 2]);
    expect(r.done && r.value.length).toBe(3);
    expect(total(g, p)).toBe(60);
  });

  test("le azioni legali non hanno doppioni per carte uguali", () => {
    const m = new Match(decks(), 3);
    while (m.pending && m.pending.kind !== "action") m.answer([0]);
    const acts = legalActions(m.g).map(a => JSON.stringify({ ...a, card: undefined }));
    expect(new Set(acts).size).toBe(acts.length);
  });
});
