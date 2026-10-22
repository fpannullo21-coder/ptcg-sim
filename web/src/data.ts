/**
 * Dati del sito: carte pubbliche (senza testi), meta e posizioni dell'Allenatore,
 * più le funzioni di calcolo condivise tra le pagine.
 */
import { CardDB } from "../../src/data/carddb";
import type { CardData } from "../../src/data/cards";
import { checkDeck, parseDeck, type Check, type Deck } from "../../src/data/decklist";
import { Registry } from "../../src/cards/registry";
import { IMPLS } from "../../src/cards/impl/index";

export interface Archetype { name: string; share: number; place: string; source: string; list: string }
export interface RegionalList { event: string; date: string; place: number; players: number; player: string; archetype: string; source: string; list: string }
export interface Meta {
  updated: string; games: number; format: string; private: boolean; names: boolean;
  lists: RegionalList[];
  sources: { tournaments: string; matchups: string; labsUpdated: string };
  archetypes: Archetype[];
  real: Record<string, Record<string, { wr: number; n: number }>>;
  sim: Record<string, Record<string, number>>;
  team: { name: string; list: string; sim: Record<string, number> }[];
}
export interface MonView {
  name: string; hp: number; maxHp: number; type: string; stage: string; weak: string | null; retreat: number;
  energies: string[]; attacks: { name: string; cost: string[]; damage: number }[]; tools: string[];
}
export interface SideView { active: MonView | null; bench: MonView[]; prizes: number; deck: number; handCount: number; discard: number }
export interface Position {
  vs: string; rollouts: number;
  position: { turn: number; me: SideView; opp: SideView; hand: string[]; stadium: string | null; energyAttached: boolean; supporterPlayed: boolean };
  options: { label: string; wr: number }[];
}
export interface Trainer { list: string; generated: string; rollouts: number; positions: Position[] }

export interface Data { db: CardDB; reg: Registry; meta: Meta; trainer: Trainer | null; cardsRaw: unknown }

async function json<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadData(): Promise<Data> {
  const [cardsRaw, meta, trainer] = await Promise.all([
    json<{ sets: CardDB["sets"]; cards: CardData[]; imported: string }>("./data/cards.json"),
    json<Meta>("./data/meta.json"),
    json<Trainer>("./data/trainer.json").catch(() => null),
  ]);
  const db = new CardDB(structuredClone(cardsRaw));
  return { db, reg: new Registry(db, IMPLS), meta, trainer, cardsRaw };
}

// --- liste -------------------------------------------------------------------

export interface Analyzed { deck: Deck; check: Check; coverage: ReturnType<Registry["coverage"]>; archetype: string | null; similarity: number }

/** Nomi dei Pokémon con le copie: serve a riconoscere l'archetipo. */
function pokemonCounts(deck: Deck): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of deck.entries) if (e.card?.supertype === "Pokémon") m.set(e.card.name, (m.get(e.card.name) ?? 0) + e.count);
  return m;
}

/** L'archetipo più simile tra quelli del meta, se la somiglianza dei Pokémon è almeno del 50%. */
export function detectArchetype(data: Data, deck: Deck): { name: string | null; similarity: number } {
  const mine = pokemonCounts(deck);
  const tot = [...mine.values()].reduce((s, x) => s + x, 0);
  let best: string | null = null, bs = 0;
  for (const a of data.meta.archetypes) {
    const ref = pokemonCounts(parseDeck(a.list, data.db, a.name));
    const rt = [...ref.values()].reduce((s, x) => s + x, 0);
    let common = 0;
    for (const [n, k] of mine) common += Math.min(k, ref.get(n) ?? 0);
    const sim = common / Math.max(1, tot, rt);
    if (sim > bs) { bs = sim; best = a.name; }
  }
  return bs >= 0.5 ? { name: best, similarity: bs } : { name: null, similarity: bs };
}

export function analyze(data: Data, text: string): Analyzed {
  const deck = parseDeck(text, data.db, "La tua lista");
  const check = checkDeck(deck, data.db);
  const coverage = data.reg.coverage(deck);
  const arch = detectArchetype(data, deck);
  return { deck, check, coverage, archetype: arch.name, similarity: arch.similarity };
}

// --- numeri ------------------------------------------------------------------

/** Da percentuale di partite a percentuale di match al meglio delle tre. */
export const bo3 = (p: number) => p * p * (3 - 2 * p);
const logit = (p: number) => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** Il dato reale, spostato di quanto la simulazione dice che la lista fa meglio o peggio della lista tipo. */
export const anchor = (real: number, simList: number, simRef: number) => sigmoid(logit(real) + logit(simList) - logit(simRef));

export const pct = (x: number, d = 1) => (100 * x).toFixed(d).replace(".", ",") + "%";
export const tone = (x: number) => (x >= 0.55 ? "var(--good)" : x <= 0.45 ? "var(--bad)" : "var(--neutral)");

/** Probabilità di avere almeno una delle `k` copie tra `n` carte prese da un mazzo di `N`. */
export function atLeastOne(N: number, k: number, n: number): number {
  if (k <= 0) return 0;
  let none = 1;
  for (let i = 0; i < n; i++) none *= (N - k - i) / (N - i);
  return 1 - Math.max(0, none);
}

/** Probabilità che tutte le `k` copie siano tra i 6 premi. */
export function allPrized(N: number, k: number, prizes = 6): number {
  if (k > prizes) return 0;
  let p = 1;
  for (let i = 0; i < k; i++) p *= (prizes - i) / (N - i);
  return p;
}

// --- memoria locale (solo comodità, può mancare) ----------------------------

export function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* niente memoria locale: va bene lo stesso */ }
}
