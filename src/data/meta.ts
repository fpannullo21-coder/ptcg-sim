/**
 * Il meta dai dati di Limitless (data/meta.json): quote degli archetipi e lista
 * rappresentativa di ciascuno (la meglio piazzata tra quelle in decks/).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DeckFile } from "./decks.js";

export interface Standing { rank: number; player: string; country: string; deck: string; list?: number }
export interface Tournament { id: number; name: string; date: string; players: number; format?: string; standings: Standing[] }

export interface Archetype {
  name: string;
  share: number;        // % dei giocatori in classifica nei tornei considerati
  top32: number;        // % dei posti nelle prime 32
  count: number;
  decks: string[];      // liste disponibili, dalla meglio piazzata
}

export const META_PATH = fileURLToPath(new URL("../../data/meta.json", import.meta.url));

export function loadTournaments(path = META_PATH): Tournament[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).tournaments ?? [];
}

/** Posizione e torneo di una lista importata, letti dalla riga "# Fonte". */
function placing(d: DeckFile): number {
  const m = d.meta["fonte"]?.match(/(\d+)° posto/);
  return m ? Number(m[1]) : 999;
}

export function archetypes(tournaments: Tournament[], decks: DeckFile[]): Archetype[] {
  const all = tournaments.flatMap(t => t.standings);
  const top = all.filter(s => s.rank <= 32);
  const names = [...new Set(all.map(s => s.deck))];
  return names.map(name => {
    const count = all.filter(s => s.deck === name).length;
    const lists = decks
      .filter(d => d.meta["archetipo"] === name && /^[a-z]+-\d{4}\//.test(d.path) && !d.path.includes("-jp/"))
      .sort((a, b) => placing(a) - placing(b))
      .map(d => d.path);
    return {
      name,
      share: (100 * count) / Math.max(1, all.length),
      top32: (100 * top.filter(s => s.deck === name).length) / Math.max(1, top.length),
      count,
      decks: lists,
    };
  }).sort((a, b) => b.share - a.share);
}
