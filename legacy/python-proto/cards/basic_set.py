"""Carte generiche per i test del motore (non sono carte reali)."""
from engine.state import CardDef, Attack, POKEMON, ENERGY, TRAINER, BASIC, STAGE1, BASIC_E, ITEM, SUPPORTER


def energy(t):
    return CardDef(f"Energia {t}", ENERGY, BASIC_E, provides=t)


FIRE_E, WATER_E = energy("R"), energy("W")

SALAMANDER = CardDef("Salamandra", POKEMON, BASIC, hp=70, type="R", weakness="W", retreat=1,
                     attacks=(Attack("Fiammella", ("R",), 30), Attack("Vampata", ("R", "C"), 60)))
DRAGONE = CardDef("Dragone", POKEMON, STAGE1, hp=150, type="R", weakness="W", retreat=2,
                  evolves_from="Salamandra", attacks=(Attack("Rogo", ("R", "R", "C"), 140),))
RANA = CardDef("Rana", POKEMON, BASIC, hp=80, type="W", weakness="L", retreat=1,
               attacks=(Attack("Getto", ("W",), 20), Attack("Onda", ("W", "C"), 50)))
ROSPO_EX = CardDef("Rospo ex", POKEMON, BASIC, hp=220, type="W", weakness="L", retreat=2, prizes=2,
                   tags=frozenset({"ex"}), attacks=(Attack("Diluvio", ("W", "W", "C"), 180),))


def _draw3(g, me):
    from engine.rules import draw
    draw(g, me, 3)


def _research(g, me):
    from engine.rules import draw
    p = g.players[me]
    p.discard += p.hand
    p.hand = []
    draw(g, me, 7)


POZIONE_PESCA = CardDef("Pesca Tre", TRAINER, ITEM, play=_draw3)
RICERCA = CardDef("Ricerca", TRAINER, SUPPORTER, play=_research)


def fire_deck():
    return [SALAMANDER] * 4 + [DRAGONE] * 3 + [FIRE_E] * 45 + [POZIONE_PESCA] * 4 + [RICERCA] * 4


def water_deck():
    return [RANA] * 4 + [ROSPO_EX] * 3 + [WATER_E] * 45 + [POZIONE_PESCA] * 4 + [RICERCA] * 4
