/**
 * Formato compatto delle carte importate e conversione dal database aperto.
 */

export interface RawSet {
  id: string; name: string; ptcgoCode?: string; releaseDate: string;
  legalities?: { standard?: string };
}

export interface RawCard {
  id: string; name: string; supertype: string; subtypes?: string[]; hp?: string; types?: string[];
  evolvesFrom?: string; rules?: string[];
  abilities?: { name: string; text: string; type: string }[];
  attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
  weaknesses?: { type: string; value: string }[];
  resistances?: { type: string; value: string }[];
  convertedRetreatCost?: number; number: string; regulationMark?: string;
  legalities?: { standard?: string };
}

/** Una carta come la salviamo in data/cards.json. */
export interface CardData {
  id: string;            // codice set di Live + numero, es. "PBL-6"
  name: string;
  supertype: "Pokémon" | "Trainer" | "Energy";
  subtypes: string[];    // es. ["Stage 1"], ["Basic", "ex"], ["Supporter"], ["Item", "ACE SPEC"]
  hp?: number;
  types?: string[];
  evolvesFrom?: string;
  abilities?: { name: string; text: string }[];
  attacks?: { name: string; cost: string[]; damage: string; text: string }[];
  weakness?: string;
  resistance?: string;
  retreat?: number;
  rules?: string[];
  mark?: string;
  /** Chiave delle ristampe già calcolata (dati pubblici senza testi). */
  key?: string;
}

export function compact(c: RawCard, s: RawSet): CardData {
  const d: CardData = {
    id: `${s.ptcgoCode ?? s.id}-${c.number}`,
    name: c.name,
    supertype: c.supertype as CardData["supertype"],
    subtypes: c.subtypes ?? [],
  };
  if (c.hp) d.hp = Number(c.hp);
  if (c.types) d.types = c.types;
  if (c.evolvesFrom) d.evolvesFrom = c.evolvesFrom;
  if (c.abilities?.length) d.abilities = c.abilities.map(a => ({ name: a.name, text: a.text }));
  if (c.attacks?.length) d.attacks = c.attacks.map(a => ({ name: a.name, cost: a.cost ?? [], damage: a.damage ?? "", text: a.text ?? "" }));
  if (c.weaknesses?.length) d.weakness = c.weaknesses[0].type;
  if (c.resistances?.length) d.resistance = c.resistances[0].type;
  if (c.convertedRetreatCost !== undefined) d.retreat = c.convertedRetreatCost;
  if (c.rules?.length) d.rules = c.rules;
  if (c.regulationMark) d.mark = c.regulationMark;
  return d;
}

/**
 * Chiave per riconoscere le ristampe: stesso nome e stesso testo di gioco
 * vuol dire stessa carta, anche con set e numero diversi.
 */
export function gameKey(c: CardData): string {
  // i dati pubblici del sito non hanno i testi delle carte: portano la chiave già calcolata
  if (c.key) return c.key;
  return JSON.stringify([c.name, c.hp, c.types, c.abilities, c.attacks, c.rules, c.weakness, c.retreat, c.subtypes.filter(s => s !== "ACE SPEC")]);
}
