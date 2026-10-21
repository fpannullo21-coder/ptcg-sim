/** Carica le liste dalla cartella decks/ (un file .txt per lista, formato Live). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CardDB } from "./db.js";
import { parseDeck, type Deck } from "./decklist.js";

export const DECKS_DIR = fileURLToPath(new URL("../../decks", import.meta.url));

export interface DeckFile extends Deck {
  path: string;   // es. "frankfurt-2026/07-dragapult"
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".txt") ? [p] : [];
  });
}

export function loadDecks(db: CardDB, dir = DECKS_DIR): DeckFile[] {
  return walk(dir).sort().map(p => {
    const path = relative(dir, p).replace(/\.txt$/, "");
    return { ...parseDeck(readFileSync(p, "utf8"), db, path), path };
  });
}
