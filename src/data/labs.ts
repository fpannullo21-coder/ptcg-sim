/** Dati di Limitless Labs (data/labs.json): quote su tutti i giocatori e win rate reali dei matchup. */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Record3 { w: number; l: number; t: number }
export interface Labs {
  updated: string;
  tournaments: { code: string; name: string; decks: { slug: string; name: string; players: number; share: number; record: Record3 }[] }[];
  matchups: Record<string, Record<string, Record3>>;
}

export const LABS_PATH = fileURLToPath(new URL("../../data/labs.json", import.meta.url));

export function loadLabs(path = LABS_PATH): Labs | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

/** Nomi degli archetipi su Limitless (classifiche) che su Labs hanno un altro nome. */
const ALIAS: Record<string, string> = {
  Hydrapple: "Ogerpon Meganium Hydrapple",
};
export const labsName = (limitless: string) => ALIAS[limitless] ?? limitless;

/** Quota di ogni archetipo sul totale dei giocatori di tutti i tornei importati. */
export function labsShares(labs: Labs): Map<string, number> {
  const count = new Map<string, number>();
  let total = 0;
  for (const t of labs.tournaments) for (const d of t.decks) {
    count.set(d.name, (count.get(d.name) ?? 0) + d.players);
    total += d.players;
  }
  return new Map([...count].map(([k, v]) => [k, (100 * v) / total]));
}

/** Win rate di un match come lo calcola Labs: il pareggio vale un terzo di vittoria. */
export function matchWinRate(r: Record3): number {
  const n = r.w + r.l + r.t;
  return n ? (r.w + r.t / 3) / n : NaN;
}

export function realMatchup(labs: Labs, a: string, b: string): { wr: number; n: number } | null {
  const r = labs.matchups[labsName(a)]?.[labsName(b)];
  if (!r) return null;
  return { wr: matchWinRate(r), n: r.w + r.l + r.t };
}
