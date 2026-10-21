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
  /** Prima del danno: può restituire il danno base modificato (es. "30+"). */
  effect?: (g: import("./game.js").G, me: number) => Gen<number | void>;
  /** Dopo il danno (es. "Then, discard that Stadium", "Put this Pokémon into your hand"). */
  after?: (g: import("./game.js").G, me: number) => Gen;
}

export interface Ability {
  name: string;
  oncePerTurn?: boolean; // predefinito: true
  /** "bench": si attiva quando giochi questo Pokémon dalla mano in panchina, non come azione libera. */
  trigger?: "bench" | "evolve";
  canUse?: (g: import("./game.js").G, me: number, mon: Mon) => boolean;
  use: (g: import("./game.js").G, me: number, mon: Mon) => Gen;
}

/** Contesto di un danno da attacco, per gli effetti passivi che lo modificano. */
export interface DamageCtx {
  attacker: Mon;
  attackerOwner: number;
  target: Mon;
  targetOwner: number;
  toActive: boolean;
  damage: number;
}

/**
 * Effetti passivi: valgono finché la carta è in gioco (in cima a un Pokémon,
 * attaccata come Strumento, Stadio in campo). Ogni campo è facoltativo.
 * `owner` è il giocatore che controlla la carta, `self` il Pokémon su cui si trova.
 */
export type BlockKind = "item" | "supporter" | "stadium" | "tool" | "ability" | "ace" | "evolve";

export interface Passive {
  /** Modifica il danno di un attacco prima di debolezza e resistenza (es. Black Belt, Maximum Belt). */
  damageBefore?: (g: import("./game.js").G, ctx: DamageCtx, owner: number, self: Mon | null) => number;
  /** Modifica il danno dopo debolezza e resistenza (es. riduzioni del danno subito). */
  damageAfter?: (g: import("./game.js").G, ctx: DamageCtx, owner: number, self: Mon | null) => number;
  /** Impedisce gli effetti di attacchi e Abilità avversari su questo Pokémon (es. Hide 'n' Sneak). */
  preventsEffects?: (g: import("./game.js").G, target: Mon, sourcePlayer: number, owner: number, self: Mon | null) => boolean;
  /** Blocca il gioco di un tipo di carta o l'uso delle Abilità per un giocatore (es. blocco degli Oggetti). */
  blocks?: (g: import("./game.js").G, player: number, what: BlockKind, card: number | null, owner: number, self: Mon | null) => boolean;
  /** Quante {C} in meno costa un attacco (es. Seasoned Skill di Bloodmoon Ursaluna ex). */
  attackCostLess?: (g: import("./game.js").G, mon: Mon, attack: Attack, monOwner: number, owner: number, self: Mon | null) => number;
  /** Cambia la debolezza di un Pokémon (es. Fairy Zone). Restituisce il nuovo tipo o undefined per non cambiarla. */
  weakness?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => EType | undefined;
  /** Variazione dei premi presi quando un Pokémon va KO (es. Legacy Energy: -1). */
  prizes?: (g: import("./game.js").G, ko: Mon, koOwner: number, byAttack: boolean, owner: number, self: Mon | null) => number;
  /** PS in più (es. Hero's Cape: +100). */
  hp?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => number;
  /** Dopo che un Pokémon ha subito danno da un attacco avversario (es. Lucky Helmet). */
  damaged?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => void;
  /** Un Pokémon che andrebbe KO per il danno di un attacco resta in gioco (es. Durable Body). Vero = sopravvive. */
  survives?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => boolean;
  /** Panchina massima (es. Area Zero Underdepths: 8 con un Pokémon Tera in gioco). */
  benchSize?: (g: import("./game.js").G, player: number, owner: number) => number;
  /** Cosa fornisce un'Energia attaccata (es. Wild Growth: ogni Energia Erba base fornisce {G}{G}). */
  energyProvides?: (g: import("./game.js").G, energy: number, energyOwner: number, owner: number, self: Mon | null) => string[] | undefined;
  /** Un Pokémon può evolversi nel turno in cui è stato messo in gioco (es. Forest of Vitality). */
  evolveSameTurn?: (g: import("./game.js").G, mon: Mon, evo: number, monOwner: number, owner: number) => boolean;
  /** Quando un Pokémon viene messo in panchina durante il turno del suo giocatore (es. Risky Ruins). */
  benched?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => void;
  /** Alla fine del turno del giocatore `player` (dopo l'attacco). */
  endOfTurn?: (g: import("./game.js").G, player: number, owner: number, self: Mon | null) => void;
  /** Impedisce le cure su un Pokémon (es. Life-Locked di Yveltal). */
  noHeal?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => boolean;
  /** Variazione del costo di ritirata di un Pokémon (es. Air Balloon: -2). */
  retreat?: (g: import("./game.js").G, mon: Mon, monOwner: number, owner: number, self: Mon | null) => number;
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
  passive?: Passive;
  /** Quando questa Energia viene attaccata dalla mano (es. Telepathic Psychic Energy). */
  onAttach?: (g: import("./game.js").G, me: number, mon: Mon) => Gen;
  /** Azione di uno Stadio usabile una volta per turno da ciascun giocatore (es. Prism Tower). */
  stadiumAction?: { canUse?: (g: import("./game.js").G, me: number) => boolean; use: (g: import("./game.js").G, me: number) => Gen };
  /** Effetto che resta attivo fino alla fine del turno dopo aver giocato la carta (es. Black Belt's Training). */
  turnPassive?: Passive;
  /** Parti del testo non ancora implementate: la carta gioca come se non le avesse. */
  missing?: string[];
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
  /** Contatori liberi per effetti "una volta per partita" o "una volta per turno" (nome -> valore). */
  flags: Record<string, number>;
}

export interface State {
  cards: string[];       // id della definizione per ogni carta in partita
  players: [Player, Player];
  turn: number;
  current: number;
  first: number;
  stadium: number | null;
  stadiumOwner: number;
  /** Effetti "per questo turno": la carta che li ha creati, chi l'ha giocata, ultimo turno valido. */
  turnEffects: { card: number; owner: number; until: number }[];
  /** Giocatore che sta attaccando, durante la risoluzione di un attacco; altrimenti -1. */
  attacking: number;
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
  | { kind: "attack"; index: number; from?: number }   // from: attacco di un Pokémon in panchina (Memory Helix)
  | { kind: "stadium" };
