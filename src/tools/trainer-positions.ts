/**
 * Posizioni pronte per l'Allenatore del sito (web/public/data/trainer.json): per ognuno dei primi
 * archetipi del meta, alcune posizioni dove la scelta conta, con la percentuale di vittoria di ogni
 * mossa (vedi src/ai/trainer.ts). Il sito ne può anche generare di nuove nel browser.
 *
 *   npx tsx src/tools/trainer-positions.ts --list hide-n-sneak/lista-per-danzica --per 3 --rollouts 60 --top 4
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { findPosition, type TrainerPosition } from "../ai/trainer.js";
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LIST = arg("--list", "hide-n-sneak/lista-per-danzica");
const PER = Number(arg("--per", "3"));
const ROLLOUTS = Number(arg("--rollouts", "60"));
const TOP = Number(arg("--top", "4"));

const reg = registry();
const decks = loadDecks(reg.db);
const report = JSON.parse(readFileSync("reports/meta-matrix-validazione-100.json", "utf8"));
const opponents: { name: string; deck: string }[] = report.meta.slice(0, TOP);
const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);

const positions: TrainerPosition[] = [];
let seed = 100;
for (const opp of opponents) {
  for (let k = 0; k < PER; k++) {
    seed += 10;
    const p = findPosition(get(LIST), get(opp.deck), opp.name, seed, { rollouts: ROLLOUTS, maxGames: 10 });
    if (!p) continue;
    positions.push(p);
    console.log(`${opp.name} T${p.position.turn}: ${p.options.map(o => `${o.label} ${Math.round(o.wr * 100)}%`).join(" | ")}`);
  }
}
mkdirSync("web/public/data", { recursive: true });
writeFileSync("web/public/data/trainer.json", JSON.stringify({ list: LIST, generated: new Date().toISOString(), rollouts: ROLLOUTS, positions }));
console.log(`${positions.length} posizioni -> web/public/data/trainer.json`);
