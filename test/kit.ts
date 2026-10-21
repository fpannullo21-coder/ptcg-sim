/** Strumenti per i test delle carte: costruire una posizione precisa e far girare un effetto. */
import { G, newMon, newState, legalActions } from "../src/engine/game.js";
import type { Action, CardDef, Decision, Gen, Mon } from "../src/engine/types.js";
import { registry } from "../src/cards/index.js";

const reg = registry();

/** Definizione di una carta per nome (prima versione nel database, o quella con l'id dato). */
export function card(name: string, id?: string): CardDef {
  const c = id ? reg.db.byId.get(id) : reg.db.versions(name)[0]?.[0];
  if (!c) throw new Error(`carta sconosciuta: ${name}`);
  return reg.def(c);
}

export interface Side {
  active?: string | [string, ...string[]];          // nome, oppure [nome, energie/strumenti...]
  bench?: (string | [string, ...string[]])[];
  hand?: string[];
  deck?: string[];
  discard?: string[];
  prizes?: number;                                  // premi rimasti (carte riempitive)
}

const FILL = "Psychic Energy";

/** Posizione costruita a mano. Le carte "nome" possono essere anche id del database (es. "PBL-91"). */
export function position(p0: Side, p1: Side = {}, turn = 5, current = 0): G {
  const def = (n: string) => (/^[A-Z0-9]+-\d+/.test(n) ? reg.def(reg.db.byId.get(n)!) : card(n));
  const lists = [p0, p1].map(sd => {
    const names: string[] = [];
    const mons = [sd.active, ...(sd.bench ?? [])].filter(Boolean) as (string | string[])[];
    for (const m of mons) names.push(...(Array.isArray(m) ? m : [m]));
    names.push(...(sd.hand ?? []), ...(sd.deck ?? []), ...(sd.discard ?? []));
    for (let k = 0; k < (sd.prizes ?? 6); k++) names.push(FILL);
    return names.map(def);
  });
  const { s, reg: r } = newState(lists, 7);
  const g = new G(s, r);
  [p0, p1].forEach((sd, i) => {
    const pool = [...s.players[i].deck];
    s.players[i].deck = [];
    const take = () => pool.shift()!;
    const mon = (m: string | string[]): Mon => {
      const parts = Array.isArray(m) ? m : [m];
      const x = newMon(take(), 0);
      for (const extra of parts.slice(1)) {
        const c = take();
        if (g.def(c).kind === "energy") x.energies.push(c);
        else if (g.def(c).kind === "pokemon") x.stack.push(c);
        else x.tools.push(c);
      }
      return x;
    };
    const p = s.players[i];
    if (sd.active) p.active = mon(sd.active);
    p.bench = (sd.bench ?? []).map(mon);
    p.hand = (sd.hand ?? []).map(take);
    p.deck = (sd.deck ?? []).map(take).reverse(); // la prima della lista è la cima
    p.discard = (sd.discard ?? []).map(take);
    p.prizes = pool.splice(0);
  });
  s.turn = turn;
  s.current = current;
  return g;
}

export type Picker = (d: Decision) => number[];
/** Scelta predefinita: le prime opzioni, quante più possibile. */
export const most: Picker = d => d.options.map((_, i) => i).slice(0, d.max);
export const fewest: Picker = d => d.options.map((_, i) => i).slice(0, d.min);

/** Esegue un generatore rispondendo con `pick`; restituisce il valore finale. */
export function run<T>(gen: Gen<T>, pick: Picker = most): T {
  let r = gen.next();
  while (!r.done) r = gen.next(pick(r.value));
  return r.value;
}

export function names(g: G, cards: number[]): string[] {
  return cards.map(c => g.name(c)).sort();
}

export function actions(g: G): Action[] {
  return legalActions(g);
}
