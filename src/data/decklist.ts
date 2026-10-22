/**
 * Liste nel formato di Pokémon TCG Live: lettura, riconoscimento delle carte e controllo.
 *
 *   Pokémon: 24
 *   4 Shuppet PBL 33
 *   ...
 *   Energy: 8
 *   3 Basic {P} Energy MEE 13
 *
 * Le righe che iniziano con # sono metadati: "# Nome: ...", "# Fonte: ...".
 */
import type { CardData } from "./cards.js";
import { CardDB, normName } from "./carddb.js";
import { DEFAULT_FORMAT, type Format } from "./format.js";

export interface DeckEntry {
  count: number;
  card: CardData | null;    // null = carta non trovata nel database
  line: string;
  name: string;
  set?: string;
  number?: string;
  note?: string;            // come è stata riconosciuta, se non per id esatto
}

export interface Deck {
  name: string;
  meta: Record<string, string>;
  entries: DeckEntry[];
}

const LINE = /^(\d+)\s+(.+?)(?:\s+([A-Z0-9][A-Z0-9-]{1,6})\s+([A-Za-z]{0,3}\d+[a-z]?))?\s*$/;
const SECTION = /^(Pok[ée]mon|Trainer|Energy|Total Cards)\s*:/i;

export function parseDeck(text: string, db: CardDB, fallbackName = "lista"): Deck {
  const meta: Record<string, string> = {};
  const entries: DeckEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = line.match(/^#\s*([^:]+):\s*(.*)$/);
      if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
      continue;
    }
    if (SECTION.test(line)) continue;
    const m = line.match(LINE);
    if (!m) {
      entries.push({ count: 0, card: null, line, name: line, note: "riga non riconosciuta" });
      continue;
    }
    const [, n, name, set, number] = m;
    entries.push({ count: Number(n), line, name, set, number, ...resolve(db, name, set, number) });
  }
  return { name: meta["nome"] ?? meta["name"] ?? fallbackName, meta, entries };
}

function resolve(db: CardDB, name: string, set?: string, number?: string): { card: CardData | null; note?: string } {
  if (set && number) {
    const c = db.byId.get(`${set}-${number}`) ?? db.byId.get(`${set}-${Number(number)}`);
    if (c && normName(c.name) === normName(name)) return { card: c };
  }
  const versions = db.versions(name);
  // le Energie base sono tutte uguali, qualunque sia la stampa
  const basicEnergy = versions.flat().find(c => c.supertype === "Energy" && c.subtypes.includes("Basic"));
  if (basicEnergy) return { card: versions.flat().find(c => c.id.startsWith("SVE-")) ?? basicEnergy };
  if (!versions.length) return { card: null, note: set ? `${set} ${number} non è nel database` : "nome non trovato" };
  if (versions.length === 1) return { card: versions[0][0], note: set ? `${set} ${number} non nel database: riconosciuta per nome` : undefined };
  // più versioni con testi diversi: preferisci lo stesso set, altrimenti la più recente
  const same = set ? versions.find(v => v.some(c => c.id.startsWith(`${set}-`))) : undefined;
  const pick = (same ?? versions[0])[0];
  return { card: pick, note: `${versions.length} versioni con lo stesso nome: scelta ${pick.id}` };
}

export interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
  total: number;
}

const isBasicEnergy = (c: CardData) => c.supertype === "Energy" && c.subtypes.includes("Basic");

export function checkDeck(deck: Deck, db: CardDB, format: Format = DEFAULT_FORMAT): Check {
  const errors: string[] = [], warnings: string[] = [];
  const total = deck.entries.reduce((s, e) => s + e.count, 0);
  if (total !== 60) errors.push(`${total} carte invece di 60`);
  const byName = new Map<string, number>();
  let ace = 0, basics = 0;
  for (const e of deck.entries) {
    if (!e.card) { errors.push(`non trovata: "${e.line}"${e.note ? ` (${e.note})` : ""}`); continue; }
    if (e.note) warnings.push(`${e.line}: ${e.note}`);
    const c = e.card;
    if (!isBasicEnergy(c)) byName.set(c.name, (byName.get(c.name) ?? 0) + e.count);
    if (c.subtypes.includes("ACE SPEC")) ace += e.count;
    if (c.supertype === "Pokémon" && c.subtypes.includes("Basic")) basics += e.count;
    if (!isBasicEnergy(c)) {
      const legal = db.versions(c.name).some(v => v.some(x => x.mark && format.marks.includes(x.mark)));
      if (!legal) errors.push(`${c.name} non è legale in ${format.name}`);
    }
  }
  for (const [n, k] of byName) if (k > 4) errors.push(`${k} copie di ${n} (massimo 4)`);
  if (ace > 1) errors.push(`${ace} carte ACE SPEC (massimo 1)`);
  if (basics === 0) errors.push("nessun Pokémon Base");
  return { ok: errors.length === 0, errors, warnings, total };
}

/** Riscrive la lista nel formato di Live con gli id del database. */
export function formatDeck(deck: Deck): string {
  const sections: [string, (c: CardData) => boolean][] = [
    ["Pokémon", c => c.supertype === "Pokémon"],
    ["Trainer", c => c.supertype === "Trainer"],
    ["Energy", c => c.supertype === "Energy"],
  ];
  const out: string[] = [];
  for (const [title, f] of sections) {
    const es = deck.entries.filter(e => e.card && f(e.card));
    out.push(`${title}: ${es.reduce((s, e) => s + e.count, 0)}`);
    for (const e of es) {
      const [set, num] = e.card!.id.split("#")[0].split(/-(?=[^-]+$)/);
      out.push(`${e.count} ${e.card!.name} ${set} ${num}`);
    }
    out.push("");
  }
  out.push(`Total Cards: ${deck.entries.reduce((s, e) => s + e.count, 0)}`);
  return out.join("\n");
}
