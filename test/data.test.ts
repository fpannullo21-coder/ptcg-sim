import { describe as suite, expect, test } from "vitest";
import { db } from "../src/data/db.js";
import { checkDeck, parseDeck } from "../src/data/decklist.js";
import { loadDecks } from "../src/data/decks.js";
import { registry } from "../src/cards/index.js";

const cards = db();

suite("database delle carte", () => {
  test("contiene le carte di Hide n' Sneak con i numeri giusti", () => {
    const d = cards.byId.get("PBL-91")!;
    expect(d.name).toBe("Dhelmise");
    expect(d.hp).toBe(140);
    expect(cards.byId.get("PBL-6")!.abilities![0].name).toBe("Hide 'n' Sneak");
  });
  test("le Energie base hanno il nome stampato sulla carta", () => {
    expect(cards.byName.has("psychic energy")).toBe(true);
  });
});

suite("liste formato Live", () => {
  const text = `Pokémon: 2\n4 Shuppet PBL 33\n\nTrainer: 1\n4 Boss's Orders RCL 189\n\nEnergy: 2\n3 Basic {P} Energy MEE 13\n1 Telepathic {P} Energy POR 88\n`;
  test("riconosce set e numero, ristampe fuori database e simboli di Energia", () => {
    const d = parseDeck(text, cards);
    expect(d.entries.map(e => e.card?.name)).toEqual(["Shuppet", "Boss's Orders", "Psychic Energy", "Telepathic Psychic Energy"]);
    expect(d.entries[0].card!.id).toBe("PBL-33");
  });
  test("controlla 60 carte, massimo 4 copie, massimo 1 ACE SPEC", () => {
    const c = checkDeck(parseDeck(text + "1 Legacy Energy TWM 167\n1 Brilliant Blender SSP 164\n", cards), cards);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toMatch(/carte invece di 60/);
    expect(c.errors.join(" ")).toMatch(/ACE SPEC/);
  });
  test("tutte le liste del repository sono valide tranne quelle con carte non ancora uscite in inglese", () => {
    const bad = loadDecks(cards).filter(d => !checkDeck(d, cards).ok).map(d => d.path);
    expect(bad.every(p => p.startsWith("yokohama-2026-jp/"))).toBe(true);
  });
  test("le liste di Hide n' Sneak sono implementate per intero (tranne Lucky Helmet)", () => {
    const reg = registry();
    for (const d of loadDecks(cards).filter(d => d.path.startsWith("hide-n-sneak/"))) {
      const c = reg.coverage(d);
      expect(c.missing.filter(m => m.name !== "Lucky Helmet")).toEqual([]);
    }
  });
});
