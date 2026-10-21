/**
 * Una partita con il registro completo, per controllare a occhio come gioca il motore.
 *   npx tsx src/tools/replay.ts hide-n-sneak/lista-per-danzica frankfurt-2026/07-dragapult-owyn-kamerman 7
 */
import { registry } from "../cards/index.js";
import { loadDecks } from "../data/decks.js";
import { playGame, slot } from "../engine/game.js";
import { BasicAgent } from "../ai/basic.js";

const [a = "hide-n-sneak/lista-per-danzica", b = "frankfurt-2026/07-dragapult-owyn-kamerman", seed = "1"] = process.argv.slice(2);
const reg = registry();
const decks = loadDecks(reg.db);
const get = (p: string) => reg.deck(decks.find(d => d.path === p) ?? (() => { throw new Error(`lista non trovata: ${p}`); })());
const m = playGame([get(a), get(b)], [new BasicAgent(), new BasicAgent()], Number(seed), { verbose: true });
console.log(m.g.log.join("\n"));
const s = m.g.s;
console.log(`\nVince: ${s.winner === 0 ? a : s.winner === 1 ? b : "nessuno"} (${s.why}), turno ${s.turn}`);
for (const i of [0, 1]) {
  const p = s.players[i];
  console.log(`P${i}: premi ${p.prizes.length}, mano ${p.hand.length}, mazzo ${p.deck.length}, scarti ${p.discard.length}, campo ${m.g.inPlay(i).map(x => `${m.g.top(x).name} ${m.g.hpLeft(x)}`).join(", ")}`);
}
void slot;
