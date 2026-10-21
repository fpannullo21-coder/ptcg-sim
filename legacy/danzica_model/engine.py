"""Goldfish simulator for Hide n' Sneak (Dhelmise/Banette), TEF-30C format.

Plays our first turns with a greedy heuristic policy (no opponent interaction,
except optional "KO + Unfair Stamp" disruption) and records milestones:
  - Vengeful Anchor for 170 (Dhelmise active + Energy + >=4 HnS in discard)
  - Matcha Spin ready (Sinistcha in play + >=6 HnS in discard)
  - Lillie's Clefairy ex in play (vs Dragapult plan)
The policy is deliberately simple and identical for every list, so results are
meant for COMPARING lists, not as absolute probabilities of a strong player.
"""
import random
from cards import (POKEMON, SUPPORTERS, STADIUMS, ENERGY, is_pokemon, is_basic,
                   is_hns, is_rulebox, ptype)

DRAW_SUPPORTERS = {"Lillie", "Gwynn", "Explorer", "Naveen"}


class Mon:
    __slots__ = ("name", "energy", "played", "stack", "dmg")

    def __init__(self, name, turn):
        self.name = name
        self.energy = []
        self.played = turn
        self.stack = [name]
        self.dmg = 0


class Game:
    def __init__(self, decklist, rng, going_first, want_clefairy=True):
        self.rng = rng
        self.deck = list(decklist)
        self.rng.shuffle(self.deck)
        self.hand, self.discard, self.prizes = [], [], []
        self.active, self.bench = None, []
        self.stadium = None
        self.first = going_first
        self.turn = 0
        self.want_clef = want_clefairy
        self.mulligans = 0
        self.item_lock = False
        self.log = []
        self._setup()

    # ---------------- helpers ----------------
    def draw(self, n):
        for _ in range(n):
            if self.deck:
                self.hand.append(self.deck.pop())

    def hns_discard(self):
        return sum(1 for c in self.discard if is_hns(c))

    def in_play(self):
        return ([self.active] if self.active else []) + self.bench

    def names_in_play(self):
        return [m.name for m in self.in_play()]

    def count_total(self, name):
        return self.names_in_play().count(name) + self.hand.count(name)

    def latias(self):
        return "Latias ex" in self.names_in_play()

    def shuffle(self):
        self.rng.shuffle(self.deck)

    def take_from_deck(self, name):
        if name in self.deck:
            self.deck.remove(name)
            return True
        return False

    # ---------------- setup ----------------
    def _setup(self):
        while True:
            self.draw(7)
            if any(is_basic(c) for c in self.hand):
                break
            self.mulligans += 1
            self.deck += self.hand
            self.hand = []
            self.shuffle()
        order = ["Dhelmise", "Poltchageist", "Dunsparce", "Patrat", "Shaymin", "Yveltal",
                 "Shuppet", "Latias ex", "Genesect", "Spiritomb", "Clefairy ex", "Ursaluna ex"]
        for n in order:
            if n in self.hand:
                self.hand.remove(n)
                self.active = Mon(n, 0)
                break
        self.bench_basics(setup=True)
        for _ in range(6):
            self.prizes.append(self.deck.pop())

    def bench_basics(self, setup=False):
        t = self.turn
        def can():
            return len(self.bench) < 5
        # Dhelmise: up to 2 in play
        while can() and "Dhelmise" in self.hand and self.names_in_play().count("Dhelmise") < 2:
            self.hand.remove("Dhelmise"); self.bench.append(Mon("Dhelmise", t))
        while can() and "Dunsparce" in self.hand and self.names_in_play().count("Dunsparce") + self.names_in_play().count("Dudunsparce") < 2:
            self.hand.remove("Dunsparce"); self.bench.append(Mon("Dunsparce", t))
        if self.__dict__.get("ursa_on") and len(self.bench) < 4 and "Ursaluna ex" in self.hand and "Ursaluna ex" not in self.names_in_play():
            self.hand.remove("Ursaluna ex"); self.bench.append(Mon("Ursaluna ex", t))
        if self.__dict__.get("full_model"):
            if len(self.bench) < 4 and "Yveltal" in self.hand and "Yveltal" not in self.names_in_play():
                self.hand.remove("Yveltal"); self.bench.append(Mon("Yveltal", t))
            if len(self.bench) < 4 and "Spiritomb" in self.hand and "Spiritomb" not in self.names_in_play() and self.hns_discard() >= 10:
                self.hand.remove("Spiritomb"); self.bench.append(Mon("Spiritomb", t))
            if len(self.bench) < 4 and "Shuppet" in self.hand and "Banette" in self.hand \
                    and not any(m.name in ("Shuppet", "Banette") for m in self.in_play()) \
                    and self.names_in_play().count("Dhelmise") == 0:
                self.hand.remove("Shuppet"); self.bench.append(Mon("Shuppet", t))
        if can() and "Genesect" in self.hand and "Genesect" not in self.names_in_play():
            self.hand.remove("Genesect"); self.bench.append(Mon("Genesect", t))
        if can() and "Latias ex" in self.hand and not self.latias():
            self.hand.remove("Latias ex"); self.bench.append(Mon("Latias ex", t))
        if self.want_clef and can() and "Clefairy ex" in self.hand and "Clefairy ex" not in self.names_in_play():
            self.hand.remove("Clefairy ex"); self.bench.append(Mon("Clefairy ex", t))
        # one Poltchageist on bench for a later Sinistcha (only if Sinistcha exists in list)
        if can() and "Poltchageist" in self.hand and "Poltchageist" not in self.names_in_play() \
                and "Sinistcha" not in self.names_in_play() and self.hand.count("Poltchageist") >= 1 \
                and self.hns_discard() >= 2 and not setup:
            self.hand.remove("Poltchageist"); self.bench.append(Mon("Poltchageist", t))

    # ---------------- discard choice ----------------
    def junk_rank(self, c):
        """Lower = discard first."""
        if is_hns(c):
            # keep 1 Poltchageist in hand if we have none in play and want Matcha later
            return 0
        need_dhel = self.names_in_play().count("Dhelmise") == 0
        if c == "Dhelmise":
            return 9 if need_dhel or self.hand.count("Dhelmise") == 1 else 3
        if c == "Night Stretcher":
            return 4
        if c in ("Yveltal", "Spiritomb") and c not in self.names_in_play():
            return 4
        if c in ("Boss", "Jamming Tower", "Wondrous Patch", "Larry",
                 "Spiritomb", "Patrat", "Shaymin", "Yveltal", "Ursaluna ex", "Dudunsparce ex", "Genesect"):
            return 1
        if c in ("Psychic",) and sum(1 for x in self.hand if x in ENERGY) > 1:
            return 2
        if c == "Prism Tower" and (self.stadium == "Prism Tower" or self.hand.count("Prism Tower") > 1):
            return 2
        if c == "Pokegear":
            return 2
        if c in ("Dunsparce", "Dudunsparce") and self.count_total(c) > 2:
            return 3
        if c in ("Clefairy ex", "Latias ex") and c in self.names_in_play():
            return 2
        return 6

    def choose_discards(self, n, exclude=None):
        pool = list(self.hand)
        if exclude is not None:
            pool.remove(exclude)
        pool.sort(key=self.junk_rank)
        return pool[:n] if len(pool) >= n else None

    # ---------------- search targets ----------------
    def search_target(self, rulebox_ok):
        inplay = self.names_in_play()
        cand = []
        if self.count_total("Dhelmise") == 0:
            cand.append("Dhelmise")
        if rulebox_ok and self.want_clef and "Clefairy ex" not in inplay and "Clefairy ex" not in self.hand:
            cand.append("Clefairy ex")
        if self.count_total("Dunsparce") + inplay.count("Dudunsparce") == 0:
            cand.append("Dunsparce")
        if any(m.name == "Dunsparce" and m.played < self.turn for m in self.in_play()) and "Dudunsparce" not in self.hand:
            cand.append("Dudunsparce")
        if self.count_total("Dhelmise") < 2:
            cand.append("Dhelmise")
        # otherwise fetch a HnS card to discard (stage 1 first: dead in hand anyway)
        cand += ["Banette", "Sinistcha", "Shuppet", "Poltchageist"]
        for c in cand:
            if c in self.deck and (rulebox_ok or not is_rulebox(c)):
                return c
        return None

    # ---------------- card plays ----------------
    def play_prism(self):
        if "Prism Tower" in self.hand and self.stadium != "Prism Tower":
            self.hand.remove("Prism Tower"); 
            if self.stadium:
                self.discard.append(self.stadium)
            self.stadium = "Prism Tower"
            return True
        return False

    def use_prism(self):
        if self.stadium != "Prism Tower" or self.prism_used or len(self.hand) < 2:
            return False
        ds = self.choose_discards(2)
        if not ds:
            return False
        # only if at least one is HnS or both are junk
        if not (any(is_hns(c) for c in ds) or all(self.junk_rank(c) <= 2 for c in ds)):
            return False
        for c in ds:
            self.hand.remove(c); self.discard.append(c)
        self.draw(1)
        self.prism_used = True
        return True

    def play_ultra_ball(self):
        if self.item_lock:
            return False
        if "Ultra Ball" not in self.hand or len(self.hand) < 3:
            return False
        tgt = self.search_target(rulebox_ok=True)
        ds = self.choose_discards(2, exclude="Ultra Ball")
        if not ds or tgt is None:
            return False
        if not any(is_hns(c) for c in ds) and tgt in ("Banette", "Sinistcha", "Shuppet", "Poltchageist"):
            return False
        if any(self.junk_rank(c) >= 9 for c in ds):
            return False
        self.hand.remove("Ultra Ball"); self.discard.append("Ultra Ball")
        for c in ds:
            self.hand.remove(c); self.discard.append(c)
        if self.take_from_deck(tgt):
            self.hand.append(tgt)
        self.shuffle()
        return True

    def play_pad(self):
        if self.item_lock or "Poke Pad" not in self.hand:
            return False
        tgt = self.search_target(rulebox_ok=False)
        if tgt is None:
            return False
        # don't Pad for a discard fodder unless we can discard it this turn
        if tgt in ("Banette", "Sinistcha", "Shuppet", "Poltchageist") and self.hns_discard() >= 6:
            return False
        self.hand.remove("Poke Pad"); self.discard.append("Poke Pad")
        self.take_from_deck(tgt); self.hand.append(tgt)
        self.shuffle()
        return True

    def play_poffin(self):
        if self.item_lock or "Poffin" not in self.hand or len(self.bench) >= 5:
            return False
        got = 0
        for n in ("Dunsparce", "Poltchageist", "Shuppet", "Patrat"):
            if got < 2 and len(self.bench) < 5 and n in self.deck:
                if n == "Dunsparce" and self.names_in_play().count("Dunsparce") >= 2:
                    continue
                self.take_from_deck(n); self.bench.append(Mon(n, self.turn)); got += 1
        self.hand.remove("Poffin"); self.discard.append("Poffin"); self.shuffle()
        return True

    def play_stretcher(self):
        if self.item_lock or "Night Stretcher" not in self.hand:
            return False
        if "Dhelmise" in self.discard and self.count_total("Dhelmise") < 2:
            self.discard.remove("Dhelmise"); self.hand.append("Dhelmise")
        elif not any(c in ENERGY for c in self.hand) and "Psychic" in self.discard:
            self.discard.remove("Psychic"); self.hand.append("Psychic")
        else:
            return False
        self.hand.remove("Night Stretcher"); self.discard.append("Night Stretcher")
        return True

    def play_blender(self):
        if self.item_lock or "Brilliant Blender" not in self.hand or self.hns_discard() >= 13:
            return False
        got = 0
        for n in ("Banette", "Sinistcha", "Shuppet", "Poltchageist"):
            while got < 5 and n in self.deck:
                self.take_from_deck(n); self.discard.append(n); got += 1
        self.hand.remove("Brilliant Blender"); self.discard.append("Brilliant Blender"); self.shuffle()
        return got > 0

    def play_gear(self):
        if self.item_lock or "Pokegear" not in self.hand or self.supporter_used or not self.can_supporter:
            return False
        if any(c in DRAW_SUPPORTERS for c in self.hand):
            return False
        self.hand.remove("Pokegear"); self.discard.append("Pokegear")
        top = self.deck[-7:]
        pick = None
        for pref in ("Gwynn", "Explorer", "Lillie", "Naveen"):
            if pref in top:
                pick = pref; break
        if pick:
            idx = len(self.deck) - 1 - self.deck[::-1].index(pick)
            self.hand.append(self.deck.pop(idx))
        self.shuffle()
        return True

    def play_supporter(self):
        if self.supporter_used or not self.can_supporter:
            return False
        if self.__dict__.get("boss_wanted") and "Boss" in self.hand and self.hns_discard() >= 4:
            return False
        if self.__dict__.get("bb_wanted") and "Black Belt" in self.hand and self.hns_discard() >= 4:
            return False
        h = self.hand
        n_hns = sum(1 for c in h if is_hns(c))
        gwynn_fod = sorted([c for c in h if is_pokemon(c) and not is_rulebox(c)
                            and self.junk_rank(c) <= 3], key=self.junk_rank)[:2]
        naveen_junk = [c for c in h if self.junk_rank(c) <= 2 and c != "Naveen"]
        options = []
        if "Gwynn" in h and gwynn_fod:
            # value: HnS discarded + cards drawn
            options.append((sum(is_hns(c) for c in gwynn_fod) * 3 + 3 * len(gwynn_fod) * 0.5, "Gwynn"))
        if "Naveen" in h:
            draw = max(0, 5 - (len(h) - 1 - len(naveen_junk)))
            if draw > 0:
                options.append((sum(is_hns(c) for c in naveen_junk) * 3 + draw * 0.5, "Naveen"))
        if "Explorer" in h:
            options.append((1.6 * (1 if self.hns_discard() < 6 else 0.3) * 3 * 0.5 + 1.0, "Explorer"))
        if "Lillie" in h:
            options.append((0.5 * (8 if len(self.prizes) == 6 else 6) * 0.5 - n_hns * 1.5 - 1.0, "Lillie"))
        if not options:
            return False
        options.sort(reverse=True)
        pick = options[0][1]
        h.remove(pick); self.discard.append(pick)
        if pick == "Gwynn":
            for c in gwynn_fod:
                h.remove(c); self.discard.append(c)
            self.draw(3 * len(gwynn_fod))
        elif pick == "Naveen":
            for c in naveen_junk:
                h.remove(c); self.discard.append(c)
            self.draw(max(0, 5 - len(h)))
        elif pick == "Explorer":
            top = [self.deck.pop() for _ in range(min(6, len(self.deck)))]
            top.sort(key=lambda c: -self.keep_value(c))
            self.hand += top[:2]; self.discard += top[2:]
        else:
            self.deck += h; self.hand = []; self.shuffle()
            self.draw(8 if len(self.prizes) == 6 else 6)
        self.supporter_used = True
        return True

    def keep_value(self, c):
        """Explorer's Guidance: what to keep (high) vs discard (low). HnS go to discard."""
        if is_hns(c):
            return -1
        if c == "Dhelmise" and self.count_total("Dhelmise") < 2:
            return 10
        if c in ("Telepathic", "Psychic", "Legacy") and not any(x in ENERGY for x in self.hand):
            return 9
        hns_in_hand = any(is_hns(x) for x in self.hand)
        if c in ("Gwynn", "Naveen") and hns_in_hand:
            return 9
        if c in ("Gwynn", "Lillie", "Ultra Ball", "Poke Pad", "Naveen"):
            return 8
        if c == "Clefairy ex" and self.want_clef and "Clefairy ex" not in self.names_in_play():
            return 7
        if c in ("Dunsparce", "Dudunsparce", "Prism Tower", "Latias ex"):
            return 6
        return 1

    def evolve(self):
        if self.turn < 2:
            return False
        did = False
        for m in self.in_play():
            if m.played >= self.turn:
                continue
            if m.name == "Dunsparce" and "Dudunsparce" in self.hand:
                self.hand.remove("Dudunsparce"); m.stack.append("Dudunsparce"); m.name = "Dudunsparce"
                m.played = self.turn; did = True
                # Run Away Draw: draw 3, shuffle this Pokemon + attached into deck
                if m is not self.active:
                    self.draw(3)
                    self.bench.remove(m)
                    self.deck += m.stack + m.energy; self.shuffle()
                    self.draws_used += 1
                elif self.bench:
                    # from the Active Spot too: it leaves play, promote the best bench Pokemon
                    self.draw(3)
                    self.deck += m.stack + m.energy; self.shuffle()
                    self.active = None
                    self.promote()
                    self.draws_used += 1
                return True
            if m.name == "Poltchageist" and "Sinistcha" in self.hand and self.hns_discard() >= 4:
                self.hand.remove("Sinistcha"); m.stack.append("Sinistcha"); m.name = "Sinistcha"
                m.played = self.turn; return True
            if m.name == "Shuppet" and "Banette" in self.hand and (self.hns_discard() >= 6 or self.__dict__.get("full_model")):
                self.hand.remove("Banette"); m.stack.append("Banette"); m.name = "Banette"
                m.played = self.turn; return True
        return did

    def best_dhelmise_on_bench(self):
        ds = [m for m in self.bench if m.name == "Dhelmise"]
        ds.sort(key=lambda m: -len(m.energy))
        return ds[0] if ds else None

    def retreat_cost(self, m):
        if self.latias() and POKEMON[m.name][0] == "basic":
            return 0
        return POKEMON[m.name][4]

    def try_retreat(self):
        if self.retreated or self.active is None or self.active.name == "Dhelmise":
            return False
        d = self.best_dhelmise_on_bench()
        if not d:
            return False
        cost = self.retreat_cost(self.active)
        if len(self.active.energy) < cost:
            return False
        for _ in range(cost):
            self.discard.append(self.active.energy.pop())
        self.bench.remove(d); self.bench.append(self.active); self.active = d
        self.retreated = True
        return True

    def attach_energy(self):
        if self.attached or self.active is None:
            return False
        en =[c for c in ("Telepathic", "Psychic", "Legacy") if c in self.hand]
        if not en:
            return False
        e = en[0]
        target = None
        ur = [m for m in self.bench if m.name == "Ursaluna ex"]
        if self.__dict__.get("ursa_on") and ur and self.active and self.active.name == "Dhelmise" \
                and len(self.active.energy) >= 1 and len(ur[0].energy) < self.__dict__.get("ursa_cost", 5):
            self.hand.remove(e); ur[0].energy.append(e); self.attached = True
            return True
        if self.active and self.active.name == "Dhelmise":
            target = self.active
        else:
            d = self.best_dhelmise_on_bench()
            if d and not self.retreated:
                cost = self.retreat_cost(self.active)
                if cost == 0:
                    self.try_retreat(); target = self.active
                elif len(d.energy) >= 1 and cost == 1 and len(self.active.energy) == 0:
                    target = self.active  # pay retreat with this energy
                else:
                    target = d
            elif d:
                target = d
            elif self.active and ptype(self.active.name) == "P":
                target = self.active
            elif self.bench:
                ps = [m for m in self.bench if ptype(m.name) == "P"]
                target = ps[0] if ps else self.active
        if target is None:
            return False
        self.hand.remove(e); target.energy.append(e)
        self.attached = True
        if e == "Telepathic" and ptype(target.name) == "P":
            got = 0
            for n in self.telepathic_targets():
                if got < 2 and len(self.bench) < 5 and n in self.deck:
                    self.take_from_deck(n); self.bench.append(Mon(n, self.turn)); got += 1
            self.shuffle()
        if target is self.active and self.active.name != "Dhelmise":
            self.try_retreat()
        return True

    def telepathic_targets(self):
        out = []
        if self.names_in_play().count("Dhelmise") < 2:
            out.append("Dhelmise")
        if self.want_clef and "Clefairy ex" not in self.names_in_play():
            out.append("Clefairy ex")
        if self.names_in_play().count("Dhelmise") < 2:
            out.append("Dhelmise")
        if not self.latias():
            out.append("Latias ex")
        return out

    def can_anchor(self):
        a = self.active
        return (a is not None and a.name == "Dhelmise" and len(a.energy) >= 1
                and self.hns_discard() >= 4)

    # ---------------- turn ----------------
    def play_turn(self):
        self.turn += 1
        self.draw(1)
        self.can_supporter = not (self.first and self.turn == 1)
        self.can_attack = not (self.first and self.turn == 1)
        self.supporter_used = self.attached = self.retreated = self.prism_used = False
        self.draws_used = 0
        for _ in range(40):
            progressed = False
            self.bench_basics()
            progressed |= self.evolve()
            progressed |= self.play_prism()
            progressed |= self.play_poffin()
            progressed |= self.play_ultra_ball()
            progressed |= self.play_pad()
            progressed |= self.use_prism()
            progressed |= self.play_gear()
            progressed |= self.play_blender()
            progressed |= self.play_stretcher()
            if not progressed:
                progressed |= self.play_supporter()
            if not progressed:
                break
        self.bench_basics()
        self.attach_energy()
        self.try_retreat()
        attacked = self.can_attack and self.can_anchor()
        return attacked

    # ---------------- disruption ----------------
    def opp_ko_active(self):
        """Opponent KOs our Active (assumed Dhelmise after an attack)."""
        if self.active is None:
            return
        self.discard += self.active.stack + self.active.energy
        # (the opponent takes the Prize card, not us)
        self.active = None
        self.promote()

    def promote(self):
        """Promote: charged Dhelmise > Dhelmise > a Basic (free retreat with Latias) > anything."""
        def key(m):
            if m.name == "Dhelmise":
                return (0, -len(m.energy))
            if POKEMON[m.name][0] == "basic" and not POKEMON[m.name][2]:
                return (1, POKEMON[m.name][4])
            if m.name == "Latias ex":
                return (2, 0)
            return (3, POKEMON[m.name][4])
        cands = sorted(self.bench, key=key)
        if cands:
            self.active = cands[0]; self.bench.remove(cands[0])
        else:
            self.active = None

    def unfair_stamp(self):
        self.deck += self.hand; self.hand = []; self.shuffle(); self.draw(2)
