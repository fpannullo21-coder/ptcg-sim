/**
 * Importa da Limitless Labs le quote dei mazzi (tutti i giocatori) e i risultati
 * dei matchup (vittorie, sconfitte, pareggi) dei Regional indicati.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx src/tools/import-labs.ts 0072 0073 0074 0075 0076 0077
 *
 * Scrive data/labs.json. Una richiesta ogni 400 ms.
 */
import { writeFileSync } from "node:fs";

const BASE = "https://labs.limitlesstcg.com";
let last = 0;
async function get(path: string): Promise<string> {
  const wait = last + 400 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  for (let k = 0; k < 3; k++) {
    const r = await fetch(BASE + path, { headers: { "user-agent": "ptcg-sim (simulatore personale)" } });
    if (r.ok) return r.text();
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`${path}: non raggiungibile`);
}

const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#39;|&#039;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export interface Record3 { w: number; l: number; t: number }
export interface LabsDeck { slug: string; name: string; players: number; share: number; record: Record3 }

export function parseDecks(html: string, code: string): LabsDeck[] {
  const out: LabsDeck[] = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const href = m[1].match(new RegExp(`href="/${code}/decks/([^"/]+)"`));
    if (!href) continue;
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => text(c[1]));
    // colonne: icone, giocatori, nome, quota, record, win %
    const nums = cells.find(c => /^\d+ - \d+ - \d+$/.test(c));
    const players = Number(cells.find(c => /^\d+$/.test(c)) ?? 0);
    const name = cells.find(c => c && !/^[\d.%\s-]+$/.test(c)) ?? href[1];
    const share = Number((cells.find(c => /%$/.test(c)) ?? "0").replace("%", ""));
    const [w, l, t] = (nums ?? "0 - 0 - 0").split(" - ").map(Number);
    out.push({ slug: href[1], name, players, share, record: { w, l, t } });
  }
  return out;
}

export function parseMatchups(html: string): { name: string; slug: string; n: number; w: number; l: number; t: number }[] {
  const out: { name: string; slug: string; n: number; w: number; l: number; t: number }[] = [];
  for (const m of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const link = m[1].match(/href="\/\d{4}\/decks\/([^"/]+)\/matchups">([^<]*)</);
    if (!link) continue;
    const rec = text(m[1]).match(/(\d+) (\d+) - (\d+) - (\d+)/);
    if (!rec) continue;
    out.push({ slug: link[1], name: text(link[2]), n: Number(rec[1]), w: Number(rec[2]), l: Number(rec[3]), t: Number(rec[4]) });
  }
  return out;
}

async function main() {
  const codes = process.argv.slice(2).filter(a => /^\d{4}$/.test(a));
  const minPlayers = 8;
  const tournaments: { code: string; name: string; decks: LabsDeck[] }[] = [];
  const matchups: Record<string, Record<string, Record3>> = {};
  for (const code of codes) {
    const html = await get(`/${code}/decks`);
    const name = text(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? code).replace(/\s*–\s*Limitless Labs.*$/, "").replace(/^(Metagame|Decks)\s*[•:]\s*/, "");
    const decks = parseDecks(html, code);
    tournaments.push({ code, name, decks });
    let n = 0;
    for (const d of decks.filter(d => d.players >= minPlayers && d.slug !== "other")) {
      for (const r of parseMatchups(await get(`/${code}/decks/${d.slug}/matchups`))) {
        if (r.name === "Other" || r.name === "unknown" || r.name.startsWith("byes")) continue;
        const row = (matchups[d.name] ??= {});
        const x = (row[r.name] ??= { w: 0, l: 0, t: 0 });
        x.w += r.w; x.l += r.l; x.t += r.t;
      }
      n++;
    }
    console.log(`${code}\t${name}\t${decks.length} mazzi\t${n} con i matchup`);
  }
  writeFileSync("data/labs.json", JSON.stringify({ source: BASE, updated: new Date().toISOString().slice(0, 10), minPlayers, tournaments, matchups }, null, 1));
}

if (process.argv[1]?.endsWith("import-labs.ts")) main().catch(e => { console.error(e); process.exit(1); });
