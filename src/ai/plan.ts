/**
 * Piano di gioco ricavato dalla lista: quali Pokémon contano e quanti ne servono in campo.
 *
 * - Linee evolutive: il Pokémon Base di una linea con evoluzioni nel mazzo vale molto
 *   (va messo in panchina presto, fino a quante copie dell'evoluzione ci sono, massimo 3).
 * - Attaccanti principali: Pokémon con danni alti, pesati per numero di copie.
 * - Pokémon di supporto (Abilità, una o due copie): al massimo uno in campo, dopo le linee.
 *
 * Un piano scritto a mano per un archetipo può sostituire questi valori (fase 1).
 */
import type { G } from "../engine/game.js";
import type { Attack, CardDef } from "../engine/types.js";

/**
 * Danno tipico di attacchi il cui danno stampato non dice quanto fanno davvero
 * (es. "30+", danni per ogni carta, attacchi copiati). Serve ai giocatori simulati
 * per decidere chi caricare e chi mandare in attivo; il danno vero lo calcola il motore.
 */
const ESTIMATE: Record<string, number> = {
  "Vengeful Anchor": 170, "Matcha Spin": 100, "Spiritual End": 200, "Night Joker": 160,
  "Gale Thrust": 150, "Hungry Jaws": 200, "Maximum Drilling": 250, "Full Moon Rondo": 100,
  "Tenacious Tail": 120, "Rocket Feathers": 180, "R Command": 100, "Psychic": 110,
  "Powerful Hand": 160, "Dark Frost": 120,
};

/** Danno atteso di un attacco per le scelte dei giocatori simulati. */
export function atkDamage(a: Attack): number {
  if (a.estimate !== undefined) return a.estimate;
  if (ESTIMATE[a.name] !== undefined) return ESTIMATE[a.name];
  return a.damage > 0 ? a.damage : a.effect ? 60 : 0;
}

export interface PlanEntry { value: number; max: number; role: "line" | "attacker" | "support" | "other" }
export type Plan = Map<string, PlanEntry> & { fuel?: string };

/** Attacchi che contano le carte negli scarti: le carte con quel tag vanno scartate volentieri. */
const FUEL: Record<string, string> = {
  "Vengeful Anchor": "hide_n_sneak", "Matcha Spin": "hide_n_sneak", "Spiritual End": "hide_n_sneak",
};

/** Tutte le carte di un giocatore, ovunque si trovino (la lista intera). */
function allCards(g: G, me: number): CardDef[] {
  const p = g.p(me);
  const ids = [...p.deck, ...p.hand, ...p.prizes, ...p.discard, ...g.inPlay(me).flatMap(m => [...m.stack, ...m.energies, ...m.tools])];
  return ids.map(c => g.def(c));
}

export function derivePlan(g: G, me: number): Plan {
  const cards = allCards(g, me).filter(d => d.kind === "pokemon");
  const copies = new Map<string, number>();
  const defs = new Map<string, CardDef>();
  for (const d of cards) { copies.set(d.name, (copies.get(d.name) ?? 0) + 1); defs.set(d.name, d); }
  const maxDamage = (d: CardDef) => Math.max(0, ...(d.attacks ?? []).map(atkDamage));
  const plan: Plan = new Map();
  for (const d of defs.values()) for (const a of d.attacks ?? []) if (FUEL[a.name]) plan.fuel = FUEL[a.name];
  // linee evolutive
  for (const [name, d] of defs) {
    if (!d.evolvesFrom) continue;
    let base = d.evolvesFrom, prev = defs.get(base);
    while (prev?.evolvesFrom && defs.has(prev.evolvesFrom)) { base = prev.evolvesFrom; prev = defs.get(base); }
    if (!defs.has(base)) continue;
    const top = maxDamage(d);
    const e = plan.get(base) ?? { value: 0, max: 0, role: "line" as const };
    e.value = Math.max(e.value, 70 + Math.min(40, top / 6));
    e.max = Math.min(3, Math.max(e.max, copies.get(name) ?? 1, Math.ceil((copies.get(base) ?? 1) * 0.75)));
    plan.set(base, e);
    plan.set(name, { value: 85 + Math.min(40, top / 6), max: 3, role: "line" });
  }
  // Pokémon Base che non fanno parte di linee
  for (const [name, d] of defs) {
    if (plan.has(name)) continue;
    const n = copies.get(name) ?? 1, dmg = maxDamage(d);
    if (dmg >= 120 && n >= 2) plan.set(name, { value: 65 + Math.min(30, dmg / 8), max: 2, role: "attacker" });
    else if ((d.abilities?.length ?? 0) > 0 || d.passive) plan.set(name, { value: n >= 3 ? 55 : 40, max: n >= 3 ? 2 : 1, role: "support" });
    else plan.set(name, { value: 30 + Math.min(30, dmg / 8), max: 1, role: "other" });
  }
  return plan;
}
