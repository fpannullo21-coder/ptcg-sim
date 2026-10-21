/** Partita di prova tra i due mazzi di test, con registro e velocità. */
import { playGame } from "../engine/game.js";
import { GreedyAgent } from "../ai/agents.js";
import { fireDeck, waterDeck } from "../cards/testset.js";

const seed = Number(process.argv[2] ?? 1);
const m = playGame([fireDeck(), waterDeck()], [new GreedyAgent(), new GreedyAgent()], seed, { verbose: true });
console.log(m.g.log.join("\n"));

const N = 5000, w = [0, 0, 0];
const t0 = performance.now();
for (let s = 1; s <= N; s++) {
  const r = playGame([fireDeck(), waterDeck()], [new GreedyAgent(), new GreedyAgent()], s).g.s.winner!;
  w[r === -1 ? 2 : r]++;
}
const sec = (performance.now() - t0) / 1000;
console.log(`\n${N} partite in ${sec.toFixed(1)} s (${Math.round(N / sec)} al secondo): Fuoco ${w[0]}, Acqua ${w[1]}, non finite ${w[2]}`);
