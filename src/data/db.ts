/**
 * Database delle carte importate (data/cards.json), con ricerca per id e per nome.
 * La classe è in carddb.ts (va anche nel browser); qui solo il caricamento da file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CardDB } from "./carddb.js";

export { CardDB, normName } from "./carddb.js";

export const CARDS_PATH = fileURLToPath(new URL("../../data/cards.json", import.meta.url));

export function loadCardDB(path = CARDS_PATH): CardDB {
  return new CardDB(JSON.parse(readFileSync(path, "utf8")));
}

let shared: CardDB | null = null;
export function db(): CardDB {
  return (shared ??= loadCardDB());
}
