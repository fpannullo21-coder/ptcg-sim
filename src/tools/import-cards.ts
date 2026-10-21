/**
 * Importa le carte dal database aperto
 * github.com/PokemonTCG/pokemon-tcg-data e scrive data/cards.json.
 *
 * Uso: NODE_USE_ENV_PROXY=1 npx tsx src/tools/import-cards.ts
 * (la variabile serve solo dietro un proxy).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { compact, type RawCard, type RawSet } from "../data/cards.js";

const BASE = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function main() {
  const sets = await get<RawSet[]>("sets/en.json");
  const legal = sets
    // dal blocco Scarlatto e Violetto in poi; la legalità si decide con i segni di regolamento
    .filter(s => s.releaseDate >= "2023/01/01" && !["CRZ"].includes(s.ptcgoCode ?? ""))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  // codici come nelle liste di Live; due set con lo stesso codice: il secondo usa il suo id
  const used = new Set<string>();
  const ALIAS: Record<string, string> = { "PR-SV": "SVP" };
  for (const s of legal) {
    let code = ALIAS[s.ptcgoCode ?? ""] ?? s.ptcgoCode ?? s.id.toUpperCase();
    if (used.has(code)) code = s.id.toUpperCase();
    used.add(code);
    s.ptcgoCode = code;
  }
  const out = [];
  for (const s of legal) {
    const cards = await get<RawCard[]>(`cards/en/${s.id}.json`);
    // i campi di legalità del database non sono sempre aggiornati: si importano tutte
    const ok = cards;
    out.push(...ok.map(c => compact(c, s)));
    console.log(`${s.ptcgoCode ?? s.id}\t${s.name}\t${ok.length}/${cards.length}`);
  }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/cards.json", JSON.stringify({
    source: `${BASE}`,
    imported: new Date().toISOString().slice(0, 10),
    sets: legal.map(s => ({ id: s.id, code: s.ptcgoCode ?? s.id, name: s.name, date: s.releaseDate })),
    cards: out,
  }));
  console.log(`\n${out.length} carte da ${legal.length} set -> data/cards.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
