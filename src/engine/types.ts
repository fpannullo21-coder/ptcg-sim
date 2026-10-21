/**
 * Tipi di base. Lo stato della partita è fatto solo di dati semplici
 * (numeri, stringhe, array), così si può copiare, salvare e confrontare.
 * Le carte nello stato sono numeri: l'indice della carta in `State.cards`,
 * che contiene l'id della definizione nel registro.
 */

export type EType = "G" | "R" | "W" | "L" | "P" | "F" | "D" | "M" | "N" | "C";

export type Kind = "pokemon" | "trainer" | "energy";
export type Sub =
  | "basic" | "stage1" | "stage2"
  | "item" | "supporter" | "stadium" | "tool"
  | "basic_energy" | "special_energy";

/** Una decisione richiesta a un giocatore. La risposta è un elenco di indici in `options`. */
export interface Decision {
  player: number;
  kind: string;          // es. "action", "search", "promote", "discard"
  prompt?: string;
  options: unknown[];    // azioni, carte (numeri) o altro: dati leggibili dall'agente
  min: number;
  max: number;
}

/** Un effetto è un generatore: chiede decisioni con `yield` e riceve gli indici scelti. */
export type Gen<T = void> = Generator<Decision, T, number[]>;

export interface Attack {
  name: string;
  cost: EType[];
  damage: number;
  /** Può restituire il danno base modificato (es. "30+"). */
  effect?: (g: import("./game.js").G, me: number) => Gen<number | void>;
}

export interface Ability {
  name: string;
  oncePerTurn?: boolean; // predefinito: true
  canUse?: (g: import("./game.js").G, me: number, mon: Mon) => boolean;
  use: (g: import("./game.js").G, me: number, mon: Mon) => Gen;
}

export interface CardDef {
  id: string;            // es. "PBL-6"
  name: string;
  kind: Kind;
  sub: Sub;
  hp?: number;
  type?: EType;
  weakness?: EType;
  resistance?: EType;
  retreat?: number;
  attacks?: Attack[];
  abilities?: Ability[];
  evolvesFrom?: string;
  prizes?: number;       // 1 predefinito, 2 per gli ex, 3 per i Mega ex
  tags?: string[];       // "ex", "ace_spec", "hide_n_sneak", ...
  provides?: EType | "*";
  retreatMinus?: number; // per Strumenti come Air Balloon
  canPlay?: (g: import("./game.js").G, me: number) => boolean;
  play?: (g: import("./game.js").G, me: number) => Gen;
}

export interface Mon {
  stack: number[];       // ultima = carta in cima
  energies: number[];
  tools: number[];
  damage: number;
  enteredTurn: number;
  evolvedTurn: number;
  conditions: string[];  // "poisoned", "burned", "asleep", "paralyzed", "confused"
  used: Record<string, number>; // Abilità usate: nome -> turno
}

export interface Player {
  deck: number[];        // ultima = cima del mazzo
  hand: number[];
  prizes: number[];
  discard: number[];
  active: Mon | null;
  bench: Mon[];
  supporterPlayed: boolean;
  energyAttached: boolean;
  retreated: boolean;
  stadiumPlayed: boolean;
}

export interface State {
  cards: string[];       // id della definizione per ogni carta in partita
  players: [Player, Player];
  turn: number;
  current: number;
  first: number;
  stadium: number | null;
  stadiumOwner: number;
  winner: number | null; // -1 = pareggio / limite di turni
  why: string;
  rng: number;
}

export type Action =
  | { kind: "end" }
  | { kind: "bench"; card: number }
  | { kind: "evolve"; card: number; target: number }   // target: -1 attivo, 0..4 panchina
  | { kind: "attach"; card: number; target: number }
  | { kind: "trainer"; card: number; target?: number }
  | { kind: "ability"; target: number; index: number }
  | { kind: "retreat"; target: number }
  | { kind: "attack"; index: number };
