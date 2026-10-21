"""Giocatori: casuale (per i test) e un giocatore base con poche regole generali."""
import random


class RandomAgent:
    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_action(self, g, pidx, actions):
        return self.rng.choice(actions)

    def choose(self, g, pidx, kind, options, k, minimum):
        n = self.rng.randint(minimum, k)
        return self.rng.sample(options, n)


class GreedyAgent(RandomAgent):
    """Regole semplici: panchina, evolve, attacca l'energia all'attivo, gioca
    gli Allenatori, poi attacca con l'attacco più forte disponibile."""

    ORDER = ["bench", "evolve", "trainer", "attach", "attack", "retreat", "end"]

    def choose_action(self, g, pidx, actions):
        p = g.players[pidx]
        by = {}
        for a in actions:
            by.setdefault(a.kind, []).append(a)
        if "bench" in by and len(p.bench) < 4:
            return by["bench"][0]
        if "evolve" in by:
            return by["evolve"][0]
        if "trainer" in by:
            return by["trainer"][0]
        if "attach" in by:
            act = [a for a in by["attach"] if a.target == -1]
            return (act or by["attach"])[0]
        if "attack" in by:
            att = p.active.top.attacks
            return max(by["attack"], key=lambda a: att[a.index].damage)
        return by["end"][0]

    def choose(self, g, pidx, kind, options, k, minimum):
        if kind == "setup_active":
            return [max(options, key=lambda c: c.d.hp)]
        if kind == "setup_bench":
            return options[:k]
        if kind == "promote":
            p = g.players[pidx]
            return [max(options, key=lambda t: (len(p.bench[t].energies), p.bench[t].hp_left))]
        if kind == "mulligan_draw":
            return [max(options)]
        return options[:max(minimum, min(k, len(options)))]
