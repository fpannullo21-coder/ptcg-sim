/**
 * Database delle carte, senza accesso ai file: funziona in Node e nel browser.
 * Il caricamento da data/cards.json è in db.ts (solo Node).
 */
import { gameKey, type CardData } from "./cards.js";

const ENERGY_SYMBOL: Record<string, string> = {
  G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal",
};

/** Nome normalizzato per confronti: niente accenti, simboli {P} sciolti, minuscole. */
export function normName(name: string): string {
  return name
    .replace(/\{([GRWLPFDM])\}/g, (_, s) => ENERGY_SYMBOL[s])
    .replace(/^Basic (\w+ Energy)$/i, "$1")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase().trim();
}

export class CardDB {
  byId = new Map<string, CardData>();
  byName = new Map<string, CardData[]>();
  sets: { id: string; code: string; name: string; date: string }[] = [];
  imported = "";

  constructor(data: { sets: CardDB["sets"]; cards: CardData[]; imported: string }) {
    this.sets = data.sets;
    this.imported = data.imported;
    for (const c of data.cards) {
      // i nomi delle Energie base nel database hanno "Basic" davanti; sulle carte e su Live no
      if (c.supertype === "Energy" && c.subtypes.includes("Basic")) c.name = c.name.replace(/^Basic /, "");
      let id = c.id;
      for (let k = 2; this.byId.has(id); k++) id = `${c.id}#${k}`; // pochi errori del database
      c.id = id;
      this.byId.set(id, c);
      const n = normName(c.name);
      if (!this.byName.has(n)) this.byName.set(n, []);
      this.byName.get(n)!.push(c);
    }
  }

  /** Versioni diverse (per testo di gioco) di una carta con quel nome, dalla più recente. */
  versions(name: string): CardData[][] {
    const prints = this.byName.get(normName(name)) ?? [];
    const groups = new Map<string, CardData[]>();
    for (const c of prints) {
      const k = gameKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }
    return [...groups.values()].reverse();
  }

  /** Stampa "canonica" di una carta: la prima stampa con lo stesso testo di gioco. */
  canonical(c: CardData): CardData {
    const k = gameKey(c);
    return (this.byName.get(normName(c.name)) ?? []).find(x => gameKey(x) === k) ?? c;
  }
}

