"""Match simulator v6: Hide n' Sneak (engine.Game, card-level) vs meta opponents.

Opponent model: real attacker chain + real bench (from Nice/Frankfurt lists), with
decisions on every turn: Unfair Stamp timing, healing, retreating a damaged
attacker, attack target (Active or Boss's Orders on our Bench), Phantom Dive
counters, Gladion double prizes.

strong=True turns the opponent into a lookahead player: at each turn it tries
every legal option for Stamp / retreat / target, plays K random continuations
of the game for each option (both sides on the base policy) and picks the
option with the best win rate. That is a 1-ply Monte Carlo search: it finds the
plays that actually win games in this model (gusting the right Pokemon,
holding the Stamp, saving a damaged attacker) instead of following fixed rules.
"""
import copy
import random
from engine import Game
from cards import POKEMON as PK, is_hns as HNS

U = lambda hp, pr, dragon=False: dict(hp=hp, pr=pr, dragon=dragon)

OPP = {
 "Dragapult":          dict(atk=200, ctr=60, boss=3, hammers=4, sw=0.3, stamp=0.6, budew=0.45, hammer=0.45, clef=True, first=2,
                            bench=[U(210,2),U(110,1),U(70,1,True)], units=[U(90,1,True),U(320,2,True),U(320,2,True),U(320,2,True)]),
 "Dragapult Blaziken": dict(atk=200, ctr=30, boss=2, hammers=1, sw=0.5, stamp=0.5, budew=0.2, hammer=0.2, clef=True, heal_all=30, first=2,
                            bench=[U(210,2),U(110,1)], units=[U(320,2),U(320,2,True),U(320,2),U(320,2,True)]),
 "Basic Box":          dict(atk=220, boss=3, sw=0.6, stamp=0.5, first=2,
                            bench=[U(170,2),U(210,2),U(210,2)], units=[U(210,2),U(300,3),U(210,2),U(300,3),U(240,2)]),
 "Slowking":           dict(atk=120, snipe_dmg=30, boss=1, sw=0.3, first=2,
                            bench=[U(170,2)], units=[U(120,1),U(120,1),U(300,3),U(120,1),U(120,1)]),
 "N's Zoroark":        dict(atk=140, dark=True, boss=2, sw=0.3, first=2,
                            bench=[U(110,1)], units=[U(130,1),U(280,2),U(280,2),U(280,2)]),
 "Festival Lead":      dict(atk=160, prism_halves=True, boss=2, sw=0.4, double=0.25, protect_bench=0.5, first=2,
                            units=[U(80,1),U(100,1),U(110,1),U(80,1),U(70,1),U(80,1),U(100,1)]),
 "Ogerpon Hydrapple":  dict(atk_grow=True, boss=2, sw=0.5, heal_any=30, stamp=0.5, first=2,
                            bench=[U(210,2),U(170,2),U(80,1)], units=[U(210,2),U(330,2),U(210,2),U(330,2)]),
 "Alakazam Dudunsparce": dict(atk=150, counters=True, boss=1, sw=0.3, first=3,
                            units=[U(140,1),U(140,1),U(270,2),U(140,1),U(140,1)]),
 "Mega Excadrill":     dict(atk=200, boss=2, sw=0.3, heal_cards=3, first=3,
                            units=[U(340,3),U(340,3)]),
 "Sharpedo Toxtricity": dict(atk=270, early_atk=140, dark=True, boss=2, sw=0.3, first=2,
                            bench=[U(140,1),U(110,1)], units=[U(330,3),U(330,3)]),
 # real plan: big Kangaskhan (Hero's Cape) + limited healing; Crustle buys time; Dwebble for the last prize
 "Crustle":            dict(boss=1, sw=0.4, heal_cards=4, first=2,
                            bench=[U(70,1), U(70,1)],
                            units=[dict(U(150,1), mist=True, noex=True, atk=120), dict(U(350,3), atk=220),
                                   dict(U(150,1), mist=True, noex=True, atk=120), dict(U(300,3), atk=220)]),
}
TARGET = {"Dragapult":0.53,"Dragapult Blaziken":0.34,"Basic Box":0.37,"Slowking":0.64,"N's Zoroark":0.19,
          "Festival Lead":0.41,"Ogerpon Hydrapple":0.31,"Alakazam Dudunsparce":0.64,"Mega Excadrill":0.41,
          "Sharpedo Toxtricity":0.16,"Crustle":0.50}
SHARE = {"Dragapult":23.8,"Slowking":7.3,"Basic Box":7.0,"Festival Lead":5.2,"Dragapult Blaziken":5.0,
         "N's Zoroark":4.9,"Alakazam Dudunsparce":4.2,"Ogerpon Hydrapple":3.8,"Mega Excadrill":3.2,
         "Sharpedo Toxtricity":2.4,"Crustle":1.7}

WEAK_DARK = {"Dhelmise", "Shuppet", "Banette", "Spiritomb", "Latias ex"}
EX = {"Clefairy ex", "Latias ex", "Ursaluna ex", "Dudunsparce ex"}
RET = {k: v[4] for k, v in PK.items()}


class Match:
    def __init__(self, deck, opp, s, rng, we_first, strong=False, K=6):
        self.o = o = OPP[opp]
        self.rng = rng
        self.g = Game(deck, rng, we_first, want_clefairy=o.get("clef", False))
        self.g.full_model = True
        self.alive = [dict(u, dmg=0) for u in o["units"]]
        self.bench = [dict(u, dmg=0) for u in o.get("bench", [])]
        self.our_pr, self.opp_pr = 6, 6
        self.cons = min(1.0, max(0.05, 0.45 + 0.55 * s))
        self.p_boss = min(1.0, max(0.0, 0.15 + 0.6 * s))
        self.p_sw = o.get("sw", 0) * min(1.0, max(0.0, 0.3 + 0.7 * s))
        self.st = dict(legacy_used=False, stamp_left=rng.random() < o.get("stamp", 0), kod_last=False,
                       opp_turn=0, ursa_rest=False, boss_left=o.get("boss", 0), heal_left=o.get("heal_cards", 0),
                       hammers_left=o.get("hammers", 0))
        self.we_first = we_first
        self.half = 0            # half-turns played
        self.strong = strong
        self.K = K

    # ---------------------------------------------------------------- helpers
    def yv(self):
        return "Yveltal" in self.g.names_in_play()

    def our_prize(self, mn):
        pr = 2 if mn.name in EX else 1
        if "Legacy" in mn.energy and not self.st["legacy_used"]:
            pr -= 1
        return pr

    def remove_ours(self, mn):
        g = self.g
        pr = self.our_prize(mn)
        if "Legacy" in mn.energy and not self.st["legacy_used"]:
            self.st["legacy_used"] = True
        self.opp_pr -= pr
        if mn is g.active:
            g.opp_ko_active()
        else:
            g.bench.remove(mn); g.discard += mn.stack + mn.energy

    def eff(self, mn, dmg, counters=False):
        if counters and HNS(mn.name):
            return 0
        if self.o.get("dark") and mn.name in WEAK_DARK:
            return 2 * dmg
        return dmg

    def value(self, mn):
        v = self.our_prize(mn)
        if mn.name == "Dhelmise" and mn.energy: v += 0.5
        if mn.name == "Clefairy ex" and self.o.get("clef"): v += 0.8
        if mn.name == "Ursaluna ex" and len(mn.energy) >= 2: v += 0.3
        return v

    # ---------------------------------------------------------------- opponent
    def opp_options(self):
        """Decision points available at the start of this opponent turn (for the strong player)."""
        g, st, alive = self.g, self.st, self.alive
        blocked = g.__dict__.get("helmet_on") and "Genesect" in g.names_in_play()
        stamp_opts = [True, False] if (st["stamp_left"] and st["kod_last"] and not blocked and g.hand) else [None]
        ret_opts = [True, False] if len(alive) > 1 else [None]
        hm = [None]
        if st["hammers_left"] and g.active is not None:
            hm = ["none"] + [i for i, x in enumerate([g.active] + g.bench) if x.energy and x.name in ("Dhelmise", "Ursaluna ex", "Sinistcha", "Spiritomb")]
            if len(hm) == 1:
                hm = [None]
        return stamp_opts, ret_opts, hm

    def opp_turn(self, dec):
        """One opponent turn. dec: fixed decisions (None = base policy). Returns True if the game ended."""
        g, st, o, alive, rng = self.g, self.st, self.o, self.alive, self.rng
        st["opp_turn"] += 1
        t = st["opp_turn"]
        g.item_lock = False
        if "Genesect" in g.names_in_play() and "Lucky Helmet" in g.hand and not g.__dict__.get("helmet_on"):
            g.hand.remove("Lucky Helmet"); g.helmet_on = True
        blocked = g.__dict__.get("helmet_on") and "Genesect" in g.names_in_play()
        # --- Unfair Stamp
        do_stamp = dec.get("stamp")
        if do_stamp is None:
            do_stamp = st["stamp_left"] and st["kod_last"] and not blocked and len(g.hand) >= 2 and rng.random() < 0.85
        if do_stamp and st["stamp_left"] and st["kod_last"] and not blocked:
            g.unfair_stamp(); st["stamp_left"] = False
        if t == 1 and rng.random() < o.get("budew", 0):
            g.item_lock = True
            return False
        # --- healing
        if alive:
            if o.get("heal_any"):
                hurt = max(alive[:2], key=lambda u: u["dmg"])
                if hurt["dmg"] > 0 and not (hurt is alive[0] and self.yv()):
                    hurt["dmg"] = max(0, hurt["dmg"] - o["heal_any"])
            if o.get("heal_all") and alive[0]["dmg"] > 0 and not self.yv() and rng.random() < 0.5:
                alive[0]["dmg"] = max(0, alive[0]["dmg"] - o["heal_all"])
            if st["heal_left"] and alive[0]["dmg"] >= 60 and not self.yv() and rng.random() < 0.6 * self.cons:
                alive[0]["dmg"] = max(0, alive[0]["dmg"] - 80); st["heal_left"] -= 1
        # --- retreat a damaged attacker
        do_ret = dec.get("retreat")
        if len(alive) > 1 and (alive[0]["dmg"] > 0 or do_ret):
            if do_ret is None:
                clef_up = "Clefairy ex" in g.names_in_play()
                threat = 340 if (alive[0]["dragon"] and clef_up) else 170
                do_ret = alive[1]["dmg"] == 0 and alive[0]["hp"] - alive[0]["dmg"] <= threat and rng.random() < self.p_sw
            elif do_ret:
                do_ret = rng.random() < max(self.p_sw, 0.35)   # needs a switch card
            if do_ret:
                alive[0], alive[1] = alive[1], alive[0]
        attack_ok = dec.get("attack_ok")
        if attack_ok is None:
            attack_ok = rng.random() < self.cons
        if t < o["first"] or not attack_ok:
            return False
        if g.active is None:
            return True
        if o.get("atk_grow"):
            atk = min(30 + 30 * (t + 1), 270)
        elif o.get("early_atk") and t < 3:
            atk = o["early_atk"]
        else:
            atk = alive[0].get("atk", o.get("atk", 180)) if alive else o.get("atk", 180)
        if o.get("prism_halves") and g.stadium == "Prism Tower":
            atk //= 2
        counters = o.get("counters", False)
        if st["hammers_left"] and rng.random() < 0.45:      # a Crushing Hammer in hand this turn
            choice = dec.get("hammer")
            pool = [g.active] + g.bench
            if choice is None:
                choice = 0 if g.active.energy else "none"
            if choice != "none" and choice < len(pool) and pool[choice].energy:
                st["hammers_left"] -= 1
                if rng.random() < 0.5:
                    tgtm = pool[choice]
                    e = "Legacy" if "Legacy" in tgtm.energy else tgtm.energy[-1]
                    tgtm.energy.remove(e); g.discard.append(e)
        a = g.active
        if "Legacy" in a.energy and not st["legacy_used"] and rng.random() < o.get("hammer", 0):
            a.energy.remove("Legacy"); g.discard.append("Legacy")
        # --- target
        boss_avail = dec.get("boss_avail")
        if boss_avail is None:
            boss_avail = st["boss_left"] > 0 and rng.random() < self.p_boss
        tgt_key = dec.get("target")
        if tgt_key is not None:
            if tgt_key == "A" or not boss_avail or tgt_key[1] >= len(g.bench):
                best = g.active
            else:
                best = g.bench[tgt_key[1]]
            d = self.eff(best, atk, counters)
            if best is not g.active:
                st["boss_left"] -= 1
            best.dmg += d
            if best.dmg >= PK[best.name][5]:
                self.remove_ours(best)
        else:
            cands = [g.active] + (list(g.bench) if boss_avail else [])
            best, bestv = None, -1
            for mn in cands:
                d = self.eff(mn, atk, counters)
                if d and mn.dmg + d >= PK[mn.name][5]:
                    v = self.value(mn) - (0.15 if mn is not g.active else 0)
                    if v > bestv:
                        best, bestv = mn, v
            if best is None:
                best = g.active
                best.dmg += self.eff(best, atk, counters)
                if best.dmg >= PK[best.name][5]:
                    self.remove_ours(best)
            else:
                if best is not g.active:
                    st["boss_left"] -= 1
                self.remove_ours(best)
        if self.opp_pr <= 0 or g.active is None:
            return True
        if o.get("double") and g.bench and rng.random() < o["double"]:
            self.remove_ours(min(g.bench, key=lambda x: PK[x.name][5]))
        if o.get("ctr"):
            pool = [x for x in g.in_play() if not HNS(x.name)]
            if pool:
                def ctr_score(x):
                    left = PK[x.name][5] - x.dmg
                    return (left <= o["ctr"], self.value(x), -left)
                tg = max(pool, key=ctr_score)
                tg.dmg += o["ctr"]
                if tg.dmg >= PK[tg.name][5]:
                    self.remove_ours(tg)
        if o.get("snipe_dmg") and g.bench and rng.random() < 0.5:
            tg = min(g.bench, key=lambda x: PK[x.name][5] - x.dmg)
            tg.dmg += o["snipe_dmg"]
            if tg.dmg >= PK[tg.name][5]:
                self.remove_ours(tg)
        return self.opp_pr <= 0 or g.active is None

    def strong_opp_turn(self):
        """Lookahead opponent: choose Stamp, retreat and target by Monte Carlo rollouts."""
        st, g = self.st, self.g
        base = dict(attack_ok=self.rng.random() < self.cons,
                    boss_avail=st["boss_left"] > 0 and self.rng.random() < self.p_boss)
        self._seeds = [self.rng.random() for _ in range(self.K)]
        stamp_opts, ret_opts, hm_opts = self.opp_options()
        dec = dict(base)
        for key, opts in (("stamp", stamp_opts), ("retreat", ret_opts), ("hammer", hm_opts)):
            if len(opts) > 1:
                dec[key] = max(opts, key=lambda x: self.eval_dec(dict(dec, **{key: x})))
        if dec["attack_ok"] and st["opp_turn"] + 1 >= self.o["first"] and g.active is not None:
            tgts = ["A"] + ([("B", i) for i in range(len(g.bench))] if dec["boss_avail"] else [])
            if len(tgts) > 1:
                dec["target"] = max(tgts, key=lambda x: self.eval_dec(dict(dec, target=x)))
        return self.opp_turn(dec)

    def eval_dec(self, dec):
        """Opponent win rate of this decision over K rollouts (base policy afterwards).
        Common random numbers: every option is played on the same K futures, so the
        comparison between options is not drowned by luck."""
        score = 0.0
        for k in range(self.K):
            c = copy.deepcopy(self)
            c.strong = False
            c.rng = random.Random(self._seeds[k]); c.g.rng = c.rng
            ended = c.opp_turn(dec)
            c.half += 1
            r = "lose" if ended else c.play()
            score += 1.0 if r == "lose" else (0.5 if r == "tie" else 0.0)
        return score / self.K

    # ---------------------------------------------------------------- our side
    def swap_in(self, mon):
        g = self.g
        if g.active is not mon:
            g.bench.remove(mon); g.bench.append(g.active); g.active = mon

    def hit(self, targets):
        pool = self.alive[:3] + self.bench
        objs = [(pool[j], d) for j, d in targets if j < len(pool)]
        for u, d in objs:
            u["dmg"] += d
        for u, d in objs:
            if u["dmg"] >= u["hp"]:
                self.our_pr -= u["pr"]; self.st["kod_last"] = True
                if u in self.bench: self.bench.remove(u)
                elif u in self.alive: self.alive.remove(u)

    def belt(self, u):
        return 50 if (self.g.__dict__.get("belt_on") == id(self.g.active) and u["pr"] >= 2) else 0

    def anchor(self, u):
        return 340 if (u["dragon"] and "Clefairy ex" in self.g.names_in_play()) else 170

    def boss_hit(self, j):
        g = self.g
        g.hand.remove("Boss"); g.discard.append("Boss"); g.supporter_used = True
        pool = self.alive[:3] + self.bench
        u = pool[j]
        if u in self.alive:
            self.alive.insert(0, self.alive.pop(self.alive.index(u)))
            self.hit([(0, self.anchor(self.alive[0]) + self.belt(self.alive[0]))])
        else:
            self.hit([(j, 170 + self.belt(u))])

    def banette(self):
        g = self.g
        self.hit([(0, 80)])
        for c in ("Dhelmise", "Telepathic", "Psychic"):
            if c in g.deck:
                g.deck.remove(c); g.hand.append(c); g.shuffle(); break

    def our_turn(self):
        g, st, o, alive, bench = self.g, self.st, self.o, self.alive, self.bench
        st["kod_last"] = False
        if not g.deck:
            return "lose"
        if not alive:
            return "win"
        inplay = alive[:3] + bench
        g.boss_wanted = len(alive) > 1 and any(
            j > 0 and u["hp"] - u["dmg"] <= self.anchor(u) and (u["pr"] >= alive[0]["pr"] or alive[0]["hp"] - alive[0]["dmg"] > self.anchor(alive[0]))
            for j, u in enumerate(inplay))
        fl = alive[0]["hp"] - alive[0]["dmg"]
        g.bb_wanted = alive[0]["pr"] >= 2 and self.anchor(alive[0]) < fl <= self.anchor(alive[0]) + 40
        g.ursa_on = (6 - self.opp_pr) >= 1
        g.ursa_cost = max(0, 5 - (6 - self.opp_pr))
        att = g.play_turn()
        g.item_lock = False
        g.boss_wanted = g.bb_wanted = False
        if g.active is None:
            return "lose"
        if "Maximum Belt" in g.hand and g.active.name == "Dhelmise":
            g.hand.remove("Maximum Belt"); g.belt_on = id(g.active)
        hns = g.hns_discard()
        opts = []

        def ko_value(hits):
            return sum(u["pr"] for u, d in hits if u["hp"] - u["dmg"] <= d)

        if att:
            u = alive[0]
            opts.append((ko_value([(u, self.anchor(u) + self.belt(u))]), 0, "anchor",
                         lambda: self.hit([(0, self.anchor(self.alive[0]) + self.belt(self.alive[0]))])))
            if "Black Belt" in g.hand and not g.supporter_used and g.can_supporter and u["pr"] >= 2:
                def bb():
                    g.hand.remove("Black Belt"); g.discard.append("Black Belt"); g.supporter_used = True
                    self.hit([(0, self.anchor(self.alive[0]) + self.belt(self.alive[0]) + 40)])
                opts.append((ko_value([(u, self.anchor(u) + self.belt(u) + 40)]) + 0.005, 0, "blackbelt", bb))
            if "Boss" in g.hand and not g.supporter_used and g.can_supporter:
                for j in range(1, len(inplay)):
                    v = inplay[j]
                    if v["hp"] - v["dmg"] <= self.anchor(v) + self.belt(v):
                        opts.append((v["pr"] + 0.01, 0, "boss", (lambda jj: lambda: self.boss_hit(jj))(j)))
        elif g.active.name == "Dhelmise" and g.active.energy:
            opts.append((ko_value([(alive[0], 30)]), 0, "anchor30", lambda: self.hit([(0, 30)])))
        if g.active.name == "Banette" and g.active.energy:
            opts.append((ko_value([(alive[0], 80)]), 0.1, "banette", self.banette))
        if hns >= 6:
            sin = [x for x in g.in_play() if x.name == "Sinistcha"]
            if sin and (g.active is sin[0] or g.latias() or RET.get(g.active.name, 9) == 0):
                prot = o.get("protect_bench", 0) and self.rng.random() < o["protect_bench"]
                targets = [(j, 40) for j, u in enumerate(inplay) if not u.get("mist") and (j == 0 or not prot)]
                pz = ko_value([(inplay[j], d) for j, d in targets])
                front_left = alive[0]["hp"] - alive[0]["dmg"]
                setup = 0.5 if (not att or self.anchor(alive[0]) < front_left) and front_left - 40 <= self.anchor(alive[0]) else 0
                opts.append((pz, setup, "matcha", (lambda t, m0: lambda: (self.swap_in(m0), self.hit(t)))(targets, sin[0])))
        if hns >= 13:
            sp = [x for x in g.in_play() if x.name == "Spiritomb"]
            if sp and (g.active is sp[0] or g.latias()):
                cand = sorted([(j, u) for j, u in enumerate(inplay) if not u.get("mist") and u["dmg"] > 0],
                              key=lambda t: -(t[1]["pr"] if 4 * t[1]["dmg"] >= t[1]["hp"] else 0))[:2]
                tg = [(j, 3 * u["dmg"]) for j, u in cand]
                pz = ko_value([(inplay[j], d) for j, d in tg])
                if pz:
                    opts.append((pz + 0.02, 0, "spiritomb", (lambda t, m0: lambda: (self.swap_in(m0), self.hit(t)))(tg, sp[0])))
        ur = [x for x in g.in_play() if x.name == "Ursaluna ex"]
        if ur and not st["ursa_rest"] and len(ur[0].energy) >= g.ursa_cost and not alive[0].get("noex"):
            if g.active is ur[0] or g.latias() or g.active.name in ("Dunsparce", "Poltchageist"):
                opts.append((ko_value([(alive[0], 240)]), 0, "ursa",
                             (lambda m0: lambda: (self.swap_in(m0), self.hit([(0, 240)]), st.update(ursa_rest=True)))(ur[0])))
        if not opts:
            st["ursa_rest"] = False
            return None
        opts.sort(key=lambda t: (t[0], t[1], t[2] == "anchor"), reverse=True)
        best = opts[0]
        if best[2] != "ursa":
            st["ursa_rest"] = False
        best[3]()
        if self.our_pr <= 0 or not alive:
            return "win"
        return None

    # ---------------------------------------------------------------- loop
    def play(self):
        while self.half < 28:
            ours = (self.half % 2 == 0) == self.we_first
            self.half += 1
            if ours:
                r = self.our_turn()
                if r:
                    return r
            else:
                ended = self.strong_opp_turn() if self.strong else self.opp_turn({})
                if ended:
                    return "lose"
        return "win" if self.our_pr < self.opp_pr else ("lose" if self.opp_pr < self.our_pr else "tie")


def game_wr(deck, opp, s, n, seed, strong=False, K=6):
    rng = random.Random(seed)
    w = t = 0
    for i in range(n):
        r = Match(deck, opp, s, rng, we_first=(i % 2 == 0), strong=strong, K=K).play()
        w += r == "win"; t += r == "tie"
    return (w + 0.5 * t) / n


def bo3(p):
    return p * p * (3 - 2 * p)
