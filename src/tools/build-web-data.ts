/**
 * Dati pubblici del sito (web/public/data/), nel rispetto di docs/LEGALE.md:
 *
 * - cards.json: solo le carte legali nel formato (con tutte le loro ristampe), senza i testi degli
 *   effetti e delle regole. Al posto del testo resta un segnaposto (serve a sapere che un effetto
 *   esiste) e la chiave delle ristampe già calcolata.
 * - meta.json: archetipi principali, quote, lista tipo di ciascuno, tutte le liste dei Regional importate
 *   (giocatore, piazzamento, torneo, come le pubblica Limitless), risultati reali dei matchup da
 *   Limitless Labs, risultati simulati dell'ultima validazione e, nella versione privata, le liste del team.
 *   Con --no-names i nomi dei giocatori restano fuori.
 *
 *   npx tsx src/tools/build-web-data.ts [--report validazione-100] [--private] [--no-names]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gameKey, type CardData } from "../data/cards.js";
import { db } from "../data/db.js";
import { loadDecks } from "../data/decks.js";
import { formatDeck } from "../data/decklist.js";
import { DEFAULT_FORMAT } from "../data/format.js";
import { loadLabs, realMatchup } from "../data/labs.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPORT = arg("--report", "validazione-100");
const PRIVATE = process.argv.includes("--private");
const NAMES = !process.argv.includes("--no-names");
/** Liste del team, solo nella versione privata del sito. */
const TEAM_LISTS: Record<string, string> = { "hide-n-sneak/lista-per-danzica": "Lista per Danzica" };

/** Due FNV-1a a 32 bit: chiave corta e stabile, non reversibile nel testo. */
function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** La carta senza testi: i segnaposto "•" dicono solo che l'effetto c'è. */
function publicCard(c: CardData): CardData {
  const out: CardData = { ...c, key: hash(gameKey(c)) };
  if (c.abilities) out.abilities = c.abilities.map(a => ({ name: a.name, text: a.text ? "•" : "" }));
  if (c.attacks) out.attacks = c.attacks.map(a => ({ name: a.name, cost: a.cost, damage: a.damage, text: a.text ? "•" : "" }));
  delete out.rules;
  return out;
}

const pct = (x: number) => Math.round(x * 1000) / 1000;

function main() {
  const database = db();
  // carte legali: ogni gruppo di ristampe con almeno una stampa con segno legale, più le Energie base
  const keep: CardData[] = [];
  const seen = new Set<string>();
  for (const prints of database.byName.values()) {
    const groups = new Map<string, CardData[]>();
    for (const c of prints) { const k = gameKey(c); groups.set(k, [...(groups.get(k) ?? []), c]); }
    for (const g of groups.values()) {
      const basicEnergy = g[0].supertype === "Energy" && g[0].subtypes.includes("Basic");
      if (!basicEnergy && !g.some(c => c.mark && DEFAULT_FORMAT.marks.includes(c.mark))) continue;
      for (const c of g) if (!seen.has(c.id)) { seen.add(c.id); keep.push(publicCard(c)); }
    }
  }
  const usedSets = new Set(keep.map(c => c.id.split("#")[0].replace(/-[^-]+$/, "")));
  const cards = { imported: database.imported, sets: database.sets.filter(s => usedSets.has(s.code)), cards: keep };

  // meta e matchup
  const report = JSON.parse(readFileSync(`reports/meta-matrix-${REPORT}.json`, "utf8"));
  const labs = loadLabs();
  const decks = loadDecks(database);
  const deckText = (path: string) => formatDeck(decks.find(d => d.path === path)!);
  /** Torneo, data, piazzamento e giocatore di una lista, dalle righe "# Nome" e "# Fonte". */
  const infoOf = (path: string) => {
    const d = decks.find(x => x.path === path);
    const f = d?.meta["fonte"] ?? "";
    const m = f.match(/^Regional (.+?), (\d+\w* \w+ \d{4}),\s*(\d+)° posto su (\d+) giocatori/);
    const player = d?.meta["nome"]?.match(/\(([^,]+),/)?.[1]?.trim() ?? "";
    return m ? { event: `Regional ${m[1]}`, date: m[2], place: Number(m[3]), players: Number(m[4]), player: NAMES ? player : "" } : null;
  };
  const placeOf = (path: string) => {
    const i = infoOf(path);
    return i ? `${i.player ? `${i.player}, ` : ""}${i.place}° ${i.event}` : "";
  };
  const urlOf = (path: string) => (decks.find(d => d.path === path)?.meta["fonte"] ?? "").match(/https:\/\/limitlesstcg\.com\/\S+/)?.[0] ?? "";
  const meta: { name: string; labs: string; share: number; deck: string }[] = report.meta;
  const archetypes = meta.map(m => ({ name: m.name, share: pct(m.share), place: placeOf(m.deck), source: urlOf(m.deck), list: deckText(m.deck) }));
  const real: Record<string, Record<string, { wr: number; n: number }>> = {};
  for (const a of meta) for (const b of meta) {
    const r = labs ? realMatchup(labs, a.labs, b.labs) : null;
    if (r && r.n >= 20) (real[a.name] ??= {})[b.name] = { wr: pct(r.wr), n: r.n };
  }
  const nameOf = new Map(meta.map(m => [m.deck, m.name]));
  const sim: Record<string, Record<string, number>> = {};
  for (const r of report.results as { a: string; b: string; games: number; winsA: number; winsB: number }[]) {
    const a = nameOf.get(r.a), b = nameOf.get(r.b);
    if (!a || !b || !r.games) continue;
    const w = (r.winsA + (r.games - r.winsA - r.winsB) / 2) / r.games;
    (sim[a] ??= {})[b] = pct(w);
    (sim[b] ??= {})[a] = pct(1 - w);
  }
  // tutte le liste dei Regional importate, per torneo e piazzamento
  const lists = decks
    .filter(d => /^[a-z]+-\d{4}\//.test(d.path) && !d.path.includes("-jp/"))
    .map(d => ({ path: d.path, info: infoOf(d.path), archetype: d.meta["archetipo"] ?? "" }))
    .filter(x => x.info)
    .map(x => ({ ...x.info!, archetype: x.archetype, source: urlOf(x.path), list: deckText(x.path) }))
    .sort((a, b) => a.event.localeCompare(b.event) || a.place - b.place);
  const team = PRIVATE
    ? Object.entries(TEAM_LISTS).map(([path, name]) => {
      const rows = report.lists?.[path]?.rows ?? [];
      return { name, list: deckText(path), sim: Object.fromEntries(rows.map((r: { vs: string; game: number }) => [r.vs, pct(r.game)])) };
    })
    : [];
  const metaOut = {
    updated: report.date, games: report.games, format: DEFAULT_FORMAT.name, private: PRIVATE,
    sources: { tournaments: "Limitless (limitlesstcg.com)", matchups: "Limitless Labs (labs.limitlesstcg.com)", labsUpdated: labs?.updated ?? "" },
    names: NAMES, archetypes, lists, real, sim, team,
  };

  mkdirSync("web/public/data", { recursive: true });
  writeFileSync("web/public/data/cards.json", JSON.stringify(cards));
  writeFileSync("web/public/data/meta.json", JSON.stringify(metaOut));
  console.log(`${keep.length} carte (di ${database.byId.size}), ${archetypes.length} archetipi, ${lists.length} liste dei Regional, ${team.length} liste del team -> web/public/data/`);
}

main();
