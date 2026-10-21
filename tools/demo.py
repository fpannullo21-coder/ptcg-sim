"""Partita di prova tra due mazzi di test, con il registro delle azioni."""
import sys
from engine.rules import play_game
from ai.agents import GreedyAgent
from cards.basic_set import fire_deck, water_deck

if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    g = play_game([fire_deck(), water_deck()], [GreedyAgent(), GreedyAgent()], seed=seed, verbose=True)
    print("\n".join(g.log))
    w = [0, 0, 0]
    for s in range(1000):
        w[play_game([fire_deck(), water_deck()], [GreedyAgent(), GreedyAgent()], seed=s).winner] += 1
    print(f"\n1000 partite: Fuoco {w[0]}, Acqua {w[1]}, non finite {w[-1]}")
