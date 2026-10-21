"""Effetti di base da comporre per descrivere le carte.

Ogni funzione riceve la partita `g` e l'indice del giocatore `me`. Le scelte
passano sempre da `g.choose`, così la stessa carta funziona con qualsiasi IA.
"""
from __future__ import annotations
from engine.state import InPlay, POKEMON, ENERGY, BASIC, BASIC_E
from engine import rules


# --- filtri ricorrenti ------------------------------------------------------

def is_pokemon(c):
    return c.d.kind == POKEMON


def is_basic_pokemon(c):
    return c.d.kind == POKEMON and c.d.sub == BASIC


def is_basic_energy(c):
    return c.d.kind == ENERGY and c.d.sub == BASIC_E


def is_energy(c):
    return c.d.kind == ENERGY


def named(*names):
    return lambda c: c.d.name in names


def has_tag(tag):
    return lambda c: tag in c.d.tags


def hp_at_most(n):
    return lambda c: c.d.kind == POKEMON and c.d.hp <= n


# --- mazzo, mano, scarti ----------------------------------------------------

def draw(g, me, n):
    rules.draw(g, me, n)


def draw_until(g, me, n):
    p = g.players[me]
    rules.draw(g, me, max(0, n - len(p.hand)))


def shuffle_hand_into_deck(g, me):
    p = g.players[me]
    p.deck += p.hand
    p.hand = []
    g.rng.shuffle(p.deck)


def discard_hand(g, me):
    p = g.players[me]
    p.discard += p.hand
    p.hand = []


def search_deck(g, me, flt, k=1, dest="hand", minimum=0, kind="search"):
    """Cerca fino a k carte che rispettano flt e le mette in mano o in panchina."""
    p = g.players[me]
    if dest == "bench":
        k = min(k, 5 - len(p.bench))
    pool = [c for c in p.deck if flt(c)]
    picks = g.choose(me, kind, pool, k=k, minimum=min(minimum, len(pool)))
    for c in picks:
        p.deck.remove(c)
        if dest == "hand":
            p.hand.append(c)
        elif dest == "bench":
            p.bench.append(InPlay([c], entered_turn=g.turn))
        elif dest == "discard":
            p.discard.append(c)
    g.rng.shuffle(p.deck)
    return picks


def mill(g, me, k, flt=lambda c: True, kind="mill"):
    """Scarta dal mazzo fino a k carte a scelta (es. Brilliant Blender)."""
    return search_deck(g, me, flt, k=k, dest="discard", kind=kind)


def discard_from_hand(g, me, k, flt=lambda c: True, minimum=None, kind="discard"):
    p = g.players[me]
    pool = [c for c in p.hand if flt(c)]
    picks = g.choose(me, kind, pool, k=k, minimum=k if minimum is None else minimum)
    for c in picks:
        p.hand.remove(c)
        p.discard.append(c)
    return picks


def recover(g, me, flt, k=1, kind="recover", to="hand"):
    """Riprende carte dagli scarti, in mano o nel mazzo."""
    p = g.players[me]
    pool = [c for c in p.discard if flt(c)]
    picks = g.choose(me, kind, pool, k=k, minimum=0)
    for c in picks:
        p.discard.remove(c)
        (p.hand if to == "hand" else p.deck).append(c)
    if to == "deck":
        g.rng.shuffle(p.deck)
    return picks


def count_discard(g, me, flt):
    return sum(1 for c in g.players[me].discard if flt(c))


# --- campo ------------------------------------------------------------------

def switch_own(g, me, kind="switch"):
    p = g.players[me]
    if not p.bench:
        return False
    t = g.choose(me, kind, list(range(len(p.bench))))[0]
    rules.switch(p, t)
    return True


def gust(g, me, kind="gust"):
    """L'avversario sposta in attivo un Pokémon della sua panchina scelto da me."""
    o = g.players[1 - me]
    if not o.bench:
        return False
    t = g.choose(me, kind, list(range(len(o.bench))))[0]
    rules.switch(o, t)
    return True


def place_counters(g, me, n, targets="opp_any", kind="counters"):
    """Piazza n segnalini danno (10 ciascuno), uno alla volta, sui bersagli scelti."""
    side = g.players[1 - me] if targets.startswith("opp") else g.players[me]
    for _ in range(n):
        mons = side.in_play()
        if not mons:
            break
        t = g.choose(me, kind, mons)[0]
        t.damage += 10


def counters_each(g, me, n, side="opp", skip=lambda m: False):
    p = g.players[1 - me] if side == "opp" else g.players[me]
    for m in p.in_play():
        if not skip(m):
            m.damage += 10 * n


def heal(g, mon: InPlay, amount):
    mon.damage = max(0, mon.damage - amount)


def attach_from_discard(g, me, flt, k=1, kind="attach_discard"):
    p = g.players[me]
    pool = [c for c in p.discard if flt(c)]
    for c in g.choose(me, kind, pool, k=k, minimum=0):
        t = g.choose(me, kind + "_target", p.in_play())[0]
        p.discard.remove(c)
        t.energies.append(c)


def discard_energy(g, mon: InPlay, owner: int, n=1):
    for e in mon.energies[-n:]:
        mon.energies.remove(e)
        g.players[owner].discard.append(e)
