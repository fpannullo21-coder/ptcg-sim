import { describe as suite, expect, test } from "vitest";
import { findPosition } from "../src/ai/trainer.js";
import { registry } from "../src/cards/index.js";
import { loadDecks } from "../src/data/decks.js";

suite("Allenatore", () => {
  test("una posizione ha mosse con percentuale e gli scarti di entrambi, con Hide 'n' Sneak contati", () => {
    const reg = registry();
    const decks = loadDecks(reg.db);
    const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);
    const p = findPosition(get("hide-n-sneak/lista-per-danzica"), get("brisbane-2026/01-dragapult-edmund-khoo"), "Dragapult", 5, { rollouts: 3, minSpread: 0 });
    expect(p).not.toBeNull();
    expect(p!.options.length).toBeGreaterThanOrEqual(3);
    for (const o of p!.options) { expect(o.wr).toBeGreaterThanOrEqual(0); expect(o.wr).toBeLessThanOrEqual(1); }
    for (const side of [p!.position.me, p!.position.opp]) {
      expect(side.discard.cards.reduce((s, c) => s + c.count, 0)).toBe(side.discard.total);
    }
    const hns = p!.position.me.discard.cards.filter(c => ["Shuppet", "Poltchageist", "Sinistcha", "Banette"].includes(c.name)).reduce((s, c) => s + c.count, 0);
    // nella lista per Danzica Shuppet, Banette, Poltchageist e Sinistcha hanno tutti Hide 'n' Sneak
    expect(p!.position.me.discard.hideNSneak).toBe(hns);
  }, 120000);
});
