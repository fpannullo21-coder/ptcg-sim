/**
 * Giocatore base generico: regole di buon senso valide per qualsiasi mazzo.
 * È il punto di partenza dei piani di mazzo (fase 1) e il giocatore delle
 * continuazioni del giocatore forte (fase 2).
 *
 * Ordine del turno: Abilità ed evoluzioni, panchina, ricerca, Energia,
 * Supporter, poi l'attacco migliore. Boss's Orders solo se dà un KO.
 */
import { apply, applyDamage, attack, attackCost, canPay, G, GameOver, provided, retreatCost, slot } from "../engine/game.js";
import type { Agent } from "../engine/game.js";
import { atkDamage, derivePlan, type Plan } from "./plan.js";
import type { Action, Attack, CardDef, Decision, Mon } from "../engine/types.js";

const SEARCH = new Set(["search", "ultra_ball", "poke_pad", "puppet_pull", "poffin", "telepathic", "explorer", "pokegear",
  "night_stretcher", "recover", "procurement", "look_top", "patch_energy", "attach_discard"]);
const DISCARD = new Set(["discard", "ultra_ball_discard", "prism_discard", "retreat_discard"]);

export class BasicAgent implements Agent {
  /** fast: niente prove su copie della partita (per le continuazioni del giocatore Monte Carlo). */
  constructor(public opts: { benchMax?: number; fast?: boolean } = {}) {}

  /** Danno stimato dell'attacco senza provarlo (modalità veloce). */
  quickAttackValue(g: G, me: number, index: number, from?: number): number {
    const p = g.p(me), o = g.p(1 - me);
    const m = from !== undefined ? p.bench[from] : p.active!;
    const atk = g.top(m).attacks![index];
    const dmg = atkDamage(atk);
    return dmg + (o.active && dmg >= g.hpLeft(o.active) ? 1000 * (g.top(o.active).prizes ?? 1) : 0);
  }

  private plans: (Plan | null)[] = [null, null];
  /** Piano della lista del giocatore (ricavato una volta sola alla prima decisione). */
  plan(g: G, me: number): Plan {
    return (this.plans[me] ??= derivePlan(g, me));
  }

  /** Quanto vale mettere in campo questo Pokémon adesso, secondo il piano. */
  benchValue(g: G, me: number, c: number): number {
    const d = g.def(c), e = this.plan(g, me).get(d.name);
    if (!e) return 20;
    const inPlay = g.inPlay(me).filter(m => g.top(m).name === d.name || m.stack.some(x => g.def(x).name === d.name)).length;
    if (inPlay >= e.max) return 5;
    let v = e.value - 10 * inPlay;
    const p = g.p(me);
    // Pokémon che servono solo in certi momenti (Meowth ex: cerca un Supporter; Fezandipiti ex: pesca dopo un KO subito)
    const abil = d.abilities ?? [];
    if (abil.some(a => a.trigger === "bench") && !p.supporterPlayed && !p.hand.some(x => g.def(x).sub === "supporter")) v = Math.max(v, 55);
    if (abil.some(a => a.name === "Flip the Script") && p.flags.ko_turn === g.s.turn - 1) v = Math.max(v, 60);
    return v;
  }

  // --- valutazioni --------------------------------------------------------

  /** Danno stampato del miglior attacco pagabile adesso da questo Pokémon. */
  bestDamage(g: G, m: Mon): { atk: Attack | null; dmg: number } {
    let best: { atk: Attack | null; dmg: number } = { atk: null, dmg: -1 };
    for (const a of g.top(m).attacks ?? []) {
      if (canPay(g, m.energies, attackCost(g, m, a)) && atkDamage(a) > best.dmg) best = { atk: a, dmg: atkDamage(a) };
    }
    return best;
  }

  /** Simboli del costo non ancora coperti da queste Energie (prima i tipi, poi gli incolori). */
  need(g: G, energies: number[], cost: string[]): number {
    const pool = energies.flatMap(e => provided(g, e));
    let missing = 0, colorless = 0;
    for (const c of cost) {
      if (c === "C") { colorless++; continue; }
      let k = pool.indexOf(c);
      if (k < 0) k = pool.indexOf("*");
      if (k < 0) missing++; else pool.splice(k, 1);
    }
    return missing + Math.max(0, colorless - pool.length);
  }

  /** Quanto aiuta attaccare l'Energia `e` al Pokémon `m`: 0 se non avvicina nessun attacco utile. */
  energyHelp(g: G, m: Mon, e: number): number {
    let best = 0;
    for (const a of g.top(m).attacks ?? []) {
      if (atkDamage(a) <= 0) continue;
      const cost = attackCost(g, m, a);
      const before = this.need(g, m.energies, cost), after = this.need(g, [...m.energies, e], cost);
      if (after < before) best = Math.max(best, 10 + Math.max(atkDamage(a), 30) / 10 + (after === 0 ? 20 : 0));
    }
    return best;
  }

  /**
   * Costo dell'attacco principale per un Pokémon del piano (`focus` del piano di mazzo):
   * quello del Pokémon stesso o dell'evoluzione che diventerà. null se non è un attaccante principale.
   */
  focusCost(g: G, me: number, m: Mon): string[] | null {
    const names = this.plan(g, me).focus;
    if (!names) return null;
    const p = g.p(me), name = g.top(m).name;
    let def: CardDef | undefined;
    if (names.includes(name)) def = g.top(m);
    else for (const c of [...p.hand, ...p.deck, ...p.discard]) { const d = g.def(c); if (d.evolvesFrom === name && names.includes(d.name)) { def = d; break; } }
    const atks = def?.attacks ?? [];
    if (!atks.length) return null;
    const a = atks.reduce((x, y) => (atkDamage(y) > atkDamage(x) ? y : x));
    return def === g.top(m) ? attackCost(g, m, a) : [...a.cost];
  }

  /** L'attaccante principale del piano da caricare adesso: il più vicino a essere pronto, prima l'attivo. */
  planFocus(g: G, me: number): Mon | null {
    let best: Mon | null = null, bv = -Infinity;
    const p = g.p(me);
    for (const m of g.inPlay(me)) {
      const cost = this.focusCost(g, me, m);
      if (!cost) continue;
      const need = this.need(g, m.energies, cost);
      // chi è già pronto non riceve altre Energie se un altro ne ha bisogno
      const v = (need > 0 ? 100 - 10 * need : 0) + (m === p.active ? 5 : 0) + (this.plan(g, me).focus!.includes(g.top(m).name) ? 3 : 0);
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }

  /** L'attaccante su cui concentrare le Energie: il più forte tra quelli più vicini a essere pronti. */
  focus(g: G, me: number): Mon | null {
    const pf = this.planFocus(g, me);
    if (pf) return pf;
    let best: Mon | null = null, bv = 0;
    const p = g.p(me);
    // le evoluzioni disponibili (in mano o nel mazzo) contano come attacchi futuri del Pokémon
    const evoDefs = (name: string) => {
      const seen = new Set<string>(), out: CardDef[] = [];
      for (const c of [...p.hand, ...p.deck]) { const d = g.def(c); if (d.evolvesFrom === name && !seen.has(d.id)) { seen.add(d.id); out.push(d); } }
      return out;
    };
    for (const m of g.inPlay(me)) {
      const forms: [CardDef, number][] = [[g.top(m), 1], ...evoDefs(g.top(m).name).map(d => [d, 0.85] as [CardDef, number])];
      for (const [def, w] of forms) {
        const planV = this.plan(g, me).get(def.name)?.value ?? 50;
        for (const a of def.attacks ?? []) {
          // il piano di mazzo pesa: l'attaccante principale dell'archetipo riceve le Energie prima degli altri
          const need = this.need(g, m.energies, [...a.cost]);
          const v = w * (atkDamage(a) / (1 + need) + planV / 3) + (m === p.active ? 5 : 0);
          if (v > bv) { bv = v; best = m; }
        }
      }
    }
    return best;
  }

  /** Quanto manca, in Energie, all'attacco più forte del Pokémon. */
  energyGap(g: G, m: Mon): number {
    const atks = g.top(m).attacks ?? [];
    if (!atks.length) return 0;
    const strongest = atks.reduce((a, b) => (atkDamage(b) >= atkDamage(a) ? b : a));
    return Math.max(0, attackCost(g, m, strongest).length - m.energies.length);
  }

  /** Premi presi e regalati usando un'Abilità, provata su una copia della partita. */
  abilityTrade(g: G, me: number, a: Action): { taken: number; given: number } {
    if (this.opts.fast) {
      // modalità veloce: solo il controllo più importante, l'Abilità che manda KO il proprio Pokémon
      const m = slot(g.p(me), (a as { target: number }).target);
      const n = g.top(m).abilities![(a as { index: number }).index].name;
      return n === "Cursed Blast" ? { taken: 0, given: g.top(m).prizes ?? 1 } : { taken: 0, given: 0 };
    }
    const copy = new G(structuredClone(g.s), g.reg);
    const mine = copy.p(me).prizes.length, theirs = copy.p(1 - me).prizes.length;
    try {
      const it = apply(copy, a);
      let r = it.next();
      for (let k = 0; !r.done && k < 50; k++) r = it.next(this.decide(copy, r.value));
    } catch (e) {
      if (e instanceof GameOver) return copy.s.winner === me ? { taken: 99, given: 0 } : { taken: 0, given: 99 };
      throw e;
    }
    return { taken: mine - copy.p(me).prizes.length, given: theirs - copy.p(1 - me).prizes.length };
  }

  /** Il Pokémon (attivo o in panchina) che usa Seek Inspiration, se c'è. */
  seekUser(g: G, me: number): Mon | null {
    return g.inPlay(me).find(m => (g.top(m).attacks ?? []).some(a => a.name === "Seek Inspiration")) ?? null;
  }

  /** Quanto vale avere questa carta in cima al mazzo per Seek Inspiration. */
  seekValue(g: G, me: number, c: number): number {
    const d = g.def(c), t = d.tags ?? [];
    if (d.kind !== "pokemon" || t.includes("ex") || t.includes("mega")) return 0;
    const o = g.p(1 - me);
    let best = 0;
    for (const a of d.attacks ?? []) {
      let v = atkDamage(a);
      if (a.name === "Destined Fight" && o.active) v = 120 * (g.top(o.active).prizes ?? 1);
      // Trifrost: 110 a tre Pokémon, rende di più sui Pokémon Base piccoli (Dreepy, la linea di Hide n' Sneak)
      if (a.name === "Trifrost") v = g.inPlay(1 - me).map(m => (g.hpLeft(m) <= 110 ? 150 * (g.top(m).prizes ?? 1) : 40)).sort((x, y) => y - x).slice(0, 3).reduce((s2, x) => s2 + x, 0);
      if (o.active && v >= g.hpLeft(o.active)) v += 100 * (g.top(o.active).prizes ?? 1);
      best = Math.max(best, v);
    }
    return best;
  }

  /**
   * Un'Abilità che non pesca serve se, provata su una copia, migliora qualcosa: più Energie in campo,
   * un attacco migliore, più danni all'avversario, più carte in mano o in panchina. Se peggiora l'attacco, no.
   */
  abilityHelps(g: G, me: number, a: Action): boolean {
    if (this.opts.fast) return true;
    const snap = (x: G) => ({
      energy: x.inPlay(me).reduce((s, m) => s + m.energies.length, 0),
      atk: this.quickBest(x, me),
      opp: x.inPlay(1 - me).reduce((s, m) => s + m.damage, 0) + 1000 * (6 - x.p(me).prizes.length),
      cards: x.p(me).hand.length + x.p(me).bench.length,
    });
    const before = snap(g);
    const copy = new G(structuredClone(g.s), g.reg);
    try {
      const it = apply(copy, a);
      let r = it.next();
      for (let k = 0; !r.done && k < 50; k++) r = it.next(this.decide(copy, r.value));
    } catch (e) {
      if (e instanceof GameOver) return copy.s.winner === me;
      throw e;
    }
    const after = snap(copy);
    if (after.atk < before.atk - 20) return false;
    return after.energy > before.energy || after.atk > before.atk || after.opp > before.opp || after.cards > before.cards;
  }

  private copyDepth = 0;
  /**
   * Valore di un attacco copiato, provato su una copia della partita: premi presi (KO), danni fatti,
   * meno quello che costa (Energie scartate, attacco bloccato il turno dopo).
   */
  copyValue(g: G, me: number, card: number, i: number): number {
    const atk = g.def(card).attacks![i];
    if (this.copyDepth > 0) return atkDamage(atk);
    this.copyDepth++;
    try {
      const copy = new G(structuredClone(g.s), g.reg);
      const att = copy.p(me).active!, o = copy.p(1 - me);
      const energies = att.energies.length;
      let base = atk.damage;
      if (atk.effect) {
        const it = atk.effect(copy, me);
        let r = it.next();
        for (let k = 0; !r.done && k < 50; k++) r = it.next(this.decide(copy, r.value));
        if (r.done && typeof r.value === "number") base = r.value;
      }
      if (o.active && base > 0) applyDamage(copy, att, o.active, base, true);
      let v = 0;
      for (const m of copy.inPlay(1 - me)) {
        const before = [g.p(1 - me).active, ...g.p(1 - me).bench].find(x => x && x.stack[0] === m.stack[0]);
        const dealt = m.damage - (before?.damage ?? 0);
        if (dealt <= 0) continue;
        v += copy.hpLeft(m) <= 0 ? 1000 * (copy.top(m).prizes ?? 1) : dealt;
      }
      v -= 25 * (energies - att.energies.length);
      if ((att.used.no_attack ?? 0) > g.s.turn) v -= 60;
      return v;
    } catch (e) {
      if (e instanceof GameOver) return 1e6;
      return atkDamage(atk);
    } finally {
      this.copyDepth--;
    }
  }

  /** Miglior danno stimato che l'attivo può fare adesso (senza provare gli attacchi). */
  quickBest(g: G, me: number): number {
    const a = g.p(me).active;
    if (!a) return 0;
    let best = 0;
    for (const atk of g.top(a).attacks ?? []) if (canPay(g, a.energies, attackCost(g, a, atk))) best = Math.max(best, atkDamage(atk));
    return best;
  }

  /** Vero se in mano manca un pezzo che serve in questo turno: l'Energia per l'attaccante o un Supporter. */
  missingPiece(g: G, me: number): boolean {
    const p = g.p(me), f = this.focus(g, me);
    if (f && !p.energyAttached && this.energyGap(g, f) > 0 && !p.hand.some(c => g.def(c).kind === "energy")) return true;
    if (!p.supporterPlayed && !p.hand.some(c => g.def(c).sub === "supporter")) return true;
    return false;
  }

  private drawAbility = new Map<string, boolean>();
  /** Vero se l'Abilità serve soprattutto a pescare (provata una volta su una copia della partita). */
  isDrawAbility(g: G, me: number, a: Action): boolean {
    const m = slot(g.p(me), (a as { target: number }).target);
    const name = g.top(m).abilities![(a as { index: number }).index].name;
    const known = this.drawAbility.get(name);
    if (known !== undefined) return known;
    const copy = new G(structuredClone(g.s), g.reg);
    const before = { hand: copy.p(me).hand.length, deck: copy.p(me).deck.length };
    let draw = false;
    try {
      const it = apply(copy, a);
      let r = it.next();
      for (let k = 0; !r.done && k < 50; k++) r = it.next(this.decide(copy, r.value));
      draw = copy.p(me).deck.length < before.deck && copy.p(me).hand.length > before.hand;
    } catch { draw = false; }
    this.drawAbility.set(name, draw);
    return draw;
  }

  /** Quanto conviene tenere una carta invece di scartarla: le carte "carburante" (es. Hide 'n' Sneak) si scartano volentieri. */
  keep(g: G, me: number, c: number): number {
    const fuel = this.plan(g, me).fuel;
    const isFuel = !!fuel && (g.def(c).tags ?? []).includes(fuel);
    // una copia del carburante può servire in campo se non ce n'è nessuna; le altre vanno negli scarti
    const recycled = !!this.plan(g, me).energyRecursion && g.def(c).sub === "basic_energy";
    return this.want(g, me, c) - (isFuel ? 70 : 0) - (recycled ? 30 : 0);
  }

  /** Quanto vale avere in mano questa carta adesso (più alto = più utile). */
  want(g: G, me: number, c: number): number {
    const d = g.def(c), p = g.p(me);
    const inPlay = g.inPlay(me);
    const inHand = p.hand.filter(x => g.def(x).name === d.name).length;
    if (d.kind === "pokemon") {
      if (d.evolvesFrom && inPlay.some(m => g.top(m).name === d.evolvesFrom)) return 90 - 20 * inHand;
      // con Slowking in campo: un bersaglio di Seek Inspiration in mano, da mettere in cima con Academy at Night
      if (this.seekUser(g, me) && this.plan(g, me).get(d.name)?.max === 0) {
        const sv = this.seekValue(g, me, c);
        const others = p.hand.filter(x => x !== c && this.seekValue(g, me, x) > 0).length;
        if (sv > 0) return (others ? 30 : 75) + Math.min(20, sv / 20);
      }
      if (d.sub === "basic") return this.benchValue(g, me, c) - 15 * inHand;
      return (this.plan(g, me).get(d.name)?.value ?? 50) * 0.6 - 15 * inHand;
    }
    if (d.kind === "energy") return inPlay.some(m => this.energyGap(g, m) > 0) ? 55 - 20 * inHand : 15;
    const hoard = this.plan(g, me).hoard;
    if (d.sub === "supporter" && hoard && d.name.startsWith(hoard)) return 72;
    if (d.sub === "supporter") return p.hand.some(x => g.def(x).sub === "supporter") ? 25 : 65;
    return 35 - 10 * inHand;
  }

  // --- decisioni ----------------------------------------------------------

  /** Ogni risposta rispetta sempre i limiti della decisione (min e max), qualunque regola l'abbia prodotta. */
  decide(g: G, d: Decision): number[] {
    const raw = this.decideRaw(g, d);
    const out = [...new Set(raw.filter(i => Number.isInteger(i) && i >= 0 && i < d.options.length))].slice(0, d.max);
    for (let i = 0; out.length < d.min && i < d.options.length; i++) if (!out.includes(i)) out.push(i);
    return out;
  }

  decideRaw(g: G, d: Decision): number[] {
    const me = d.player;
    const idx = d.options.map((_, i) => i);
    const top = (score: (o: unknown) => number, n: number) =>
      idx.sort((a, b) => score(d.options[b]) - score(d.options[a])).slice(0, n);

    if (d.kind === "action") return [this.action(g, me, d.options as Action[])];
    if (d.kind === "mulligan_draw") return [d.options.length - 1];
    if (d.kind === "setup_active") {
      // in attivo: il preferito dal piano di mazzo, altrimenti il Pokémon meno prezioso e più facile da ritirare
      const openers = this.plan(g, me).openers;
      if (openers) {
        const o = openers.map(n => d.options.findIndex(c => g.def(c as number).name === n)).find(i => i >= 0);
        if (o !== undefined) return [o];
      }
      return top(c => -(g.def(c as number).retreat ?? 0) * 10 - ((g.def(c as number).tags ?? []).includes("ex") ? 50 : 0)
        - (this.plan(g, me).get(g.def(c as number).name)?.role === "line" ? 25 : 0), 1);
    }
    if (d.kind === "setup_bench") {
      const ranked = top(c => this.benchValue(g, me, c as number), d.max);
      return ranked.filter(i => this.benchValue(g, me, d.options[i] as number) >= 50).slice(0, this.opts.benchMax ?? 3);
    }
    if (d.kind === "promote" || d.kind === "switch") {
      const p = g.p(me);
      // le opzioni possono essere indici della panchina o direttamente i Pokémon
      return top(t => { const m = typeof t === "number" ? slot(p, t) : (t as Mon); return this.bestDamage(g, m).dmg * 2 + g.hpLeft(m) / 10 - this.energyGap(g, m) * 30; }, 1);
    }
    if (d.kind === "gust") {
      const o = g.p(1 - me), mine = g.p(me).active;
      const dmg = mine ? this.bestDamage(g, mine).dmg : 0;
      return top(t => { const m = typeof t === "number" ? slot(o, t) : (t as Mon); return (g.hpLeft(m) <= dmg ? 100 * (g.top(m).prizes ?? 1) : 0) - g.hpLeft(m) / 10; }, 1);
    }
    if (d.kind === "counters") {
      // un segnalino alla volta: prima dove completa un KO presto (pochi segnalini mancanti, più premi)
      return top(m => {
        // se non si chiude un KO: i Pokémon da 2 premi "in range" del prossimo attacco (piano di Dragapult: sempre in range i due premi)
        const hp = g.hpLeft(m as Mon), left = Math.ceil(hp / 10), prizes = g.top(m as Mon).prizes ?? 1;
        if (left <= 6) return 1000 * prizes - 100 * left;
        const nextHit = 200;
        return 100 * prizes + (prizes >= 2 && hp > nextHit && hp - 60 <= nextHit ? 300 : 0) - left;
      }, d.max);
    }
    if (d.kind === "spiritual_end") {
      return top(m => (m as Mon).damage * (g.top(m as Mon).prizes ?? 1) - g.hpLeft(m as Mon) / 10, d.max);
    }
    if (d.kind === "hammer") {
      // l'Energia dell'avversario più pericoloso: l'attivo, o chi ha più Energie e il danno più alto
      const o = g.p(1 - me);
      return top(x => {
        const m = ((x as { m?: Mon }).m ?? x) as Mon; // le opzioni sono Pokémon o coppie { Pokémon, Energia }
        return (m === o.active ? 50 : 0) + 20 * (m.energies?.length ?? 0) + (m.stack ? this.bestDamage(g, m).dmg / 10 : 0);
      }, 1);
    }
    if (d.kind === "heal_target") return top(m => (m as Mon).damage * (g.top(m as Mon).prizes ?? 1), 1);
    if (d.kind === "attach_target" || d.kind === "attach_discard_target" || d.kind === "patch_target" || d.kind === "attach_discard_target_bench") {
      // le Energie che arrivano da effetti vanno all'attaccante principale, poi a chi ne ha più bisogno
      const f = this.focus(g, me);
      return top(m => (m === f ? 1000 : 0) + this.energyGap(g, m as Mon) * 10 + (g.top(m as Mon).attacks?.length ?? 0), d.max);
    }
    if (d.kind === "move_from") {
      // da chi si tolgono Energie: mai dall'attaccante principale se c'è altro, prima dai Pokémon che non attaccheranno
      const f = this.focus(g, me);
      return top(m => (m === f ? -1000 : 0) + 10 * (m as Mon).energies.length - this.bestDamage(g, m as Mon).dmg / 10, 1);
    }
    if (d.kind === "crispin" || d.kind === "crispin_attach") {
      // le Energie del tipo che serve all'attaccante principale
      const f = this.focus(g, me);
      return top(c => (f ? this.energyHelp(g, f, c as number) : 0) + this.want(g, me, c as number) / 10, d.max);
    }
    if (d.kind === "snipe") {
      return top(m => { const hp = g.hpLeft(m as Mon), pr = g.top(m as Mon).prizes ?? 1; return hp <= 120 ? 1000 * pr - hp : 10 * pr - hp / 10; }, d.max);
    }
    if (d.kind.endsWith("_target")) return top(m => this.energyGap(g, m as Mon) * 10 + (g.top(m as Mon).attacks?.length ?? 0), 1);
    if (d.kind === "academy") {
      // Academy at Night: in cima al mazzo la carta che Seek Inspiration sfrutta meglio, altrimenti la meno utile
      return top(c => (this.seekUser(g, me) ? this.seekValue(g, me, c as number) : 0) - this.want(g, me, c as number) / 10, 1);
    }
    if (d.kind === "ciphermaniac") {
      // Ciphermaniac: in cima il miglior bersaglio di Seek Inspiration, poi la carta più utile
      const su = this.seekUser(g, me);
      const ranked = top(c => (su ? this.seekValue(g, me, c as number) : 0) + this.want(g, me, c as number), d.options.length);
      return ranked.slice(0, d.max);
    }
    if (d.kind === "copy_attack") {
      // attacco copiato (Night Joker, Seek Inspiration): quello che rende di più in questa posizione,
      // provato su una copia (es. Darmanitan per due Base, Zekrom o Reshiram per i Pokémon grandi)
      return top(o => {
        if (Array.isArray(o)) { const [card, i] = o as [number, number]; return this.copyValue(g, me, card, i); }
        if (o && typeof o === "object" && "damage" in o) return atkDamage(o as Attack);
        return 0;
      }, 1);
    }
    if (d.kind === "gwynn") return top(c => -this.keep(g, me, c as number), d.max);
    if (d.kind === "mill" || d.kind === "blender") {
      // scarta prima le carte che contano negli scarti (Hide 'n' Sneak), poi le meno utili
      return top(c => -this.keep(g, me, c as number), d.max);
    }
    if (d.kind === "naveen") return top(c => -this.keep(g, me, c as number), Math.max(d.min, g.p(me).hand.length - 3));
    if (DISCARD.has(d.kind)) return top(c => -this.keep(g, me, c as number), d.min);
    if (SEARCH.has(d.kind) || typeof d.options[0] === "number") {
      return top(c => this.want(g, me, c as number), d.max);
    }
    return idx.slice(0, d.max);
  }

  action(g: G, me: number, acts: Action[]): number {
    const p = g.p(me), o = g.p(1 - me);
    const benchMax = this.plan(g, me).fillBench ? 5 : this.opts.benchMax ?? 4;
    const score = (a: Action): number => {
      switch (a.kind) {
        case "ability": {
          // Abilità che costano premi (es. Cursed Blast manda KO il proprio Pokémon): solo se rendono almeno altrettanto
          const t = this.abilityTrade(g, me, a);
          if (t.given > 0 && t.taken < t.given) return -1;
          // le Abilità che pescano si usano con giudizio: con la mano piena o il mazzo corto si perde a mazzo finito
          if (!this.isDrawAbility(g, me, a)) return this.abilityHelps(g, me, a) ? 70 : -1;
          if (p.deck.length <= 8) return -1;
          if (p.hand.length >= 6) return -1;
          // una sola Abilità di pescata per turno, salvo mano quasi vuota (si perdeva spesso a mazzo finito)
          // altre pescate nello stesso turno solo se manca qualcosa che serve adesso ("quelle necessarie")
          const usedThisTurn = g.inPlay(me).reduce((n, m) => n + (g.top(m).abilities ?? []).filter(ab => m.used[ab.name] === g.s.turn).length, 0);
          if (usedThisTurn >= 1 && p.hand.length > 2 && !this.missingPiece(g, me)) return -1;
          return p.deck.length > 15 ? (p.hand.length <= 4 ? 70 : 30) : p.hand.length <= 3 ? 30 : -1;
        }
        case "evolve": return 80;
        case "bench": {
          // lascia un posto libero per le linee evolutive, metti prima ciò che serve al piano
          const v = this.benchValue(g, me, a.card);
          // mai senza panchina (se l'attivo va KO si perde la partita), e almeno due contro chi colpisce la panchina
          if (p.bench.length === 0) return Math.max(50, 25 + v / 2);
          if (p.bench.length === 1) return Math.max(40, 25 + v / 2);
          if (p.bench.length >= benchMax) return -1;
          if (p.bench.length >= benchMax - 1 && v < 60) return -1;
          return v >= 30 ? 25 + v / 2 : -1;
        }
        case "stadium": {
          // Academy at Night con Slowking attivo: solo se mette in cima un bersaglio migliore di quello che c'è già
          if (g.s.stadium !== null && g.name(g.s.stadium) === "Academy at Night") {
            const su = this.seekUser(g, me);
            if (!su || su !== p.active || !p.hand.length) return -1;
            const now = p.deck.length ? this.seekValue(g, me, p.deck[p.deck.length - 1]) : 0;
            const best = Math.max(...p.hand.map(c => this.seekValue(g, me, c)));
            return best > now + 40 ? 45 : -1;
          }
          // Stadi tipo Prism Tower (scarta 2, pesca 1): solo se in mano ci sono due carte inutili
          const junk = p.hand.map(c => this.keep(g, me, c)).sort((x, y) => x - y);
          return p.hand.length >= 4 && junk.length >= 2 && junk[1] < 25 ? 20 : -1;
        }
        case "attach": {
          const m = slot(p, a.target);
          // Ignition Energy si scarta a fine turno: solo sull'attivo, se gli fa attaccare adesso
          if (g.def(a.card).name === "Ignition Energy") {
            if (a.target !== -1) return -1;
            // su un'evoluzione vale {C}{C}{C}, su un Base {C}
            const extra = g.top(m).sub === "basic" ? 1 : 3;
            const have = m.energies.flatMap(e => provided(g, e)).length;
            const ok = (g.top(m).attacks ?? []).some(x => {
              const cost = attackCost(g, m, x);
              return atkDamage(x) > 0 && this.need(g, m.energies, cost) > 0 && this.need(g, m.energies, cost.filter(c => c !== "C")) === 0 && cost.length <= have + extra;
            });
            return ok ? 60 : -1;
          }
          // piano di mazzo: l'Energia va all'attaccante principale (o a chi lo diventerà) finché non è pronto
          const pf = this.planFocus(g, me);
          if (pf) {
            const cost = this.focusCost(g, me, pf)!;
            const helpsFocus = this.need(g, [...pf.energies, a.card], cost) < this.need(g, pf.energies, cost);
            if (m === pf && helpsFocus) return 70;
            if (helpsFocus) return -1;
          } else if (this.plan(g, me).focus) {
            // l'attaccante principale non è ancora in campo: l'Energia si attacca per ultima, magari arriva nel turno
            const help = this.energyHelp(g, m, a.card);
            return help > 0 ? 3 : -1;
          }
          const help = this.energyHelp(g, m, a.card);
          if (help <= 0) return -1;
          return (a.target === -1 ? 30 : 22) + help + (m === this.focus(g, me) ? 25 : 0);
        }
        case "trainer": return this.trainerScore(g, me, g.def(a.card), a.card);
        case "retreat": {
          if (!o.active || (g.s.turn === 1 && g.s.first === me)) return -1;
          if (this.opts.fast) {
            const t = p.bench[a.target];
            return this.bestDamage(g, t).dmg > Math.max(0, this.bestDamage(g, p.active!).dmg) + 30 && retreatCost(g, p.active!) <= 2 ? 30 : -1;
          }
          const now = this.bestAttackValue(g, me);
          const then = this.valueIfActive(g, me, a.target);
          // conviene se il Pokémon in panchina fa molto di più, tenendo conto delle Energie scartate
          return then > now + 30 + 20 * retreatCost(g, p.active!) ? 30 : -1;
        }
        default: return -1;
      }
    };
    let best = -1, bestScore = 0;
    acts.forEach((a, i) => { const s = score(a); if (s > bestScore) { best = i; bestScore = s; } });
    if (best >= 0) return best;
    const attacks = acts.map((a, i) => [a, i] as const).filter(([a]) => a.kind === "attack");
    if (attacks.length && o.active) {
      let bi = attacks[0][1], bv = -Infinity;
      for (const [a, i] of attacks) {
        const v = this.opts.fast
          ? this.quickAttackValue(g, me, (a as { index: number }).index, (a as { from?: number }).from)
          : this.attackValue(g, me, (a as { index: number }).index, (a as { from?: number }).from);
        if (v > bv) { bv = v; bi = i; }
      }
      return bi;
    }
    return acts.findIndex(a => a.kind === "end");
  }

  /**
   * Valore di un attacco provato su una copia della partita: danni e segnalini
   * fatti all'avversario, premi presi, vittoria. Così "30+" o Matcha Spin
   * vengono valutati per quello che fanno davvero in questa posizione.
   */
  attackValue(g: G, me: number, index: number, from?: number): number {
    const copy = new G(structuredClone(g.s), g.reg);
    const before = copy.inPlay(1 - me).reduce((s, m) => s + m.damage, 0);
    const prizes = copy.p(me).prizes.length;
    try {
      const it = attack(copy, index, from);
      let r = it.next();
      for (let guard = 0; !r.done && guard < 200; guard++) r = it.next(this.decide(copy, r.value));
    } catch (e) {
      if (e instanceof GameOver) return copy.s.winner === me ? 1e6 : -1e6;
      throw e;
    }
    const after = copy.inPlay(1 - me).reduce((s, m) => s + m.damage, 0);
    return (after - before) + 1000 * (prizes - copy.p(me).prizes.length);
  }

  bestAttackValue(g: G, me: number): number {
    const a = g.p(me).active;
    if (!a || a.used.no_attack === g.s.turn) return 0;
    let best = 0;
    (g.top(a).attacks ?? []).forEach((atk, i) => {
      if (canPay(g, a.energies, attackCost(g, a, atk))) best = Math.max(best, this.attackValue(g, me, i));
    });
    return best;
  }

  /** Valore del miglior attacco se il Pokémon in panchina `t` fosse l'attivo (provato su una copia). */
  valueIfActive(g: G, me: number, t: number): number {
    const copy = new G(structuredClone(g.s), g.reg);
    const p = copy.p(me);
    const nw = p.bench.splice(t, 1)[0];
    p.bench.push(p.active!);
    p.active = nw;
    return this.bestAttackValue(copy, me);
  }

  trainerScore(g: G, me: number, d: CardDef, card: number): number {
    const p = g.p(me), o = g.p(1 - me);
    if (d.name === "Boss's Orders" || d.name === "Prime Catcher" || d.name === "Pokémon Catcher") {
      const dmg = p.active ? this.bestDamage(g, p.active).dmg : 0;
      return o.bench.some(m => g.hpLeft(m) <= dmg) && !(o.active && g.hpLeft(o.active) <= dmg && (g.top(o.active).prizes ?? 1) >= 2) ? 45 : -1;
    }
    if (d.name === "Switch" || d.name === "Surfer" || d.name === "Escape Rope") {
      // solo se chi entra può attaccare in questo turno (anche dopo l'Energia del turno) e meglio dell'attivo
      if (!p.active || !o.active || !p.bench.length || (g.s.turn === 1 && g.s.first === me)) return -1;
      const ready = (m: Mon) => {
        const best = (g.top(m).attacks ?? []).filter(x => atkDamage(x) > 0);
        return Math.max(0, ...best.map(x => {
          const need = this.need(g, m.energies, attackCost(g, m, x));
          const canFix = need === 1 && !p.energyAttached && p.hand.some(c => g.def(c).kind === "energy" && this.need(g, [...m.energies, c], attackCost(g, m, x)) === 0);
          return need === 0 || canFix ? atkDamage(x) : 0;
        }));
      };
      const now = ready(p.active), then = Math.max(...p.bench.map(ready));
      if (then > now + 30) return 40;
      return d.name === "Surfer" && p.hand.length <= 2 && then >= now ? 30 : -1;
    }
    if (d.name === "Team Rocket's Giovanni") {
      // come Boss's Orders, ma entra anche un nostro Pokémon dalla panchina: solo se quello manda KO il bersaglio
      const dmg = Math.max(0, ...p.bench.map(m => this.bestDamage(g, m).dmg));
      return o.bench.some(m => g.hpLeft(m) <= dmg) ? 45 : -1;
    }
    if (d.name === "Energy Switch") {
      // solo se porta un'Energia all'attaccante principale da un Pokémon che non ne ha bisogno
      const f = this.focus(g, me);
      if (!f || this.energyGap(g, f) <= 0) return -1;
      return g.inPlay(me).some(m => m !== f && m.energies.length > 0) ? 45 : -1;
    }
    if (d.name === "Unfair Stamp") {
      // appena può creare un forte svantaggio: l'avversario scende a 2 carte
      return o.hand.length >= 5 || (o.hand.length >= 3 && p.hand.length <= 3) ? 60 : -1;
    }
    if (d.sub === "supporter") {
      // piano con Supporter da accumulare (Honchkrow): se ne gioca uno solo se in mano ne restano altri o la mano è corta
      const hoard = this.plan(g, me).hoard;
      if (hoard && d.name.startsWith(hoard)) {
        const kept = p.hand.filter(c => c !== card && g.def(c).name.startsWith(hoard) && g.def(c).sub === "supporter").length;
        if (d.name === "Team Rocket's Archer") return -1 + (p.hand.length <= 2 ? 31 : 0);
        if (p.hand.length > 4 && kept < 2) return -1;
      }
      // i Supporter che rimescolano la mano (Lillie, Judge) non si giocano se in mano c'è un pezzo chiave per il prossimo turno
      const SHUFFLE = ["Lillie's Determination", "Judge", "Team Rocket's Archer"];
      // (un'evoluzione per un Pokémon in campo vale 70 con sé stessa in mano)
      if (SHUFFLE.includes(d.name) && p.hand.length >= 3 && p.hand.some(c => c !== card && this.want(g, me, c) >= 70)) return 12;
      // Gladion's Final Battle: si gioca quando è l'ultima carta in mano, prima dell'attacco
      if (d.name === "Gladion's Final Battle") return p.active && this.bestDamage(g, p.active).dmg > 0 ? 60 : 30;
      if (d.name === "Black Belt's Training") return o.active && (g.top(o.active).tags ?? []).includes("ex") ? 10 : -1;
      if (p.deck.length < 10 && p.hand.length >= 4) return -1;
      return p.hand.length <= 5 ? 35 : 20;
    }
    if (d.sub === "stadium") {
      const want = this.plan(g, me).stadium;
      if (want) return d.name === want ? (g.s.stadium !== null && g.name(g.s.stadium) === want ? -1 : 75) : -1;
      return 15;
    }
    if (d.sub === "tool") return 25;
    void card;
    return 40;
  }
}
