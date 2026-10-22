import { describe as suite, expect, test } from "vitest";
import { registry } from "../src/cards/index.js";
import { loadDecks } from "../src/data/decks.js";
import { Match, playGame } from "../src/engine/game.js";
import { BasicAgent } from "../src/ai/basic.js";
import { MonteCarloAgent } from "../src/ai/montecarlo.js";

const reg = registry();
const decks = loadDecks(reg.db);
const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);

suite("giocatore Monte Carlo", () => {
  test("la determinizzazione non cambia le carte visibili né il numero di carte nascoste", () => {
    const m = new Match([get("hide-n-sneak/lista-per-danzica"), get("nizza-2026/02-dhelmise-maxime-launay")], 3);
    const ag = new BasicAgent();
    while (m.pending && m.g.s.turn < 4) m.answer(ag.decide(m.g, m.pending));
    const mc = new MonteCarloAgent();
    const copy = mc.determinize(m.g, 0, 99);
    const a = m.g.s.players, b = copy.s.players;
    expect(b[0].hand).toEqual(a[0].hand);                         // la mia mano la conosco
    expect(b[1].hand.length).toBe(a[1].hand.length);
    expect(b[1].deck.length).toBe(a[1].deck.length);
    expect(b[0].prizes.length).toBe(a[0].prizes.length);
    expect([...b[1].hand, ...b[1].deck, ...b[1].prizes].sort()).toEqual([...a[1].hand, ...a[1].deck, ...a[1].prizes].sort());
    expect(m.g.s.players[1].hand).toEqual(a[1].hand);              // l'originale non cambia
  });

  test("gioca una partita completa", () => {
    const m = playGame([get("hide-n-sneak/lista-per-danzica"), get("nizza-2026/02-dhelmise-maxime-launay")],
      [new MonteCarloAgent({ rollouts: 2, depth: 1, width: 3 }), new BasicAgent()], 5);
    expect(m.g.s.winner).not.toBeNull();
  }, 120000);
});
