/** Controlla tutte le liste in decks/ e scrive reports/liste.md. */
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../data/db.js";
import { checkDeck } from "../data/decklist.js";
import { loadDecks } from "../data/decks.js";

const cards = db();
const rows: string[] = [];
let bad = 0;
for (const d of loadDecks(cards)) {
  const c = checkDeck(d, cards);
  if (!c.ok) bad++;
  console.log(`${c.ok ? "ok " : "NO "} ${d.path}  ${c.errors.join("; ")}`);
  rows.push(`| ${d.path} | ${d.name} | ${c.ok ? "ok" : "**da sistemare**"} | ${[...c.errors, ...c.warnings.map(w => "nota: " + w)].join("<br>") || ""} |`);
}
mkdirSync("reports", { recursive: true });
writeFileSync("reports/liste.md", `# Controllo delle liste\n\nDatabase carte del ${cards.imported}.\n\n| File | Nome | Stato | Dettagli |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`);
console.log(`\n${rows.length} liste, ${bad} da sistemare. Dettagli in reports/liste.md`);
