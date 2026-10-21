/**
 * Importa da Limitless le classifiche e le liste dei Regional del formato attuale.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx src/tools/import-limitless.ts --top 32 582 581 579 577 580 578
 *
 * Scrive:
 * - decks/<città>-<anno>/<posizione>-<archetipo>-<giocatore>.txt per le prime N liste di ogni torneo
 * - data/meta.json: per ogni torneo la classifica (posizione, giocatore, archetipo, lista) e le quote di ogni archetipo
 *
 * Una richiesta ogni 400 ms, per non pesare sul sito.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const BASE = "https://limitlesstcg.com";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let last = 0;

async function get(path: string): Promise<string> {
  const wait = last + 400 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let k = 0; k < 3; k++) {
    const r = await fetch(BASE + path, { headers: { "user-agent": "ptcg-sim (simulatore personale; contatto via GitHub)" } });
    if (r.ok) return r.text();
    await sleep(2000);
  }
  throw new Error(`${path}: non raggiungibile`);
}

const decode = (s: string) => s.replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&eacute;/g, "é").trim();
const slug = (s: string) => s.replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ø/g, "o").replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface Standing { rank: number; player: string; country: string; deck: string; list?: number }
export interface Tournament { id: number; name: string; date: string; players: number; format: string; standings: Standing[] }

export function parseStandings(html: string): Standing[] {
  const out: Standing[] = [];
  const row = /<tr data-rank="(\d+)" data-name="([^"]*)" data-country="([^"]*)" data-deck="([^"]*)"\s*>([\s\S]*?)<\/tr>/g;
  for (const m of html.matchAll(row)) {
    const list = m[5].match(/\/decks\/list\/(\d+)/);
    out.push({ rank: Number(m[1]), player: decode(m[2]), country: m[3], deck: decode(m[4]) || "Altro", list: list ? Number(list[1]) : undefined });
  }
  return out;
}

export function parseInfo(html: string): { name: string; date: string; players: number; format: string } {
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(/\s*[–-]\s*Limitless.*$/, "");
  const box = html.slice(html.indexOf('class="infobox-line"'), html.indexOf('class="infobox-line"') + 800);
  const date = box.match(/\d{1,2}(st|nd|rd|th)? \w+ \d{4}/)?.[0] ?? "";
  const players = Number(box.match(/(\d+)\s*Players/)?.[1] ?? 0);
  const format = decode(box.match(/format=[^"]*">([^<]*)</)?.[1] ?? "");
  return { name: title, date, players, format };
}

/** Lista in formato Live dalla pagina /decks/list/<id>. */
export function parseDecklist(html: string): string {
  const out: string[] = [];
  const cols = html.split('class="decklist-column-heading">').slice(1);
  for (const col of cols) {
    const heading = decode(col.slice(0, col.indexOf("<")));
    out.push(heading.replace(/\s*\((\d+)\)/, ": $1"));
    const card = /<div class="decklist-card" data-set="([^"]*)" data-number="([^"]*)"[\s\S]*?<span class="card-count">(\d+)<\/span>\s*<span class="card-name">([^<]*)<\/span>/g;
    for (const m of col.matchAll(card)) out.push(`${m[3]} ${decode(m[4])} ${m[1]} ${m[2]}`);
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}

function arg(name: string, def: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const top = Number(arg("top", "32"));
  const ids = process.argv.slice(2).filter((a, i, all) => /^\d+$/.test(a) && all[i - 1] !== "--top").map(Number);
  const metaPath = "data/meta.json";
  const old = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const meta: { updated: string; tournaments: Tournament[] } = { updated: "", tournaments: Array.isArray(old.tournaments) ? old.tournaments : [] };
  const lists = new Map<number, string>();
  for (const id of ids) {
    const html = await get(`/tournaments/${id}`);
    const info = parseInfo(html);
    const standings = parseStandings(html);
    const t: Tournament = { id, ...info, standings };
    meta.tournaments = [...meta.tournaments.filter(x => x.id !== id), t];
    const CITY: Record<string, string> = { nice: "nizza" };
    const raw = slug(info.name.replace(/^(Regional|Special Event|Champions League|International Championships?)\s+/i, "").replace(/,.*$/, ""));
    const city = CITY[raw] ?? raw;
    const year = info.date.match(/\d{4}/)?.[0] ?? "";
    const dir = `decks/${city}-${year}`;
    mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const s of standings.filter(s => s.rank <= top && s.list)) {
      if (!lists.has(s.list!)) lists.set(s.list!, parseDecklist(await get(`/decks/list/${s.list}`)));
      const body = lists.get(s.list!)!;
      const file = `${dir}/${String(s.rank).padStart(2, "0")}-${slug(s.deck)}-${slug(s.player)}.txt`;
      writeFileSync(file, `# Nome: ${s.deck} (${s.player}, ${s.rank}° ${info.name})\n# Archetipo: ${s.deck}\n# Fonte: ${info.name}, ${info.date}, ${s.rank}° posto su ${info.players} giocatori. ${BASE}/decks/list/${s.list}\n\n${body}`);
      n++;
    }
    console.log(`${id}\t${info.name}\t${info.date}\t${info.players} giocatori\t${standings.length} in classifica\t${n} liste`);
  }
  // archetipi senza liste tra le prime N: si prende la lista meglio piazzata di ciascuno
  const fill = Number(arg("fill", "0"));
  if (fill > 0) {
    const all = meta.tournaments.flatMap(t => t.standings.map(s => ({ t, s })));
    const count = new Map<string, number>();
    for (const { s } of all) count.set(s.deck, (count.get(s.deck) ?? 0) + 1);
    for (const [deck, n] of count) {
      if ((100 * n) / all.length < fill) continue;
      const have = all.some(({ s }) => s.deck === deck && s.rank <= top && s.list);
      if (have) continue;
      const best = all.filter(({ s }) => s.deck === deck && s.list).sort((a, b) => a.s.rank - b.s.rank)[0];
      if (!best) continue;
      const { t, s: st } = best;
      const CITY: Record<string, string> = { nice: "nizza" };
      const raw = slug(t.name.replace(/^(Regional|Special Event|Champions League)\s+/i, "").replace(/,.*$/, ""));
      const dir = `decks/${CITY[raw] ?? raw}-${t.date.match(/\d{4}/)?.[0] ?? ""}`;
      mkdirSync(dir, { recursive: true });
      const body = parseDecklist(await get(`/decks/list/${st.list}`));
      writeFileSync(`${dir}/${String(st.rank).padStart(2, "0")}-${slug(st.deck)}-${slug(st.player)}.txt`,
        `# Nome: ${st.deck} (${st.player}, ${st.rank}° ${t.name})\n# Archetipo: ${st.deck}\n# Fonte: ${t.name}, ${t.date}, ${st.rank}° posto su ${t.players} giocatori. ${BASE}/decks/list/${st.list}\n\n${body}`);
      console.log(`aggiunta: ${deck}, ${st.rank}° ${t.name}`);
    }
  }
  meta.updated = new Date().toISOString().slice(0, 10);
  meta.tournaments.sort((a, b) => b.id - a.id);
  writeFileSync(metaPath, JSON.stringify(meta, null, 1));
}

if (process.argv[1]?.endsWith("import-limitless.ts")) main().catch(e => { console.error(e); process.exit(1); });
