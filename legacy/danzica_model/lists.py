"""Candidate decklists (60 cards each). Names map to sim/cards.py."""

def L(d):
    deck = []
    for k, v in d.items():
        deck += [k] * v
    assert len(deck) == 60, (len(deck), d)
    return deck


LISTS = {
    # Maxime Launay, 2nd Regional Nice (Oct 2026)
    "Launay (2° Nizza)": L({
        "Shuppet": 4, "Banette": 4, "Poltchageist": 4, "Sinistcha": 4, "Dhelmise": 4,
        "Clefairy ex": 2, "Spiritomb": 1, "Latias ex": 1, "Ursaluna ex": 1,
        "Explorer": 4, "Lillie": 3, "Gwynn": 3, "Boss": 3, "Naveen": 2,
        "Ultra Ball": 4, "Poke Pad": 3, "Night Stretcher": 3, "Prism Tower": 2,
        "Telepathic": 4, "Psychic": 3, "Legacy": 1,
    }),
    # Rahul Reddy, 4th Regional Louisville (Oct 2026)
    "Reddy (4° Louisville)": L({
        "Poltchageist": 4, "Sinistcha": 2, "Shuppet": 3, "Banette": 4, "Dhelmise": 4,
        "Dunsparce": 2, "Dudunsparce": 2, "Dudunsparce ex": 1, "Clefairy ex": 2, "Latias ex": 1,
        "Lillie": 4, "Gwynn": 4, "Boss": 3, "Explorer": 2,
        "Ultra Ball": 4, "Poke Pad": 4, "Night Stretcher": 3, "Pokegear": 1, "Prism Tower": 3,
        "Telepathic": 4, "Psychic": 2, "Legacy": 1,
    }),
    # Michael Ledeboer, 74th Regional Nice (8-1-5)
    "Ledeboer (74° Nizza)": L({
        "Shuppet": 4, "Banette": 3, "Dhelmise": 4, "Dunsparce": 3, "Dudunsparce": 2,
        "Dudunsparce ex": 1, "Poltchageist": 2, "Sinistcha": 1, "Patrat": 1, "Latias ex": 1,
        "Ursaluna ex": 1, "Clefairy ex": 1, "Yveltal": 1,
        "Lillie": 4, "Gwynn": 4, "Boss": 3,
        "Poke Pad": 4, "Ultra Ball": 4, "Night Stretcher": 3, "Poffin": 2, "Wondrous Patch": 1,
        "Prism Tower": 2, "Jamming Tower": 1,
        "Telepathic": 4, "Psychic": 2, "Legacy": 1,
    }),
    # Francesco's original list (20 Oct)
    "Francesco originale": L({
        "Dudunsparce": 2, "Poltchageist": 2, "Dudunsparce ex": 1, "Ursaluna ex": 1, "Dhelmise": 4,
        "Latias ex": 1, "Banette": 4, "Dunsparce": 2, "Shaymin": 1, "Clefairy ex": 1,
        "Shuppet": 3, "Sinistcha": 2, "Yveltal": 1,
        "Explorer": 2, "Ultra Ball": 4, "Gwynn": 3, "Night Stretcher": 3, "Prism Tower": 3,
        "Poke Pad": 4, "Pokegear": 2, "Lillie": 4, "Boss": 3,
        "Telepathic": 4, "Legacy": 1, "Psychic": 2,
    }),
    # Current Francesco/Luigi list (after today's changes)
    "Francesco attuale": L({
        "Dhelmise": 4, "Banette": 4, "Shuppet": 3, "Poltchageist": 3, "Sinistcha": 2,
        "Dunsparce": 2, "Dudunsparce": 2, "Dudunsparce ex": 1, "Clefairy ex": 2,
        "Ursaluna ex": 1, "Latias ex": 1, "Yveltal": 1,
        "Lillie": 4, "Gwynn": 3, "Explorer": 1, "Boss": 3,
        "Ultra Ball": 4, "Poke Pad": 4, "Night Stretcher": 3, "Pokegear": 2,
        "Prism Tower": 2, "Jamming Tower": 1,
        "Telepathic": 4, "Psychic": 2, "Legacy": 1,
    }),
}


def variant(base, minus, plus, name):
    d = {}
    for c in LISTS[base]:
        d[c] = d.get(c, 0) + 1
    for c, n in minus.items():
        d[c] -= n
        if d[c] == 0:
            del d[c]
    for c, n in plus.items():
        d[c] = d.get(c, 0) + n
    LISTS[name] = L(d)
    return name
