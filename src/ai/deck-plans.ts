/**
 * Piani di mazzo scritti a mano: correggono il piano ricavato dalla lista
 * dove il buon senso generico sbaglia (es. Hide n' Sneak vuole i suoi Pokémon
 * negli scarti, non in panchina). Ogni piano si attiva se la lista contiene
 * tutte le carte di `detect`.
 *
 * value: quanto conta avere quel Pokémon in campo (0-130); max: quanti al massimo.
 */
import type { PlanEntry } from "./plan.js";

export interface DeckPlan {
  name: string;
  detect: string[];
  entries: Record<string, Partial<PlanEntry>>;
}

export const DECK_PLANS: DeckPlan[] = [
  {
    // dal playbook di Danzica: due Dhelmise bastano, panchina corta, gli altri Hide 'n' Sneak sono carburante
    name: "Hide n' Sneak",
    detect: ["Dhelmise", "Sinistcha"],
    entries: {
      Dhelmise: { value: 120, max: 2, role: "attacker" },
      Poltchageist: { value: 55, max: 1 },
      Sinistcha: { value: 70, max: 1 },
      Shuppet: { value: 25, max: 1 },
      Banette: { value: 40, max: 1 },
      "Latias ex": { value: 55, max: 1 },
      "Lillie's Clefairy ex": { value: 30, max: 1 },
      "Bloodmoon Ursaluna ex": { value: 25, max: 1 },
      Spiritomb: { value: 20, max: 1 },
    },
  },
  {
    name: "Dragapult",
    detect: ["Dragapult ex", "Drakloak"],
    entries: {
      Dreepy: { value: 110, max: 3 },
      Drakloak: { value: 115, max: 3 },
      "Dragapult ex": { value: 125, max: 2 },
      Budew: { value: 45, max: 1 },
      Munkidori: { value: 55, max: 1 },
      "Fezandipiti ex": { value: 30, max: 1 },
      "Meowth ex": { value: 30, max: 1 },
    },
  },
  {
    name: "N's Zoroark",
    detect: ["N's Zoroark ex", "N's Zorua"],
    entries: {
      "N's Zorua": { value: 115, max: 3 },
      "N's Zoroark ex": { value: 125, max: 3 },
      "N's Zekrom": { value: 60, max: 1 },
      "N's Reshiram": { value: 50, max: 1 },
      "Pecharunt ex": { value: 35, max: 1 },
      Munkidori: { value: 45, max: 1 },
      Budew: { value: 30, max: 1 },
      "Meowth ex": { value: 25, max: 1 },
    },
  },
];
