/**
 * Report di copertura: per ogni lista, quante carte sono implementate per intero,
 * e l'elenco delle carte da implementare ordinate per quante liste le usano.
 * Scrive reports/copertura.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";

const reg = registry();
const decks = loadDecks(reg.db).filter(d => d.entries.every(e => e.card));
const todo = new Map<string, { decks: Set<string>; copies: number; parts: string[] }>();
const rows: string[] = [];
for (const d of decks) {
  const c = reg.coverage(d);
  rows.push(`| ${d.path} | ${c.complete}/${c.total} | ${Math.round((100 * c.complete) / c.total)}% |`);
  for (const m of c.missing) {
    const t = todo.get(m.name) ?? { decks: new Set(), copies: 0, parts: m.parts };
    t.decks.add(d.path);
    t.copies += m.count;
    todo.set(m.name, t);
  }
}
const list = [...todo.entries()].sort((a, b) => b[1].decks.size - a[1].decks.size || b[1].copies - a[1].copies);
const md = [
  "# Copertura delle carte",
  "",
  `${decks.length} liste. Una carta è completa quando tutto il suo testo è implementato.`,
  "",
  "| Lista | Carte complete | % |",
  "| --- | --- | --- |",
  ...rows,
  "",
  `## Da implementare (${list.length} carte, dalle più usate)`,
  "",
  "| Carta | Liste | Copie | Testo mancante |",
  "| --- | --- | --- | --- |",
  ...list.map(([n, t]) => `| ${n} | ${t.decks.size} | ${t.copies} | ${t.parts.join("<br>").replace(/\|/g, "/")} |`),
];
mkdirSync("reports", { recursive: true });
writeFileSync("reports/copertura.md", md.join("\n") + "\n");
console.log(rows.join("\n"));
console.log(`\n${list.length} carte da implementare. Le prime 25:`);
for (const [n, t] of list.slice(0, 25)) console.log(`  ${String(t.decks.size).padStart(2)} liste  ${n}`);
