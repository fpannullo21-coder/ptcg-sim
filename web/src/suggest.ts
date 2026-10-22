/**
 * Candidati per "suggeriscimi una variante": scambi di una carta presi dalle altre liste dello
 * stesso archetipo nei Regional. Si aggiunge una carta che gli altri giocano più di te e si toglie
 * una carta che tu giochi più degli altri.
 */
import { checkDeck, formatDeck, parseDeck, type DeckEntry } from "../../src/data/decklist";
import type { Data } from "./data";

export interface Swap { out: string; in: string; text: string; why: string }

const count = (entries: DeckEntry[]) => {
  const m = new Map<string, number>();
  for (const e of entries) if (e.card) m.set(e.card.name, (m.get(e.card.name) ?? 0) + e.count);
  return m;
};

export function swapCandidates(data: Data, deckText: string, archetype: string, max = 16): Swap[] {
  const others = data.meta.lists.filter(l => l.archetype === archetype).map(l => parseDeck(l.list, data.db));
  if (others.length < 3) return [];
  const mine = parseDeck(deckText, data.db);
  const my = count(mine.entries);
  // media delle copie e quota di liste che giocano la carta, nell'archetipo
  const avg = new Map<string, number>(), freq = new Map<string, number>();
  const sample = new Map<string, DeckEntry>();
  for (const d of others) {
    for (const [n, k] of count(d.entries)) {
      avg.set(n, (avg.get(n) ?? 0) + k / others.length);
      freq.set(n, (freq.get(n) ?? 0) + 1 / others.length);
    }
    for (const e of d.entries) if (e.card && !sample.has(e.card.name)) sample.set(e.card.name, e);
  }
  const adds = [...avg.entries()]
    .map(([n, a]) => ({ n, gap: a - (my.get(n) ?? 0), f: freq.get(n) ?? 0 }))
    .filter(x => x.gap >= 0.3 && x.f >= 0.15)
    .sort((x, y) => y.gap * y.f - x.gap * x.f)
    .slice(0, 8);
  const outs = [...my.entries()]
    .map(([n, k]) => ({ n, extra: k - (avg.get(n) ?? 0), f: freq.get(n) ?? 0 }))
    .filter(x => x.extra >= 0.3)
    .sort((x, y) => y.extra - x.extra || x.f - y.f)
    .slice(0, 4);
  const swaps: Swap[] = [];
  for (const a of adds) for (const o of outs) {
    if (a.n === o.n) continue;
    const d = parseDeck(deckText, data.db);
    const e = d.entries.find(x => x.card?.name === o.n);
    if (!e) continue;
    e.count--;
    const have = d.entries.find(x => x.card?.name === a.n);
    if (have) have.count++;
    else d.entries.push({ ...sample.get(a.n)!, count: 1 });
    d.entries = d.entries.filter(x => x.count > 0);
    if (!checkDeck(d, data.db).ok) continue;
    // un'evoluzione senza il Pokémon da cui evolve non serve
    const evo = sample.get(a.n)?.card?.evolvesFrom;
    if (evo && !d.entries.some(x => x.card?.name === evo)) continue;
    swaps.push({
      out: o.n, in: a.n, text: formatDeck(d),
      why: `${Math.round(a.f * 100)}% delle liste ${archetype} gioca ${a.n} (in media ${(avg.get(a.n) ?? 0).toFixed(1).replace(".", ",")} copie); tu ne giochi ${my.get(a.n) ?? 0}`,
    });
  }
  // un po' di varietà: prima un'uscita diversa per ogni entrata, poi le altre combinazioni
  const firstPass = adds.map(a => swaps.find(s => s.in === a.n)).filter((s): s is Swap => !!s);
  const rest = swaps.filter(s => !firstPass.includes(s));
  return [...firstPass, ...rest].slice(0, max);
}
