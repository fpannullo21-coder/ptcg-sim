/**
 * I matchup reali di un archetipo nei Regional importati da Limitless Labs.
 *   npx tsx src/tools/labs-report.ts Dhelmise
 * Scrive reports/reale-<archetipo>.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { labsShares, loadLabs, matchWinRate } from "../data/labs.js";

const name = process.argv[2] ?? "Dhelmise";
const labs = loadLabs();
if (!labs) throw new Error("manca data/labs.json");
const row = labs.matchups[name];
if (!row) throw new Error(`archetipo non trovato su Labs: ${name}`);
const shares = labsShares(labs);
const own = labs.tournaments.flatMap(t => t.decks.filter(d => d.name === name));
const rec = own.reduce((s, d) => ({ w: s.w + d.record.w, l: s.l + d.record.l, t: s.t + d.record.t }), { w: 0, l: 0, t: 0 });
const players = own.reduce((s, d) => s + d.players, 0);
const rows = Object.entries(row)
  .map(([vs, r]) => ({ vs, r, n: r.w + r.l + r.t, wr: matchWinRate(r), share: shares.get(vs) ?? 0 }))
  .filter(x => x.n >= 10)
  .sort((a, b) => b.share - a.share);
const covered = rows.reduce((s, x) => s + x.share, 0);
const weighted = rows.reduce((s, x) => s + x.share * x.wr, 0) / covered;
// errore statistico approssimato di un win rate su n match
const err = (p: number, n: number) => 1.96 * Math.sqrt((p * (1 - p)) / n);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const md = [
  `# ${name}: risultati reali`,
  "",
  `${labs.tournaments.map(t => t.name).join(", ")}. Fonte: Limitless Labs, aggiornato al ${labs.updated}.`,
  "",
  `**${players} giocatori**, record complessivo ${rec.w}-${rec.l}-${rec.t}, win rate ${pct(matchWinRate(rec))}. Pesato sulla quota di ogni avversario: **${pct(weighted)}**.`,
  "",
  "Win rate dei match, il pareggio vale un terzo di vittoria. Il margine è l'intervallo al 95%: con pochi match è largo.",
  "",
  "| Avversario | Quota nel meta | Record | Win rate | Margine | Match |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map(x => `| ${x.vs} | ${x.share.toFixed(1)}% | ${x.r.w}-${x.r.l}-${x.r.t} | ${pct(x.wr)} | ±${(100 * err(x.wr, x.n)).toFixed(0)} | ${x.n} |`),
].join("\n");
mkdirSync("reports", { recursive: true });
const file = `reports/reale-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
writeFileSync(file, md + "\n");
console.log(md);
