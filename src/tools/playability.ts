/**
 * Quanto bene il simulatore riesce a giocare ogni archetipo: turno del primo attacco,
 * percentuale di turni senza attacco, premi presi. Contro un avversario fisso, N partite.
 * Un mazzo giocato bene attacca dal turno 2-3 e quasi ogni turno.
 *
 *   npx tsx src/tools/playability.ts 20 [avversario] [agente]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";
import { archetypes, loadTournaments } from "../data/meta.js";
import { playGame } from "../engine/game.js";
import { makeAgent } from "./matrix.js";

const [n = "20", opp = "nizza-2026/02-dhelmise-maxime-launay", agent = "basic"] = process.argv.slice(2);
const reg = registry();
const decks = loadDecks(reg.db);
const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);
const N = Number(n);
const rows: string[] = [];
for (const a of archetypes(loadTournaments(), decks).filter(x => x.share >= 1 && x.decks[0]).slice(0, 16)) {
  const path = a.decks[0];
  let first = 0, turns = 0, noAtk = 0, prizes = 0, wins = 0;
  for (let s = 1; s <= N; s++) {
    const m = playGame([get(path), get(opp)], [makeAgent(agent, s), makeAgent(agent, s + 99)], s, { verbose: true, first: s % 2 });
    const log = m.g.log.filter(l => / P0: /.test(l));
    const t = (l: string) => Number(l.match(/^T(\d+)/)![1]);
    const mine = [...new Set(log.map(t))].sort((x, y) => x - y);
    const atk = new Set(log.filter(l => l.includes("attacca con")).map(t));
    const own = mine.map((tt, i) => [tt, i + 1] as const); // turno globale, numero del mio turno
    const f = own.find(([tt]) => atk.has(tt));
    first += f ? f[1] : mine.length + 1;
    turns += own.filter(([, k]) => k >= 2).length;
    noAtk += own.filter(([tt, k]) => k >= 2 && !atk.has(tt)).length;
    prizes += 6 - m.g.s.players[0].prizes.length;
    if (m.g.s.winner === 0) wins++;
  }
  rows.push(`| ${a.name} | ${(first / N).toFixed(1)} | ${((100 * noAtk) / Math.max(1, turns)).toFixed(0)}% | ${(prizes / N).toFixed(1)} | ${((100 * wins) / N).toFixed(0)}% |`);
  console.log(rows[rows.length - 1]);
}
const md = [`# Giocabilità degli archetipi`, "", `Contro ${opp}, ${N} partite, giocatore ${agent}. Primo attacco = numero del proprio turno (1 = primo turno).`, "",
  "| Archetipo | Primo attacco (turno proprio) | Turni senza attacco (dal 2°) | Premi presi | Vittorie |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
mkdirSync("reports", { recursive: true });
writeFileSync("reports/giocabilita.md", md + "\n");
