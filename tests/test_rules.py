import random
from engine.state import Card, InPlay
from engine.rules import play_game, can_pay, legal_actions
from ai.agents import RandomAgent, GreedyAgent
from cards.basic_set import fire_deck, water_deck, FIRE_E, WATER_E, SALAMANDER, RANA


def test_deck_size():
    assert len(fire_deck()) == 60 and len(water_deck()) == 60 - 7 + 7


def test_can_pay():
    R, W = Card(FIRE_E), Card(WATER_E)
    assert can_pay([R], ("R",))
    assert not can_pay([W], ("R",))
    assert can_pay([R, W], ("R", "C"))
    assert not can_pay([R], ("R", "C"))


def test_random_games_terminate():
    for s in range(200):
        g = play_game([fire_deck(), water_deck()], [RandomAgent(s), RandomAgent(s + 1)], seed=s)
        assert g.winner in (-1, 0, 1)
        for p in g.players:
            total = len(p.deck) + len(p.hand) + len(p.prizes) + len(p.discard) \
                + sum(len(m.all_cards()) for m in p.in_play())
            assert total == 60


def test_greedy_games_end_with_winner():
    wins = [0, 0, 0]
    for s in range(300):
        g = play_game([fire_deck(), water_deck()], [GreedyAgent(), GreedyAgent()], seed=s)
        wins[g.winner] += 1
    assert wins[-1] < 30          # quasi tutte finiscono
    assert wins[0] > 0 and wins[1] > 0


def test_weakness():
    # Rana (debole a L) contro Salamandra: Getto di Rana fa 20 normale; Salamandra debole a W -> 40
    g = play_game([fire_deck(), water_deck()], [GreedyAgent(), GreedyAgent()], seed=1)
    from engine.rules import apply_damage
    a, t = InPlay([Card(RANA)]), InPlay([Card(SALAMANDER)])
    assert apply_damage(g, a, t, 20) == 40


def test_first_player_cannot_attack_turn1():
    g = play_game([fire_deck(), water_deck()], [GreedyAgent(), GreedyAgent()], seed=3, verbose=True)
    first_turn = [l for l in g.log if l.startswith("T1 ")]
    assert not any("attack" in l for l in first_turn)
