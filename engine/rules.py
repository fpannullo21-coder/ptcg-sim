"""Regole: preparazione, azioni legali, applicazione delle azioni, KO e premi."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import random

from .state import (Game, PlayerState, InPlay, Card, GameOver,
                    POKEMON, TRAINER, ENERGY, BASIC, SUPPORTER, STADIUM, TOOL, ITEM)


# --- azioni -----------------------------------------------------------------

@dataclass(frozen=True)
class Action:
    kind: str          # bench, evolve, attach, trainer, retreat, attack, end
    card: Optional[Card] = None
    target: Optional[int] = None   # -1 = attivo, 0..4 = panchina
    index: int = 0                 # indice dell'attacco

    def __repr__(self):
        t = "" if self.target is None else ("@A" if self.target == -1 else f"@B{self.target}")
        c = "" if self.card is None else f" {self.card.name}"
        i = f"#{self.index}" if self.kind == "attack" else ""
        return f"<{self.kind}{c}{t}{i}>"


def slot(p: PlayerState, t: int) -> InPlay:
    return p.active if t == -1 else p.bench[t]


def slots(p: PlayerState):
    return ([-1] if p.active else []) + list(range(len(p.bench)))


# --- energia ----------------------------------------------------------------

def can_pay(energies: list[Card], cost: tuple[str, ...]) -> bool:
    pool = [e.d.provides for e in energies]
    need_c = 0
    for c in cost:
        if c == "C":
            need_c += 1
            continue
        if c in pool:
            pool.remove(c)
        elif "*" in pool:
            pool.remove("*")
        else:
            return False
    return len(pool) >= need_c


def retreat_cost(g: Game, mon: InPlay) -> int:
    cost = mon.top.retreat
    for t in mon.tools:
        cost -= t.d.extra.get("retreat_minus", 0)
    return max(0, cost)


# --- preparazione -----------------------------------------------------------

def is_basic(c: Card):
    return c.d.kind == POKEMON and c.d.sub == BASIC


def setup(g: Game):
    rng = g.rng
    for p in g.players:
        rng.shuffle(p.deck)
    mull = [0, 0]
    for i, p in enumerate(g.players):
        while True:
            p.hand = [p.deck.pop() for _ in range(7)]
            if any(is_basic(c) for c in p.hand):
                break
            mull[i] += 1
            p.deck += p.hand
            p.hand = []
            rng.shuffle(p.deck)
    for i, p in enumerate(g.players):
        basics = [c for c in p.hand if is_basic(c)]
        a = g.choose(i, "setup_active", basics)[0]
        p.hand.remove(a)
        p.active = InPlay([a], entered_turn=0)
        basics = [c for c in p.hand if is_basic(c)]
        for c in g.choose(i, "setup_bench", basics, k=5, minimum=0):
            p.hand.remove(c)
            p.bench.append(InPlay([c], entered_turn=0))
    for p in g.players:
        p.prizes = [p.deck.pop() for _ in range(6)]
    # carte extra per i mulligan dell'avversario
    for i in (0, 1):
        extra = mull[1 - i] - mull[i]
        if extra > 0:
            n = g.choose(i, "mulligan_draw", list(range(extra + 1)))[0]
            draw(g, i, n)


def draw(g: Game, pidx: int, n: int):
    p = g.players[pidx]
    for _ in range(n):
        if not p.deck:
            return
        p.hand.append(p.deck.pop())


# --- azioni legali ----------------------------------------------------------

def legal_actions(g: Game) -> list[Action]:
    p, acts = g.me(), [Action("end")]
    first_turn = g.turn == 1
    for c in p.hand:
        d = c.d
        if is_basic(c) and len(p.bench) < 5:
            acts.append(Action("bench", c))
        elif d.kind == POKEMON and d.evolves_from:
            for t in slots(p):
                m = slot(p, t)
                if (m.top.name == d.evolves_from and m.entered_turn < g.turn
                        and m.evolved_turn < g.turn and g.turn > 2):
                    acts.append(Action("evolve", c, t))
        elif d.kind == ENERGY and not p.energy_attached:
            for t in slots(p):
                acts.append(Action("attach", c, t))
        elif d.kind == TRAINER:
            if d.sub == SUPPORTER and (p.supporter_played or first_turn):
                continue
            if d.sub == STADIUM and (p.stadium_played or (g.stadium and g.stadium.name == d.name)):
                continue
            if d.sub == TOOL:
                for t in slots(p):
                    if not slot(p, t).tools:
                        acts.append(Action("trainer", c, t))
                continue
            if d.can_play and not d.can_play(g, g.current):
                continue
            acts.append(Action("trainer", c))
    if p.active and p.bench and not p.retreated and "asleep" not in p.active.conditions \
            and "paralyzed" not in p.active.conditions \
            and len(p.active.energies) >= retreat_cost(g, p.active):
        for t in range(len(p.bench)):
            acts.append(Action("retreat", None, t))
    if p.active and not (first_turn and g.current == g.first) \
            and not ({"asleep", "paralyzed"} & p.active.conditions):
        for i, a in enumerate(p.active.top.attacks):
            if can_pay(p.active.energies, a.cost):
                acts.append(Action("attack", None, -1, i))
    return acts


# --- applicazione -----------------------------------------------------------

def step(g: Game, a: Action) -> bool:
    """Applica un'azione. Restituisce True se il turno è finito."""
    p, me = g.me(), g.current
    g.say(repr(a))
    if a.kind == "end":
        return True
    if a.kind == "bench":
        p.hand.remove(a.card)
        p.bench.append(InPlay([a.card], entered_turn=g.turn))
    elif a.kind == "evolve":
        m = slot(p, a.target)
        p.hand.remove(a.card)
        m.stack.append(a.card)
        m.evolved_turn = g.turn
        m.conditions.clear()
    elif a.kind == "attach":
        p.hand.remove(a.card)
        slot(p, a.target).energies.append(a.card)
        p.energy_attached = True
    elif a.kind == "trainer":
        d = a.card.d
        p.hand.remove(a.card)
        if d.sub == TOOL:
            slot(p, a.target).tools.append(a.card)
        elif d.sub == STADIUM:
            if g.stadium:
                owner = getattr(g, "stadium_owner", me)
                g.players[owner].discard.append(g.stadium)
            g.stadium, g.stadium_owner = a.card, me
            p.stadium_played = True
        else:
            if d.sub == SUPPORTER:
                p.supporter_played = True
            if d.play:
                d.play(g, me)
            p.discard.append(a.card)
    elif a.kind == "retreat":
        cost = retreat_cost(g, p.active)
        if cost:
            for e in g.choose(me, "retreat_discard", p.active.energies, k=cost):
                p.active.energies.remove(e)
                p.discard.append(e)
        switch(p, a.target)
        p.retreated = True
    elif a.kind == "attack":
        attack(g, a.index)
        return True
    check_ko(g)
    return False


def switch(p: PlayerState, t: int):
    new = p.bench.pop(t)
    p.active.conditions.clear()
    p.bench.append(p.active)
    p.active = new


def apply_damage(g: Game, attacker: InPlay, target: InPlay, base: int, to_active=True):
    """Danno da attacco: debolezza e resistenza solo sull'attivo."""
    dmg = base
    if to_active and dmg > 0:
        if target.top.weakness == attacker.top.type:
            dmg *= 2
        if target.top.resistance == attacker.top.type:
            dmg -= 30
    dmg = max(0, dmg)
    target.damage += dmg
    return dmg


def attack(g: Game, idx: int):
    p, o = g.me(), g.opp()
    att = p.active
    a = att.top.attacks[idx]
    g.say(f"attacca con {a.name}")
    dmg = a.damage
    if a.effect:
        r = a.effect(g, g.current)
        if r is not None:
            dmg = r
    if dmg and o.active:
        apply_damage(g, att, o.active, dmg)
    check_ko(g)


def check_ko(g: Game):
    """Gestisce tutti i KO, i premi e la promozione; verifica la fine partita."""
    for pidx in (g.current, 1 - g.current):
        p, taker = g.players[pidx], g.players[1 - pidx]
        for m in list(p.in_play()):
            if m.damage >= m.top.hp:
                g.say(f"KO {m.top.name} di P{pidx}")
                n = m.top.prizes
                if m is p.active:
                    p.active = None
                else:
                    p.bench.remove(m)
                p.discard += m.all_cards()
                take_prizes(g, 1 - pidx, n)
    for pidx in (g.current, 1 - g.current):
        if not g.players[pidx].prizes:
            g.end(pidx, "premi")
    for pidx in (g.current, 1 - g.current):
        p = g.players[pidx]
        if p.active is None:
            if not p.bench:
                g.end(1 - pidx, "nessun Pokémon in campo")
            t = g.choose(pidx, "promote", list(range(len(p.bench))))[0]
            p.active = p.bench.pop(t)


def take_prizes(g: Game, pidx: int, n: int):
    p = g.players[pidx]
    n = min(n, len(p.prizes))
    picks = g.choose(pidx, "prize", list(range(len(p.prizes))), k=n)
    for i in sorted(picks, reverse=True):
        p.hand.append(p.prizes.pop(i))


# --- ciclo della partita ----------------------------------------------------

def between_turns(g: Game):
    for pidx in (g.current, 1 - g.current):
        m = g.players[pidx].active
        if not m:
            continue
        if "poisoned" in m.conditions:
            m.damage += 10
        if "burned" in m.conditions:
            m.damage += 20
            if g.rng.random() < 0.5:
                m.conditions.discard("burned")
        if "asleep" in m.conditions and g.rng.random() < 0.5:
            m.conditions.discard("asleep")
        if "paralyzed" in m.conditions and pidx == g.current:
            m.conditions.discard("paralyzed")
    check_ko(g)


def play_turn(g: Game, max_actions=200):
    p = g.me()
    p.supporter_played = p.energy_attached = p.retreated = p.stadium_played = False
    if not p.deck:
        g.end(1 - g.current, "mazzo finito")
    draw(g, g.current, 1)
    for _ in range(max_actions):
        acts = legal_actions(g)
        a = g.agents[g.current].choose_action(g, g.current, acts)
        if step(g, a):
            break


def play_game(decks, agents, seed=None, verbose=False, max_turns=80, first=None) -> Game:
    rng = random.Random(seed)
    players = [PlayerState(deck=[Card(d) for d in deck]) for deck in decks]
    g = Game(players=players, agents=agents, rng=rng, verbose=verbose)
    g.first = rng.randrange(2) if first is None else first
    try:
        setup(g)
        g.current = g.first
        for t in range(1, max_turns + 1):
            g.turn = t
            play_turn(g)
            between_turns(g)
            g.current = 1 - g.current
        g.winner = -1
    except GameOver:
        pass
    return g
