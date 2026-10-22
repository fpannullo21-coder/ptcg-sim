/**
 * Dati pubblici del sito (web/public/data): rispettano docs/LEGALE.md e bastano al motore.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe as suite, expect, test } from "vitest";
import { CardDB } from "../src/data/carddb.js";
import { parseDeck } from "../src/data/decklist.js";
import { Registry } from "../src/cards/registry.js";
import { IMPLS } from "../src/cards/impl/index.js";
import { playGame } from "../src/engine/game.js";
import { BasicAgent } from "../src/ai/basic.js";

const DIR = new URL("../web/public/data/", import.meta.url);
const has = existsSync(new URL("cards.json", DIR));

suite.skipIf(!has)("dati pubblici del sito", () => {
  const cards = has ? JSON.parse(readFileSync(new URL("cards.json", DIR), "utf8")) : null;
  const meta = has ? JSON.parse(readFileSync(new URL("meta.json", DIR), "utf8")) : null;

  test("nessun testo delle carte: solo segnaposto", () => {
    for (const c of cards.cards) {
      expect(c.rules).toBeUndefined();
      for (const a of [...(c.attacks ?? []), ...(c.abilities ?? [])]) expect(["", "•"]).toContain(a.text);
      expect(c.key).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test("liste dei Regional: piazzamento e torneo sempre, nome del giocatore solo se richiesto", () => {
    for (const a of meta.archetypes) {
      expect(a.list).not.toMatch(/^#/m);
      expect(a.place).toMatch(/\d+° Regional /);
    }
    expect(meta.lists.length).toBeGreaterThan(150);
    for (const l of meta.lists) {
      expect(l.place).toBeGreaterThan(0);
      expect(l.event).toMatch(/^Regional /);
      if (meta.names) expect(l.player).not.toBe("");
      else expect(l.player).toBe("");
    }
  });

  test("le liste del meta si leggono e si giocano con i dati pubblici", () => {
    const reg = new Registry(new CardDB(structuredClone(cards)), IMPLS);
    const decks = meta.archetypes.map((a: { list: string; name: string }) => {
      const d = parseDeck(a.list, reg.db, a.name);
      expect(d.entries.filter(e => !e.card)).toEqual([]);
      return reg.deck(d);
    });
    const m = playGame([decks[0], decks[1]], [new BasicAgent(), new BasicAgent()], 3);
    expect(m.over).toBe(true);
  });
});
