/** Carte inventate per collaudare il motore (non sono carte reali). */
import type { CardDef } from "../engine/types.js";
import * as fx from "./effects.js";

const energy = (t: "R" | "W"): CardDef => ({ id: `T-E${t}`, name: `Energia ${t}`, kind: "energy", sub: "basic_energy", provides: t });

export const FIRE_E = energy("R");
export const WATER_E = energy("W");

export const SALAMANDRA: CardDef = {
  id: "T-1", name: "Salamandra", kind: "pokemon", sub: "basic", hp: 70, type: "R", weakness: "W", retreat: 1,
  attacks: [{ name: "Fiammella", cost: ["R"], damage: 30 }, { name: "Vampata", cost: ["R", "C"], damage: 60 }],
};
export const DRAGONE: CardDef = {
  id: "T-2", name: "Dragone", kind: "pokemon", sub: "stage1", evolvesFrom: "Salamandra", hp: 150, type: "R", weakness: "W", retreat: 2,
  attacks: [{ name: "Rogo", cost: ["R", "R", "C"], damage: 140 }],
};
export const RANA: CardDef = {
  id: "T-3", name: "Rana", kind: "pokemon", sub: "basic", hp: 80, type: "W", weakness: "L", retreat: 1,
  attacks: [{ name: "Getto", cost: ["W"], damage: 20 }, { name: "Onda", cost: ["W", "C"], damage: 50 }],
};
export const ROSPO_EX: CardDef = {
  id: "T-4", name: "Rospo ex", kind: "pokemon", sub: "basic", hp: 220, type: "W", weakness: "L", retreat: 2, prizes: 2, tags: ["ex"],
  attacks: [{ name: "Diluvio", cost: ["W", "W", "C"], damage: 180 }],
};
export const PESCA_TRE: CardDef = {
  id: "T-5", name: "Pesca Tre", kind: "trainer", sub: "item",
  *play(g, me) { fx.draw(g, me, 3); },
};
export const RICERCA: CardDef = {
  id: "T-6", name: "Ricerca", kind: "trainer", sub: "supporter",
  *play(g, me) { fx.discardHand(g, me); fx.draw(g, me, 7); },
};
export const RETE: CardDef = {
  id: "T-7", name: "Rete", kind: "trainer", sub: "item",
  canPlay: (g, me) => g.p(me).bench.length < 5,
  *play(g, me) { yield* fx.searchDeck(g, me, fx.isBasicPokemon, 2, "bench"); },
};

const rep = <T>(x: T, n: number): T[] => Array.from({ length: n }, () => x);

export const fireDeck = (): CardDef[] => [
  ...rep(SALAMANDRA, 4), ...rep(DRAGONE, 3), ...rep(FIRE_E, 41), ...rep(PESCA_TRE, 4), ...rep(RICERCA, 4), ...rep(RETE, 4),
];
export const waterDeck = (): CardDef[] => [
  ...rep(RANA, 4), ...rep(ROSPO_EX, 3), ...rep(WATER_E, 41), ...rep(PESCA_TRE, 4), ...rep(RICERCA, 4), ...rep(RETE, 4),
];
