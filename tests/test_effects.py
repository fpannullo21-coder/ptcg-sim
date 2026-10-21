import random
from engine.state import Card, Game, PlayerState, InPlay, CardDef, Ability, POKEMON, BASIC
from engine.rules import legal_actions, step
from ai.agents import RandomAgent, GreedyAgent
from cards import effects as fx
from cards.basic_set import fire_deck, water_deck, SALAMANDER, RANA, FIRE_E


def make_game(seed=0):
    ps = [PlayerState(deck=[Card(d) for d in fire_deck()]),
          PlayerState(deck=[Card(d) for d in water_deck()])]
    g = Game(players=ps, agents=[GreedyAgent(), GreedyAgent()], rng=random.Random(seed))
    for p in ps:
        g.rng.shuffle(p.deck)
        b = next(c for c in p.deck if fx.is_basic_pokemon(c))
        p.deck.remove(b)
        p.active = InPlay([b])
        p.prizes = [p.deck.pop() for _ in range(6)]
    g.turn, g.current = 3, 0
    return g


def total(p):
    return len(p.deck) + len(p.hand) + len(p.prizes) + len(p.discard) + sum(len(m.all_cards()) for m in p.in_play())


def test_search_to_hand_and_bench():
    g = make_game()
    p = g.players[0]
    got = fx.search_deck(g, 0, fx.is_basic_pokemon, k=2, dest="bench")
    assert len(got) == 2 and len(p.bench) == 2
    got = fx.search_deck(g, 0, fx.is_basic_energy, k=3)
    assert len(got) == 3 and all(fx.is_energy(c) for c in p.hand)
    assert total(p) == 60


def test_mill_and_count():
    g = make_game()
    fx.mill(g, 0, 5, fx.is_energy)
    assert fx.count_discard(g, 0, fx.is_energy) == 5


def test_counters_and_ko():
    g = make_game()
    o = g.players[1]
    o.bench.append(InPlay([Card(RANA)]))
    fx.counters_each(g, 0, 4)
    assert all(m.damage == 40 for m in o.in_play())
    fx.place_counters(g, 0, 4)
    from engine.rules import check_ko
    check_ko(g)
    assert len(g.players[0].hand) == 1    # un premio preso


def test_gust_and_switch():
    g = make_game()
    o = g.players[1]
    o.bench.append(InPlay([Card(RANA)]))
    old = o.active
    fx.gust(g, 0)
    assert o.active is not old and old in o.bench


def test_ability_once_per_turn():
    used = []
    mon = CardDef("Pescatore", POKEMON, BASIC, hp=60,
                  abilities=(Ability("Pesca", lambda g, me, m: (used.append(1), fx.draw(g, me, 1))),))
    g = make_game()
    p = g.players[0]
    p.bench.append(InPlay([Card(mon)]))
    acts = [a for a in legal_actions(g) if a.kind == "ability"]
    assert len(acts) == 1
    step(g, acts[0])
    assert used == [1] and not [a for a in legal_actions(g) if a.kind == "ability"]
