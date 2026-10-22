/**
 * Diagnosi di come il simulatore gioca un mazzo: statistiche su N partite contro un avversario.
 * Serve a trovare gli errori sistematici senza leggere i registri uno per uno.
 *
 *   npx tsx src/tools/diagnose.ts baltimore-2026/04-slowking-mark-dreitzler brisbane-2026/01-dragapult-edmund-khoo 40 [agente]
 */
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";
import { playGame } from "../engine/game.js";
import { makeAgent } from "./matrix.js";

const [a, b, n = "40", agent = "basic"] = process.argv.slice(2);
const reg = registry();
const decks = loadDecks(reg.db);
const get = (p: string) => reg.deck(decks.find(d => d.path === p) ?? (() => { throw new Error(`lista non trovata: ${p}`); })());
const N = Number(n);
const stats = {
  wins: 0, why: new Map<string, number>(), firstAttack: [] as number[], attacks: new Map<string, number>(),
  plays: new Map<string, number>(), abilities: new Map<string, number>(), evolvedBy6: 0, turns: [] as number[],
  prizesTaken: [] as number[], noAttackTurns: 0, myTurns: 0,
};
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
for (let s = 1; s <= N; s++) {
  const m = playGame([get(a), get(b)], [makeAgent(agent, s), makeAgent(agent, s + 99)], s, { verbose: true, first: s % 2 });
  const log = m.g.log.filter(l => / P0: /.test(l));
  if (m.g.s.winner === 0) stats.wins++;
  inc(stats.why, `${m.g.s.winner === 0 ? "vinta" : m.g.s.winner === 1 ? "persa" : "pari"}: ${m.g.s.why}`);
  const first = log.find(l => l.includes("attacca con"));
  stats.firstAttack.push(first ? Number(first.match(/^T(\d+)/)![1]) : 99);
  const turns = new Set(log.map(l => l.match(/^T(\d+)/)![1]));
  const attacked = new Set(log.filter(l => l.includes("attacca con")).map(l => l.match(/^T(\d+)/)![1]));
  stats.myTurns += turns.size;
  stats.noAttackTurns += [...turns].filter(t => !attacked.has(t) && Number(t) > 2).length;
  for (const l of log) {
    const at = l.match(/attacca con (.+)$/); if (at) inc(stats.attacks, at[1]);
    const pl = l.match(/gioca ([^@]+?)( su .*)?$/); if (pl) inc(stats.plays, pl[1]);
    const ab = l.match(/Abilità (.+) \(/); if (ab) inc(stats.abilities, ab[1]);
  }
  if (log.some(l => l.includes("evolve") && Number(l.match(/^T(\d+)/)![1]) <= 6)) stats.evolvedBy6++;
  stats.turns.push(m.g.s.turn);
  stats.prizesTaken.push(6 - m.g.s.players[0].prizes.length);
}
const avg = (x: number[]) => (x.reduce((s, v) => s + v, 0) / x.length).toFixed(1);
const top = (m: Map<string, number>, k = 10) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([n, c]) => `${n} ${(c / N).toFixed(1)}`).join(", ");
console.log(`${a} contro ${b}, ${N} partite, giocatore ${agent}`);
console.log(`vittorie ${stats.wins}/${N} (${((100 * stats.wins) / N).toFixed(0)}%) · come finisce: ${[...stats.why].map(([k, v]) => `${k} ${v}`).join("; ")}`);
console.log(`primo attacco al turno ${avg(stats.firstAttack)} · evoluzione entro il turno 6: ${stats.evolvedBy6}/${N} · turni senza attacco (dal 3°): ${((100 * stats.noAttackTurns) / stats.myTurns).toFixed(0)}%`);
console.log(`premi presi in media ${avg(stats.prizesTaken)} · durata ${avg(stats.turns)} turni`);
console.log(`attacchi per partita: ${top(stats.attacks)}`);
console.log(`carte giocate per partita: ${top(stats.plays, 14)}`);
console.log(`Abilità per partita: ${top(stats.abilities)}`);
