"""Stato della partita: carte, Pokémon in campo, giocatori, partita."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Optional
import random

# --- definizioni delle carte -------------------------------------------------

POKEMON, TRAINER, ENERGY = "pokemon", "trainer", "energy"
BASIC, STAGE1, STAGE2 = "basic", "stage1", "stage2"
ITEM, SUPPORTER, STADIUM, TOOL = "item", "supporter", "stadium", "tool"
BASIC_E, SPECIAL_E = "basic_energy", "special_energy"


@dataclass
class Attack:
    name: str
    cost: tuple[str, ...]          # es. ("P", "C"); "C" = incolore
    damage: int = 0
    effect: Optional[Callable] = None   # effect(game, attacker_player) -> danno modificato o None


@dataclass
class CardDef:
    name: str
    kind: str                      # POKEMON / TRAINER / ENERGY
    sub: str                       # BASIC, STAGE1, ITEM, SUPPORTER, BASIC_E ...
    hp: int = 0
    type: str = "C"
    weakness: Optional[str] = None
    resistance: Optional[str] = None
    retreat: int = 0
    attacks: tuple[Attack, ...] = ()
    evolves_from: Optional[str] = None
    prizes: int = 1                # 2 per gli ex, 3 per i Mega ex
    tags: frozenset = frozenset()  # "ex", "ace_spec", "hide_n_sneak", ...
    provides: str = ""             # per le Energie: tipo fornito
    play: Optional[Callable] = None     # effetto per Allenatori: play(game, player) -> bool
    can_play: Optional[Callable] = None
    extra: dict = field(default_factory=dict)   # es. {"retreat_minus": 2}


_uid = 0


@dataclass(eq=False)
class Card:
    d: CardDef
    uid: int = field(default=0)

    def __post_init__(self):
        global _uid
        _uid += 1
        self.uid = _uid

    @property
    def name(self):
        return self.d.name

    def __repr__(self):
        return self.d.name


@dataclass(eq=False)
class InPlay:
    stack: list[Card]              # stack[-1] è la carta in cima
    energies: list[Card] = field(default_factory=list)
    tools: list[Card] = field(default_factory=list)
    damage: int = 0
    entered_turn: int = 0
    evolved_turn: int = -1
    conditions: set = field(default_factory=set)

    @property
    def top(self) -> CardDef:
        return self.stack[-1].d

    @property
    def hp_left(self):
        return self.top.hp - self.damage

    def all_cards(self):
        return self.stack + self.energies + self.tools

    def __repr__(self):
        return f"{self.top.name}({self.hp_left}/{self.top.hp}, E{len(self.energies)})"


@dataclass
class PlayerState:
    deck: list[Card]
    hand: list[Card] = field(default_factory=list)
    prizes: list[Card] = field(default_factory=list)
    discard: list[Card] = field(default_factory=list)
    active: Optional[InPlay] = None
    bench: list[InPlay] = field(default_factory=list)
    supporter_played: bool = False
    energy_attached: bool = False
    retreated: bool = False
    stadium_played: bool = False

    def in_play(self):
        return ([self.active] if self.active else []) + self.bench


class GameOver(Exception):
    pass


@dataclass
class Game:
    players: list[PlayerState]
    agents: list                   # oggetti con choose_action / choose
    rng: random.Random
    turn: int = 0                  # numero di turno globale (1 = primo turno)
    current: int = 0               # indice del giocatore di turno
    first: int = 0
    stadium: Optional[Card] = None
    winner: Optional[int] = None
    log: list[str] = field(default_factory=list)
    verbose: bool = False

    def me(self):
        return self.players[self.current]

    def opp(self):
        return self.players[1 - self.current]

    def say(self, msg):
        if self.verbose:
            self.log.append(f"T{self.turn} P{self.current}: {msg}")

    def choose(self, pidx, kind, options, k=1, minimum=None):
        """Chiede all'agente del giocatore pidx di scegliere k opzioni."""
        if not options:
            return []
        k = min(k, len(options))
        minimum = k if minimum is None else minimum
        res = self.agents[pidx].choose(self, pidx, kind, options, k, minimum)
        assert minimum <= len(res) <= k, (kind, res)
        return res

    def end(self, winner, why):
        self.winner = winner
        self.say(f"FINE: vince P{winner} ({why})")
        raise GameOver()
