/**
 * Posizioni per l'Allenatore del sito: da partite simulate prende i momenti in cui la scelta conta
 * e calcola con quale percentuale vince ogni mossa candidata.
 *
 * Per ogni mossa: N continuazioni fino alla fine della partita, giocate dal giocatore base per tutti
 * e due, con le carte sconosciute rimescolate a ogni continuazione (determinizzazione, come il
 * giocatore Monte Carlo). Si tengono le posizioni dove la mossa migliore vince almeno 8 punti più
 * della peggiore.
 *
 *   npx tsx src/tools/trainer-positions.ts --list hide-n-sneak/lista-per-danzica --per 3 --rollouts 60
 *     -> web/public/data/trainer.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BasicAgent } from "../ai/basic.js";
import { MonteCarloAgent } from "../ai/montecarlo.js";
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";
import { apply, describe, G, GameOver, Match, playOn, slot } from "../engine/game.js";
import type { Action, Decision, Gen, Mon } from "../engine/types.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LIST = arg("--list", "hide-n-sneak/lista-per-danzica");
const PER = Number(arg("--per", "3"));
const ROLLOUTS = Number(arg("--rollouts", "60"));
const TOP = Number(arg("--top", "4"));

const reg = registry();
const decks = loadDecks(reg.db);
const report = JSON.parse(readFileSync("reports/meta-matrix-validazione-100.json", "utf8"));
const opponents: { name: string; deck: string }[] = report.meta.slice(0, TOP);
const get = (p: string) => reg.deck(decks.find(d => d.path === p)!);

const policy = new BasicAgent();
const mc = new MonteCarloAgent();

function drive(g: G, it: Gen<unknown>): unknown {
  let r = it.next();
  for (let k = 0; !r.done && k < 50000; k++) r = it.next(policy.decide(g, r.value as Decision));
  return r.value;
}

/** Percentuale di vittoria del giocatore `me` dopo l'azione `a`, su continuazioni fino alla fine. */
function winRate(g: G, me: number, a: Action, n: number, seed: number): number {
  let w = 0;
  for (let k = 0; k < n; k++) {
    const copy = mc.determinize(g, me, seed + k * 7919);
    try {
      const ended = drive(copy, apply(copy, a)) as boolean;
      drive(copy, playOn(copy, ended, copy.s.turn + 200));
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    if (copy.s.winner === me) w += 1;
    else if (copy.s.winner === -1) w += 0.5;
  }
  return w / n;
}

const PRIORITY: Record<string, number> = { attack: 0, trainer: 1, retreat: 2, ability: 3, evolve: 4, attach: 5, bench: 6, stadium: 7, end: 8 };

/** Etichetta leggibile: i posti in panchina diventano nomi di Pokémon. */
function label(g: G, me: number, a: Action): string {
  const p = g.p(me);
  const name = (t: number) => g.top(slot(p, t)).name;
  switch (a.kind) {
    case "attack": return `Attacca con ${g.top(p.active!).attacks![a.index].name}`;
    case "retreat": return `Ritirata, entra ${name(a.target)}`;
    case "attach": return `${g.name(a.card)} su ${name(a.target)}`;
    case "evolve": return `Evolvi ${name(a.target)} in ${g.name(a.card)}`;
    case "bench": return `Metti in panchina ${g.name(a.card)}`;
    case "trainer": return `Gioca ${g.name(a.card)}`;
    case "end": return "Passa il turno";
    default: return describe(g, a);
  }
}

const monView = (g: G, m: Mon) => ({
  name: g.top(m).name, hp: g.hpLeft(m), maxHp: g.top(m).hp ?? 0, type: g.top(m).type ?? "C",
  stage: g.top(m).sub === "basic" ? "Base" : g.top(m).sub === "stage1" ? "Fase 1" : g.top(m).sub === "stage2" ? "Fase 2" : "",
  weak: g.top(m).weakness ?? null, retreat: g.top(m).retreat ?? 0,
  energies: m.energies.map(e => g.def(e).provides ?? "C"),
  attacks: (g.top(m).attacks ?? []).map(x => ({ name: x.name, cost: x.cost, damage: x.damage })),
  tools: m.tools.map(t => g.name(t)),
});

function snapshot(g: G, me: number) {
  const side = (i: number) => {
    const p = g.p(i);
    return {
      active: p.active ? monView(g, p.active) : null,
      bench: p.bench.map(m => monView(g, m)),
      prizes: p.prizes.length, deck: p.deck.length, handCount: p.hand.length, discard: p.discard.length,
    };
  };
  return { turn: g.s.turn, me: side(me), opp: side(1 - me), hand: g.p(me).hand.map(c => g.name(c)),
    stadium: g.s.stadium !== null ? g.name(g.s.stadium) : null, energyAttached: g.p(me).energyAttached, supporterPlayed: g.p(me).supporterPlayed };
}

const positions: unknown[] = [];
let seed = 1, pick = 0;
for (const opp of opponents) {
  let found = 0;
  for (let game = 0; game < 40 && found < PER; game++) {
    seed++;
    const m = new Match([get(LIST), get(opp.deck)], seed, { first: game % 2 });
    let tried = 0;
    while (m.pending && found < PER) {
      const d = m.pending;
      const g = m.g;
      if (d.player === 0 && d.kind === "action" && g.s.turn >= 3 && tried < 3 && (pick++ % 4 === 0)) {
        const acts = d.options as Action[];
        const chosen = policy.decide(g, d)[0];
        const byLabel = new Map<string, number>();
        acts.forEach((a, i) => { const l = label(g, 0, a); if (!byLabel.has(l)) byLabel.set(l, i); });
        const cands = [...byLabel.entries()]
          .sort((x, y) => (x[1] === chosen ? -1 : y[1] === chosen ? 1 : (PRIORITY[acts[x[1]].kind] ?? 9) - (PRIORITY[acts[y[1]].kind] ?? 9)))
          .slice(0, 4);
        if (cands.length >= 3) {
          tried++;
          const opts = cands.map(([l, i]) => ({ label: l, wr: winRate(g, 0, acts[i], ROLLOUTS, seed * 1000) }));
          const best = Math.max(...opts.map(o => o.wr)), worst = Math.min(...opts.map(o => o.wr));
          if (best - worst >= 0.08) {
            found++;
            positions.push({ vs: opp.name, position: snapshot(g, 0), options: opts.map(o => ({ ...o, wr: Math.round(o.wr * 100) / 100 })), rollouts: ROLLOUTS });
            console.log(`${opp.name} T${g.s.turn}: ${opts.map(o => `${o.label} ${Math.round(o.wr * 100)}%`).join(" | ")}`);
          }
        }
      }
      m.answer(policy.decide(g, d));
    }
  }
}
mkdirSync("web/public/data", { recursive: true });
writeFileSync("web/public/data/trainer.json", JSON.stringify({ list: LIST, generated: new Date().toISOString(), rollouts: ROLLOUTS, positions }));
console.log(`${positions.length} posizioni -> web/public/data/trainer.json`);
