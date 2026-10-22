/**
 * Le liste dell'utente: nome scelto da lui, archetipo (automatico o impostato a mano), testo di Live.
 * Restano nel browser (localStorage): comode per chi le usa, non passano da nessun server.
 */
import { load, save } from "./data";

export interface MyList {
  id: string;
  name: string;
  /** "" = riconosciuto in automatico; "-" = nessun archetipo del meta; altrimenti il nome dell'archetipo. */
  archetype: string;
  text: string;
  updated: number;
}

const KEY = "ptcg.lists", ACTIVE = "ptcg.active";

export function loadLists(): MyList[] {
  try {
    const l = JSON.parse(load(KEY) ?? "[]");
    if (Array.isArray(l) && l.length) return l;
  } catch { /* lista illeggibile: si riparte */ }
  // la vecchia versione salvava una sola lista
  const old = load("ptcg.deck");
  return old ? [{ id: newId(), name: "La mia lista", archetype: "", text: old, updated: Date.now() }] : [];
}
export const saveLists = (l: MyList[]) => save(KEY, JSON.stringify(l));
export const loadActive = () => load(ACTIVE);
export const saveActive = (id: string) => save(ACTIVE, id);
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
