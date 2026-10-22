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
  /** Chi mettere in attivo all'inizio, in ordine di preferenza. */
  openers?: string[];
  /** Stadio da avere sempre in gioco (si gioca appena possibile). */
  stadium?: string;
  /** Riempire la panchina (attacchi che contano i Pokémon in panchina). */
  fillBench?: boolean;
  /** Attaccanti principali: le Energie vanno prima a loro, o ai Pokémon da cui evolvono. */
  focus?: string[];
  /** Supporter da tenere in mano invece di giocarli (prefisso del nome): l'attacco li scarta per fare danni. */
  hoard?: string;
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
    // docs/piani/dragapult.md
    name: "Dragapult",
    detect: ["Dragapult ex", "Drakloak"],
    openers: ["Budew", "Dreepy", "Dunsparce"],
    entries: {
      Dreepy: { value: 110, max: 3 },
      Drakloak: { value: 115, max: 3 },
      "Dragapult ex": { value: 125, max: 2 },
      Budew: { value: 45, max: 1 },
      Munkidori: { value: 60, max: 1 },
      Dunsparce: { value: 35, max: 1 },
      "Fezandipiti ex": { value: 10, max: 1 },
      "Meowth ex": { value: 10, max: 1 },
    },
  },
  {
    // docs/piani/slowking.md: Mega Kangaskhan ex in attivo nei primi turni (Run Errand pesca 2),
    // Slowking con le sue due Energie prima di tutto; i Pokémon da copiare con Seek Inspiration
    // restano nel mazzo e si mettono in cima con Academy at Night o Ciphermaniac's Codebreaking
    name: "Slowking",
    detect: ["Slowking", "Slowpoke"],
    openers: ["Mega Kangaskhan ex", "Latias ex", "Slowpoke"],
    focus: ["Slowking"],
    entries: {
      Slowpoke: { value: 115, max: 3 },
      Slowking: { value: 125, max: 3 },
      "Latias ex": { value: 60, max: 1 },
      "Mega Kangaskhan ex": { value: 70, max: 1 },
      Kyurem: { value: 5, max: 0 },
      Metagross: { value: 5, max: 0 },
      Annihilape: { value: 5, max: 0 },
      Zeraora: { value: 5, max: 0 },
      "Lillie's Clefairy ex": { value: 20, max: 1 },
      "Fezandipiti ex": { value: 10, max: 1 },
      "Meowth ex": { value: 10, max: 1 },
    },
  },
  {
    // docs/piani/festival-lead.md: Festival Grounds sempre in gioco, panchina piena per Do the Wave,
    // Dipplin attaccante principale, Shaymin presto (protegge la panchina), Thwackey cerca qualsiasi carta
    name: "Festival Lead",
    detect: ["Dipplin", "Thwackey"],
    openers: ["Applin", "Goldeen", "Grookey"],
    stadium: "Festival Grounds",
    fillBench: true,
    focus: ["Dipplin"],
    entries: {
      Applin: { value: 110, max: 3 },
      Dipplin: { value: 125, max: 3 },
      Grookey: { value: 100, max: 2 },
      Thwackey: { value: 105, max: 2 },
      Goldeen: { value: 55, max: 1 },
      Seaking: { value: 50, max: 1 },
      Rellor: { value: 60, max: 1 },
      Rabsca: { value: 80, max: 1 },
      Psyduck: { value: 50, max: 1 },
      Shaymin: { value: 100, max: 1 },
      Moltres: { value: 50, max: 1 },
    },
  },
  {
    // docs/piani/zoroark.md: Night Joker copia l'attacco che rende di più (Darmanitan per due Base,
    // Zekrom e Reshiram per i Pokémon grandi); le due Energie vanno su Zoroark ex; Trade quante ne servono
    name: "N's Zoroark",
    detect: ["N's Zoroark ex", "N's Zorua"],
    focus: ["N's Zoroark ex"],
    entries: {
      "N's Zorua": { value: 115, max: 3 },
      "N's Zoroark ex": { value: 125, max: 3 },
      // Night Joker copia gli attacchi degli N's in panchina: senza Zekrom o Reshiram in campo non fa danni,
      // quindi entrano subito dopo il primo Zorua (prima si riempiva la panchina di Zorua e Night Joker restava a vuoto)
      "N's Zekrom": { value: 112, max: 1 },
      // Powerful Rage (20 per ogni segnalino su Zoroark ex) è l'attacco che vince contro Dragapult
      "N's Reshiram": { value: 108, max: 1 },
      "N's Darmanitan": { value: 50, max: 1 },
      "Pecharunt ex": { value: 35, max: 1 },
      Munkidori: { value: 45, max: 1 },
      Budew: { value: 30, max: 1 },
      "Meowth ex": { value: 25, max: 1 },
    },
  },
  {
    // docs/piani/honchkrow.md: Rocket Feathers fa 60 per ogni Supporter Team Rocket scartato dalla mano,
    // quindi i Supporter si accumulano e si giocano solo per il loro effetto; Ignition Energy solo sull'attivo nel turno in cui attacca
    name: "Rocket's Honchkrow",
    detect: ["Team Rocket's Honchkrow", "Team Rocket's Murkrow"],
    openers: ["Team Rocket's Murkrow", "Team Rocket's Porygon"],
    focus: ["Team Rocket's Honchkrow"],
    hoard: "Team Rocket's",
    entries: {
      "Team Rocket's Murkrow": { value: 115, max: 3 },
      "Team Rocket's Honchkrow": { value: 125, max: 3 },
      "Team Rocket's Porygon": { value: 55, max: 1 },
      "Team Rocket's Porygon2": { value: 70, max: 1 },
      // Articuno (Repelling Veil) protegge dagli effetti degli attacchi i Base Team Rocket: con lui in campo la panchina di Base è al sicuro
      "Team Rocket's Articuno": { value: 95, max: 1 },
    },
  },
  {
    // Basic Box contro Dragapult (Francesco): Lillie's Clefairy ex rende i Draghi deboli al Psico,
    // quindi Latias ex (Eon Blade) e Clefairy (Full Moon Rondo) fanno il doppio; Ogerpon Maschera Pozzo colpisce la panchina
    name: "Basic Box",
    detect: ["Mega Kangaskhan ex", "Teal Mask Ogerpon ex", "Lillie's Clefairy ex"],
    openers: ["Mega Kangaskhan ex", "Teal Mask Ogerpon ex"],
    entries: {
      "Mega Kangaskhan ex": { value: 90, max: 2, role: "attacker" },
      "Latias ex": { value: 85, max: 1, role: "attacker" },
      "Lillie's Clefairy ex": { value: 60, max: 1 },
      "Wellspring Mask Ogerpon ex": { value: 70, max: 1, role: "attacker" },
      "Teal Mask Ogerpon ex": { value: 75, max: 1, role: "attacker" },
      "Meowth ex": { value: 20, max: 1 },
      "Fezandipiti ex": { value: 15, max: 1 },
    },
  },
];
