import random, sys, json
from engine import Game
from lists import LISTS, variant

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20000


def simulate(deck, first, n, seed):
    rng = random.Random(seed)
    r = dict(t1=0, t2=0, by2=0, t3=0, matcha3=0, clef2=0, hns4_t2=0, hns6_t3=0,
             stamp_t3=0, ko_t3=0, dead_t2=0, mull=0)
    for i in range(n):
        g = Game(deck, rng, first)
        r["mull"] += g.mulligans > 0
        a1 = g.play_turn()
        a2 = g.play_turn()
        r["t1"] += a1
        r["t2"] += a2
        r["by2"] += a1 or a2
        r["hns4_t2"] += g.hns_discard() >= 4
        r["clef2"] += "Clefairy ex" in g.names_in_play()
        r["dead_t2"] += not (a1 or a2) and not any(m.name == "Dhelmise" for m in g.in_play())
        # branch A: opponent KOs active, no stamp
        import copy
        gA = copy.deepcopy(g); gA.rng = random.Random(seed * 7 + i)
        gA.opp_ko_active()
        r["ko_t3"] += gA.play_turn()
        # branch B: KO + Unfair Stamp
        gB = copy.deepcopy(g); gB.rng = random.Random(seed * 11 + i)
        gB.opp_ko_active(); gB.unfair_stamp()
        r["stamp_t3"] += gB.play_turn()
        # branch C: undisturbed T3 for Matcha
        a3 = g.play_turn()
        r["t3"] += a3
        r["matcha3"] += ("Sinistcha" in g.names_in_play()) and g.hns_discard() >= 6
        r["hns6_t3"] += g.hns_discard() >= 6
    return {k: round(100 * v / n, 1) for k, v in r.items()}


variant("Francesco attuale", {"Pokegear": 1}, {"Explorer": 1}, "V1 attuale: 2 EG, 1 Gear")
variant("Francesco attuale", {"Yveltal": 1}, {"Shuppet": 1}, "V2 attuale: +Shuppet -Yveltal")
variant("Francesco attuale", {"Pokegear": 2}, {"Naveen": 2}, "V3 attuale: 2 Naveen al posto di Gear")
variant("Francesco attuale", {"Pokegear": 1, "Explorer": 1}, {"Gwynn": 1, "Naveen": 1}, "V4 attuale: 4 Gwynn + Naveen")
variant("Francesco attuale", {"Pokegear": 2, "Yveltal": 1}, {"Gwynn": 1, "Naveen": 1, "Shuppet": 1}, "V5 attuale: 4 Gwynn, Naveen, 4 Shuppet")
variant("Launay (2° Nizza)", {"Spiritomb": 1}, {"Yveltal": 1}, "V6 Launay + Yveltal")
variant("Launay (2° Nizza)", {"Spiritomb": 1, "Prism Tower": 1}, {"Yveltal": 1, "Jamming Tower": 1}, "V7 Launay + Yveltal + Jamming")

if __name__ == "__main__":
    out = {}
    for name, deck in LISTS.items():
        res = {}
        for first in (True, False):
            res["first" if first else "second"] = simulate(deck, first, N, 12345)
        out[name] = res
        f, s = res["first"], res["second"]
        print(f"{name:42s} | 1st: 170@T2 {f['t2']:5.1f} @T3 {f['t3']:5.1f} matcha@T3 {f['matcha3']:5.1f}  clef@T2 {f['clef2']:5.1f}  KO>T3 {f['ko_t3']:5.1f}  Stamp>T3 {f['stamp_t3']:5.1f} "
              f"| 2nd: 170@T1 {s['t1']:5.1f} by T2 {s['by2']:5.1f}")
    json.dump(out, open("results.json", "w"), indent=1)
