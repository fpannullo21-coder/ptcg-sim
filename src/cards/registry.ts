/**
 * Registro delle carte: unisce i dati importati (PS, tipi, costi, danni)
 * agli effetti scritti a mano in src/cards/impl, e dice cosa manca.
 *
 * Regola: una parte di testo non implementata non fa niente.
 * - attacco con testo non implementato: fa solo il danno stampato;
 * - Abilità non implementata: non si può usare;
 * - Allenatore non implementato: non si può giocare (resta in mano);
 * - Energia speciale non implementata: conta come una {C}.
 * Il report di copertura elenca tutte queste parti.
 */
import type { CardData } from "../data/cards.js";
import type { CardDB } from "../data/db.js";
import type { Deck } from "../data/decklist.js";
import type { Ability, Attack, CardDef, EType, Passive, Sub } from "../engine/types.js";
import type { G } from "../engine/game.js";

export const TYPE: Record<string, EType> = {
  Grass: "G", Fire: "R", Water: "W", Lightning: "L", Psychic: "P", Fighting: "F",
  Darkness: "D", Metal: "M", Dragon: "N", Colorless: "C",
};

/** Implementazione a mano di una carta, per nome (e facoltativamente per versione). */
export interface Impl {
  name: string;
  /** Se una carta ha più versioni con lo stesso nome, quale questa implementa. */
  version?: (c: CardData) => boolean;
  attacks?: Record<string, { effect?: Attack["effect"]; after?: Attack["after"]; damage?: number }>;
  abilities?: Record<string, Omit<Ability, "name">>;
  play?: CardDef["play"];
  canPlay?: CardDef["canPlay"];
  passive?: Passive;
  turnPassive?: Passive;
  provides?: CardDef["provides"];
  onAttach?: CardDef["onAttach"];
  stadiumAction?: CardDef["stadiumAction"];
  tags?: string[];
  /** Testo coperto dal motore o volutamente ignorato (es. "solo estetico"). */
  covers?: string[];
}

export function slugTag(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function sub(c: CardData): Sub {
  const st = c.subtypes;
  if (c.supertype === "Pokémon") return st.includes("Stage 2") ? "stage2" : st.includes("Stage 1") ? "stage1" : "basic";
  if (c.supertype === "Energy") return st.includes("Basic") ? "basic_energy" : "special_energy";
  if (st.includes("Supporter")) return "supporter";
  if (st.includes("Stadium")) return "stadium";
  if (st.includes("Pokémon Tool")) return "tool";
  return "item";
}

function baseDamage(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export class Registry {
  private impls = new Map<string, Impl[]>();
  private cache = new Map<string, CardDef>();

  constructor(public db: CardDB, impls: Impl[]) {
    for (const i of impls) {
      const k = i.name.toLowerCase();
      if (!this.impls.has(k)) this.impls.set(k, []);
      this.impls.get(k)!.push(i);
    }
  }

  impl(c: CardData): Impl | undefined {
    return (this.impls.get(c.name.toLowerCase()) ?? []).find(i => !i.version || i.version(c));
  }

  /** CardDef per una carta del database; le ristampe con lo stesso testo condividono la stessa definizione. */
  def(card: CardData): CardDef {
    const c = this.db.canonical(card);
    const hit = this.cache.get(c.id);
    if (hit) return hit;
    const d = this.build(c);
    this.cache.set(c.id, d);
    return d;
  }

  private build(c: CardData): CardDef {
    const im = this.impl(c);
    const missing: string[] = [];
    const tags = new Set<string>(im?.tags ?? []);
    const st = c.subtypes;
    if (st.includes("ex")) tags.add("ex");
    if (st.includes("MEGA")) tags.add("mega");
    if (st.includes("Tera")) tags.add("tera");
    if (st.includes("ACE SPEC")) tags.add("ace_spec");
    if (st.includes("Ancient")) tags.add("ancient");
    if (st.includes("Future")) tags.add("future");
    for (const a of c.abilities ?? []) tags.add(slugTag(a.name));
    const covered = new Set(im?.covers ?? []);
    const d: CardDef = { id: c.id, name: c.name, kind: c.supertype === "Pokémon" ? "pokemon" : c.supertype === "Trainer" ? "trainer" : "energy", sub: sub(c) };

    if (d.kind === "pokemon") {
      d.hp = c.hp;
      d.type = TYPE[c.types?.[0] ?? "Colorless"];
      if (c.weakness) d.weakness = TYPE[c.weakness];
      if (c.resistance) d.resistance = TYPE[c.resistance];
      d.retreat = c.retreat ?? 0;
      if (c.evolvesFrom) d.evolvesFrom = c.evolvesFrom;
      d.prizes = tags.has("mega") ? 3 : tags.has("ex") ? 2 : 1;
      d.attacks = (c.attacks ?? []).map(a => {
        const ia = im?.attacks?.[a.name];
        if (a.text && !ia && !covered.has(a.name)) missing.push(`attacco ${a.name}: ${a.text}`);
        return { name: a.name, cost: a.cost.map(x => TYPE[x] ?? "C"), damage: ia?.damage ?? baseDamage(a.damage), effect: ia?.effect, after: ia?.after };
      });
      d.abilities = [];
      for (const a of c.abilities ?? []) {
        const ia = im?.abilities?.[a.name];
        if (ia) d.abilities.push({ name: a.name, ...ia });
        else if (!covered.has(a.name)) missing.push(`Abilità ${a.name}: ${a.text}`);
      }
      if (im?.passive) d.passive = im.passive;
      if (im?.passive && c.abilities?.length) tags.add("ability_passive");
      if (im?.turnPassive) d.turnPassive = im.turnPassive;
    } else if (d.kind === "trainer") {
      if (im) {
        d.play = im.play;
        d.canPlay = im.canPlay;
        d.passive = im.passive;
        d.turnPassive = im.turnPassive;
        d.stadiumAction = im.stadiumAction;
      } else {
        missing.push(`${c.name}: ${(c.rules ?? []).filter(r => !/^You may play only 1|^This card stays|^You can't have more than 1 ACE SPEC/i.test(r)).join(" ")}`);
        d.canPlay = () => false;
      }
    } else {
      if (d.sub === "basic_energy") {
        d.provides = TYPE[c.name.replace(/ Energy$/, "")] ?? "C";
      } else if (im) {
        d.provides = im.provides ?? "C";
        d.passive = im.passive;
        d.onAttach = im.onAttach;
      } else {
        d.provides = "C";
        missing.push(`${c.name}: ${(c.rules ?? []).join(" ")}`);
      }
    }
    if (tags.size) d.tags = [...tags];
    if (missing.length) d.missing = missing;
    return d;
  }

  /** Il mazzo come elenco di 60 definizioni, pronto per il motore. */
  deck(deck: Deck): CardDef[] {
    const out: CardDef[] = [];
    for (const e of deck.entries) {
      if (!e.card) throw new Error(`${deck.name}: carta non trovata "${e.line}"`);
      const d = this.def(e.card);
      for (let k = 0; k < e.count; k++) out.push(d);
    }
    return out;
  }

  /** Cosa manca in un mazzo: parti di testo non implementate, pesate per numero di copie. */
  coverage(deck: Deck): { total: number; complete: number; missing: { name: string; count: number; parts: string[] }[] } {
    let total = 0, complete = 0;
    const missing: { name: string; count: number; parts: string[] }[] = [];
    for (const e of deck.entries) {
      if (!e.card) continue;
      total += e.count;
      const d = this.def(e.card);
      if (!d.missing) complete += e.count;
      else missing.push({ name: d.name, count: e.count, parts: d.missing });
    }
    return { total, complete, missing };
  }
}

/** Utilità per gli effetti: il giocatore avversario. */
export const opp = (me: number) => 1 - me;
export type { G };
