/**
 * Matrice dei matchup: gioca N partite per ogni coppia di liste, in parallelo,
 * e scrive reports/matrice-<nome>.json e .md.
 *
 *   npx tsx src/tools/matrix.ts --a "hide-n-sneak/lista-per-danzica" --b "frankfurt-2026/*" --games 200
 *
 * --a, --b   liste (percorsi in decks/ senza .txt, separati da virgola; "*" alla fine = tutta la cartella)
 * --games    partite per coppia (metà con ciascun giocatore che inizia)
 * --workers  processi in parallelo (predefinito: processori - 1)
 * --name     nome del report
 */
import { availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { registry } from "../cards/index.js";
import { loadDecks, type DeckFile } from "../data/decks.js";
import { playGame } from "../engine/game.js";
import { BasicAgent } from "../ai/basic.js";
import { EvalAgent } from "../ai/eval.js";
import { MonteCarloAgent } from "../ai/montecarlo.js";

/**
 * Giocatori disponibili. "mc" accetta parametri: "mc:8:2" = 8 continuazioni per mossa, 2 turni di profondità.
 */
export function makeAgent(spec = "basic", seed = 1): BasicAgent {
  const [kind, r, d] = spec.split(":");
  if (kind === "eval") return new EvalAgent();
  if (kind === "mc") return new MonteCarloAgent({ rollouts: Number(r ?? 6), depth: Number(d ?? 2), seed });
  return new BasicAgent();
}

export interface Job { a: string; b: string; games: number; seed: number; agent?: string }
export interface Result { a: string; b: string; games: number; winsA: number; winsB: number; draws: number; winsAFirst: number; gamesAFirst: number; turns: number; errors: string[] }

function playJob(decks: Map<string, DeckFile>, job: Job): Result {
  const reg = registry();
  const da = reg.deck(decks.get(job.a)!), db = reg.deck(decks.get(job.b)!);
  const r: Result = { a: job.a, b: job.b, games: 0, winsA: 0, winsB: 0, draws: 0, winsAFirst: 0, gamesAFirst: 0, turns: 0, errors: [] };
  for (let k = 0; k < job.games; k++) {
    const first = k % 2;
    try {
      const m = playGame([da, db], [makeAgent(job.agent, job.seed + k), makeAgent(job.agent, job.seed + k + 7919)], job.seed + k, { first });
      const w = m.g.s.winner;
      r.games++;
      r.turns += m.g.s.turn;
      if (first === 0) r.gamesAFirst++;
      if (w === 0) { r.winsA++; if (first === 0) r.winsAFirst++; }
      else if (w === 1) r.winsB++;
      else r.draws++;
    } catch (e) {
      if (r.errors.length < 3) r.errors.push(`seme ${job.seed + k}: ${(e as Error).message}`);
    }
  }
  return r;
}

function pick(all: DeckFile[], spec: string): DeckFile[] {
  return spec.split(",").map(s => s.trim()).filter(Boolean).flatMap(s =>
    s.endsWith("*") ? all.filter(d => d.path.startsWith(s.slice(0, -1))) : all.filter(d => d.path === s));
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

/**
 * Gioca `games` partite per ogni coppia (lista, avversario) su più processi.
 * Metà delle partite inizia la prima lista, metà la seconda. Semi fissi: risultati riproducibili.
 */
export async function runPairs(pairs: [string, string][], games: number, workers = Math.max(1, availableParallelism() - 1), onProgress?: (done: number, total: number) => void, agent = "basic"): Promise<Result[]> {
  const jobs: Job[] = [];
  let seed = 1;
  const chunk = Math.max(10, Math.ceil(games / Math.max(1, Math.min(workers, 4))));
  for (const [a, b] of pairs) {
    for (let done = 0; done < games; done += chunk) jobs.push({ a, b, games: Math.min(chunk, games - done), seed: (seed += 100000), agent });
  }
  const results: Result[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, () => new Promise<void>((resolve, reject) => {
    // processi figli: ereditano il caricatore TypeScript di tsx
    const w = fork(fileURLToPath(new URL("./matrix.ts", import.meta.url)), ["--worker"]);
    const feed = () => (next < jobs.length ? w.send(jobs[next++]) : (w.kill(), resolve()));
    w.on("message", (r: Result) => { results.push(r); onProgress?.(results.length, jobs.length); feed(); });
    w.on("error", reject);
    w.on("exit", code => { if (code && code !== 0 && next < jobs.length) reject(new Error(`processo uscito con codice ${code}`)); });
    feed();
  })));
  // somma i pezzi della stessa coppia
  const merged = new Map<string, Result>();
  for (const r of results) {
    const k = `${r.a}|${r.b}`;
    const m = merged.get(k);
    if (!m) { merged.set(k, { ...r, errors: [...r.errors] }); continue; }
    for (const f of ["games", "winsA", "winsB", "draws", "winsAFirst", "gamesAFirst", "turns"] as const) m[f] += r[f];
    m.errors.push(...r.errors);
  }
  return [...merged.values()];
}

async function main() {
  const reg = registry();
  const all = loadDecks(reg.db).filter(d => d.entries.every(e => e.card));
  const A = pick(all, arg("a", "hide-n-sneak/lista-per-danzica"));
  const B = pick(all, arg("b", "frankfurt-2026/*"));
  const games = Number(arg("games", "100"));
  const workers = Math.max(1, Number(arg("workers", String(Math.max(1, availableParallelism() - 1)))));
  const name = arg("name", "ultima");
  if (!A.length || !B.length) throw new Error("nessuna lista trovata per --a o --b");

  const t0 = performance.now();
  const rows = await runPairs(A.flatMap(a => B.map(b => [a.path, b.path] as [string, string])), games, workers, undefined, arg("agent", "basic"));
  const sec = (performance.now() - t0) / 1000;
  const pct = (x: number, n: number) => (n ? `${((100 * x) / n).toFixed(1)}%` : "-");
  const cov = (p: string) => { const c = reg.coverage(all.find(d => d.path === p)!); return Math.round((100 * c.complete) / c.total); };

  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/matrice-${name}.json`, JSON.stringify({ date: new Date().toISOString(), games, agent: "BasicAgent", seconds: sec, results: rows }, null, 1));
  const md = [
    `# Matrice: ${name}`,
    "",
    `${rows.reduce((s, r) => s + r.games, 0)} partite in ${sec.toFixed(0)} s, giocatore base contro giocatore base. Percentuali di partite vinte (non al meglio delle tre).`,
    "",
    "**Attenzione:** le carte non ancora implementate non fanno niente. La colonna \"carte complete\" dice quanto è affidabile ogni riga.",
    "",
    "| Lista | Contro | Vittorie | Partendo per primi | Turni medi | Carte complete (lista / avversario) | Errori |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(r => `| ${r.a} | ${r.b} | ${pct(r.winsA, r.games)} | ${pct(r.winsAFirst, r.gamesAFirst)} | ${(r.turns / Math.max(1, r.games)).toFixed(1)} | ${cov(r.a)}% / ${cov(r.b)}% | ${r.errors.length ? r.errors[0] : ""} |`),
  ].join("\n");
  writeFileSync(`reports/matrice-${name}.md`, md + "\n");
  console.log(md);
}

if (process.argv.includes("--worker")) {
  const reg = registry();
  const decks = new Map(loadDecks(reg.db).map(d => [d.path, d]));
  process.on("message", (job: Job) => process.send!(playJob(decks, job)));
} else if (/(^|[\/])matrix\.ts$/.test(process.argv[1] ?? "")) {
  main().catch(e => { console.error(e); process.exit(1); });
}
