/** Riepilogo del meta: quote, liste rappresentative e copertura -> reports/meta.md */
import { mkdirSync, writeFileSync } from "node:fs";
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";
import { archetypes, loadTournaments } from "../data/meta.js";

const reg = registry();
const decks = loadDecks(reg.db);
const ts = loadTournaments();
const arch = archetypes(ts, decks);
const rows = arch.filter(a => a.share >= 0.5).map(a => {
  const rep = a.decks[0];
  const d = rep ? decks.find(x => x.path === rep)! : null;
  const cov = d ? reg.coverage(d) : null;
  return `| ${a.name} | ${a.share.toFixed(1)}% | ${a.top32.toFixed(1)}% | ${a.decks.length} | ${rep ?? "—"} | ${cov ? Math.round((100 * cov.complete) / cov.total) + "%" : "—"} |`;
});
const md = [
  "# Meta del formato",
  "",
  `Tornei: ${ts.map(t => `${t.name} (${t.date}, ${t.players} giocatori)`).join("; ")}.`,
  "",
  "Quota: percentuale dei giocatori in classifica su Limitless con quell'archetipo. Prime 32: percentuale dei posti nelle prime 32 di ogni torneo.",
  "",
  "| Archetipo | Quota | Prime 32 | Liste | Lista rappresentativa | Carte complete |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows,
].join("\n");
mkdirSync("reports", { recursive: true });
writeFileSync("reports/meta.md", md + "\n");
console.log(md);
