/**
 * Le liste da provare contro il meta reale, più il confronto con i win rate di Limitless Labs.
 *
 *   npx tsx src/tools/meta-matrix.ts --lists "hide-n-sneak/lista-per-danzica,hide-n-sneak/launay-2-nizza" \
 *        --top 16 --games 100 --validate --name ottobre
 *
 * --lists     liste da provare (come in matrix.ts; "*" alla fine = cartella)
 * --top       quanti archetipi del meta (per quota su Labs)
 * --games     partite per coppia
 * --validate  gioca anche ogni archetipo contro ogni altro e confronta con i risultati reali
 *
 * Scrive reports/meta-matrix-<nome>.md e .json.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { registry } from "../cards/index.js";
import { loadDecks, type DeckFile } from "../data/decks.js";
import { archetypes, loadTournaments } from "../data/meta.js";
import { labsName, labsShares, loadLabs, realMatchup } from "../data/labs.js";
import { runPairs, type Result } from "./matrix.js";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const bo3 = (p: number) => p * p * (3 - 2 * p);
const logit = (p: number) => Math.log(Math.min(0.99, Math.max(0.01, p)) / (1 - Math.min(0.99, Math.max(0.01, p))));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));
const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "—");

function pick(all: DeckFile[], spec: string): DeckFile[] {
  return spec.split(",").map(s => s.trim()).filter(Boolean).flatMap(s =>
    s.endsWith("*") ? all.filter(d => d.path.startsWith(s.slice(0, -1))) : all.filter(d => d.path === s));
}

async function main() {
  const reg = registry();
  const decks = loadDecks(reg.db).filter(d => d.entries.every(e => e.card));
  const labs = loadLabs();
  if (!labs) throw new Error("manca data/labs.json: esegui prima import-labs");
  const shares = labsShares(labs);
  const top = Number(arg("top", "16")), games = Number(arg("games", "100"));
  const workers = Number(arg("workers", String(Math.max(1, availableParallelism() - 1))));
  const name = arg("name", "ultima");
  const validate = process.argv.includes("--validate");

  // archetipi del meta: quota da Labs, lista rappresentativa dalle classifiche di Limitless
  const meta = archetypes(loadTournaments(), decks)
    .map(a => ({ name: a.name, labs: labsName(a.name), share: shares.get(labsName(a.name)) ?? 0, deck: a.decks[0] }))
    .filter(a => a.deck && a.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, top);
  const total = meta.reduce((s, a) => s + a.share, 0);
  const lists = pick(decks, arg("lists", "hide-n-sneak/lista-per-danzica"));
  // lista di riferimento per l'ancoraggio ai dati reali: la rappresentativa dell'archetipo delle liste provate
  const ALIAS0: Record<string, string> = { "Hide n' Sneak": "Dhelmise" };
  const archOf = (d: DeckFile) => ALIAS0[d.meta["archetipo"] ?? ""] ?? d.meta["archetipo"] ?? "";
  const refs = new Map<string, string>();
  for (const l of lists) {
    const a = archetypes(loadTournaments(), decks).find(x => x.name === archOf(l));
    if (a?.decks[0]) refs.set(archOf(l), a.decks[0]);
  }

  const pairs: [string, string][] = [];
  for (const l of lists) for (const a of meta) pairs.push([l.path, a.deck!]);
  for (const r of refs.values()) for (const a of meta) pairs.push([r, a.deck!]);
  if (validate) for (let i = 0; i < meta.length; i++) for (let j = i + 1; j < meta.length; j++) pairs.push([meta[i].deck!, meta[j].deck!]);
  const uniq = [...new Map(pairs.map(p => [p.join("|"), p])).values()];
  const agent = arg("agent", "basic");
  // --shard i/N: gioca solo una parte delle coppie e salva i risultati grezzi (per i job in parallelo su GitHub)
  // --merge: non gioca, legge le parti salvate e scrive il report
  const shard = arg("shard", "");
  const t0 = performance.now();
  let res: Result[];
  if (process.argv.includes("--merge")) {
    const dir = "reports/parts";
    res = readdirSync(dir).filter(f => f.startsWith(`${name}-`) && f.endsWith(".json")).flatMap(f => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).results as Result[]);
    console.log(`${res.length} coppie lette da ${dir}`);
  } else {
    const [si, sn] = shard ? shard.split("/").map(Number) : [0, 1];
    const mine = uniq.filter((_, k) => k % sn === si);
    console.log(`${mine.length} coppie (di ${uniq.length}) x ${games} partite su ${workers} processi, giocatore ${agent}...`);
    let lastLog = 0;
    res = await runPairs(mine, games, workers, (d, t) => {
      if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`  ${d}/${t} blocchi`); }
    }, agent);
    if (shard) {
      mkdirSync("reports/parts", { recursive: true });
      writeFileSync(`reports/parts/${name}-${si}.json`, JSON.stringify({ shard, agent, games, results: res }));
      console.log(`parte ${shard} salvata`);
      return;
    }
  }
  const sec = (performance.now() - t0) / 1000;
  const get = (a: string, b: string): number => {
    const r = res.find(x => x.a === a && x.b === b);
    if (r) return r.winsA / Math.max(1, r.games);
    const s = res.find(x => x.a === b && x.b === a) as Result | undefined;
    return s ? s.winsB / Math.max(1, s.games) : NaN;
  };

  const out: string[] = [
    `# Meta: ${name}`,
    "",
    `Quote dei mazzi da Limitless Labs (${labs.tournaments.map(t => t.name).join(", ")}). Ogni archetipo è giocato con la lista meglio piazzata nelle classifiche. ${games} partite per coppia, giocatore "${agent}" da entrambe le parti${process.argv.includes("--merge") ? ", calcolato in cloud" : `, ${sec.toFixed(0)} s`}.`,
    "",
    "Partite = percentuale di partite vinte nella simulazione. Match = conversione al meglio delle tre. Reale = win rate dei match su Labs per l'archetipo della lista (il pareggio vale un terzo).",
    "",
    "Ancorato = il risultato reale dell'archetipo, spostato di quanto la simulazione dice che questa lista fa meglio o peggio della lista di riferimento dell'archetipo. È il numero da usare per confrontare varianti della stessa lista: la simulazione da sola non è ancora affidabile in assoluto.",
    "",
    "## Le liste contro il meta",
    "",
  ];
  const json: Record<string, unknown> = { date: new Date().toISOString(), games, meta, lists: {} as Record<string, unknown> };
  for (const l of lists) {
    // le liste di Hide n' Sneak scritte a mano hanno "Hide n' Sneak" come archetipo: su Limitless è "Dhelmise"
    const ALIAS: Record<string, string> = { "Hide n' Sneak": "Dhelmise" };
    const raw = meta.find(m => m.deck === l.path)?.name ?? l.meta["archetipo"] ?? "";
    const arch = ALIAS[raw] ?? raw;
    let wGame = 0, wMatch = 0, wReal = 0, realShare = 0, wAnch = 0, anchShare = 0;
    const ref = refs.get(arch);
    const rows = meta.map(a => {
      const p = get(l.path, a.deck!);
      const real = realMatchup(labs, arch, a.name);
      wGame += (a.share / total) * p;
      wMatch += (a.share / total) * bo3(p);
      let anch = NaN;
      if (real && real.n >= 10) {
        wReal += a.share * real.wr; realShare += a.share;
        // ancorato: risultato reale dell'archetipo, spostato della differenza simulata tra questa lista e quella di riferimento
        if (ref) { anch = sigm(logit(real.wr) + logit(bo3(p)) - logit(bo3(get(ref, a.deck!)))); wAnch += a.share * anch; anchShare += a.share; }
      }
      return `| ${a.name} | ${a.share.toFixed(1)}% | ${pct(p)} | ${pct(bo3(p))} | ${real && real.n >= 10 ? `${pct(real.wr)} (${real.n})` : "—"} | ${pct(anch)} |`;
    });
    out.push(`### ${l.name}`, "",
      `**Ancorato ai dati reali: ${anchShare ? pct(wAnch / anchShare) : "—"}** · simulato puro: ${pct(wMatch)} dei match (${pct(wGame)} delle partite)${realShare ? ` · reale dell'archetipo: ${pct(wReal / realShare)}` : ""}.`, "",
      "| Contro | Quota | Partite | Match | Reale (match giocati) | Ancorato |", "| --- | --- | --- | --- | --- | --- |", ...rows, "");
    (json.lists as Record<string, unknown>)[l.path] = { metaMatch: wMatch, metaGame: wGame, rows: meta.map(a => ({ vs: a.name, game: get(l.path, a.deck!) })) };
  }

  if (validate) {
    const cmp: { a: string; b: string; sim: number; real: number; n: number }[] = [];
    for (let i = 0; i < meta.length; i++) for (let j = i + 1; j < meta.length; j++) {
      const real = realMatchup(labs, meta[i].name, meta[j].name);
      if (!real || real.n < 20) continue;
      cmp.push({ a: meta[i].name, b: meta[j].name, sim: bo3(get(meta[i].deck!, meta[j].deck!)), real: real.wr, n: real.n });
    }
    const wsum = cmp.reduce((s, c) => s + c.n, 0);
    const mae = cmp.reduce((s, c) => s + c.n * Math.abs(c.sim - c.real), 0) / Math.max(1, wsum);
    const within = cmp.filter(c => Math.abs(c.sim - c.real) <= 0.1).length;
    const mean = (f: (c: typeof cmp[0]) => number) => cmp.reduce((s, c) => s + f(c), 0) / cmp.length;
    const ms = mean(c => c.sim), mr = mean(c => c.real);
    const cov = mean(c => (c.sim - ms) * (c.real - mr)), vs = mean(c => (c.sim - ms) ** 2), vr = mean(c => (c.real - mr) ** 2);
    const corr = cov / Math.sqrt(vs * vr);
    out.push("## Confronto con i risultati reali", "",
      `${cmp.length} matchup con almeno 20 match su Labs. Errore medio (pesato sui match giocati): **${(100 * mae).toFixed(1)} punti**. Entro 10 punti: ${within} su ${cmp.length}. Correlazione: ${corr.toFixed(2)}.`, "",
      "Sono questi gli scostamenti da correggere, nelle carte o nel modo di giocare dei mazzi.", "",
      "| Mazzo | Contro | Simulato | Reale | Scarto | Match reali |", "| --- | --- | --- | --- | --- | --- |",
      ...cmp.sort((x, y) => Math.abs(y.sim - y.real) * Math.sqrt(y.n) - Math.abs(x.sim - x.real) * Math.sqrt(x.n))
        .map(c => `| ${c.a} | ${c.b} | ${pct(c.sim)} | ${pct(c.real)} | ${((c.sim - c.real) * 100).toFixed(0)} | ${c.n} |`), "");
    json.validation = { mae, within, total: cmp.length, corr, cmp };
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/meta-matrix-${name}.md`, out.join("\n"));
  writeFileSync(`reports/meta-matrix-${name}.json`, JSON.stringify({ ...json, results: res }, null, 1));
  console.log(out.join("\n"));
}

main().catch(e => { console.error(e); process.exit(1); });
