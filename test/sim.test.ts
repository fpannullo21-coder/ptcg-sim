import { describe as suite, expect, test } from "vitest";
import { registry } from "../src/cards/index.js";
import { loadDecks } from "../src/data/decks.js";
import { playGame } from "../src/engine/game.js";
import { BasicAgent } from "../src/ai/basic.js";
import { RandomAgent } from "../src/ai/agents.js";

const reg = registry();
const decks = loadDecks(reg.db).filter(d => d.entries.every(e => e.card));
const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);

suite("partite con carte vere", () => {
  test("ogni lista gioca 20 partite contro Hide n' Sneak senza errori e senza perdere carte", () => {
    const hns = get("hide-n-sneak/lista-per-danzica");
    for (const d of decks) {
      for (let s = 1; s <= 20; s++) {
        const m = playGame([hns, reg.deck(d)], [new BasicAgent(), new BasicAgent()], s);
        expect(m.g.s.winner).not.toBeNull();
        for (const p of m.g.s.players) {
          const n = p.deck.length + p.hand.length + p.prizes.length + p.discard.length
            + [p.active, ...p.bench].filter(Boolean).reduce((k, x) => k + x!.stack.length + x!.energies.length + x!.tools.length, 0)
            + (m.g.s.stadium !== null && m.g.s.players.indexOf(p) === m.g.s.stadiumOwner ? 1 : 0);
          expect(n).toBe(60);
        }
      }
    }
  });

  test("anche con scelte casuali (tutte le sotto-decisioni) non si rompe niente", () => {
    const a = get("hide-n-sneak/tua-dunsparce"), b = get("hide-n-sneak/vostra-2-black-belt");
    for (let s = 1; s <= 150; s++) {
      const m = playGame([a, b], [new RandomAgent(s), new RandomAgent(s * 3)], s);
      expect(m.g.s.winner).not.toBeNull();
    }
  });

  test("lo specchio è equilibrato", () => {
    const d = get("hide-n-sneak/launay-2-nizza");
    let w = 0;
    const N = 300;
    for (let s = 1; s <= N; s++) if (playGame([d, d], [new BasicAgent(), new BasicAgent()], s, { first: s % 2 }).g.s.winner === 0) w++;
    expect(Math.abs(w / N - 0.5)).toBeLessThan(0.1);
  });
});
