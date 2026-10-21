"""Card database for the Hide n' Sneak goldfish simulator.

Only the properties the simulator needs. Texts verified on Limitless (Oct 2026).
"""

POKEMON = {
    # name: (stage, ptype, rulebox, hns, retreat, hp, evolves_from)
    "Shuppet":          ("basic",  "P", False, True,  1, 50,  None),
    "Banette":          ("stage1", "P", False, True,  1, 80,  "Shuppet"),
    "Poltchageist":     ("basic",  "G", False, True,  0, 30,  None),
    "Sinistcha":        ("stage1", "G", False, True,  1, 60,  "Poltchageist"),
    "Dhelmise":         ("basic",  "P", False, False, 3, 140, None),
    "Spiritomb":        ("basic",  "P", False, False, 1, 60,  None),
    "Dunsparce":        ("basic",  "C", False, False, 1, 70,  None),
    "Dudunsparce":      ("stage1", "C", False, False, 3, 140, "Dunsparce"),
    "Dudunsparce ex":   ("stage1", "C", True,  False, 3, 270, "Dunsparce"),
    "Latias ex":        ("basic",  "P", True,  False, 2, 210, None),
    "Clefairy ex":      ("basic",  "P", True,  False, 1, 190, None),
    "Ursaluna ex":      ("basic",  "C", True,  False, 3, 260, None),
    "Yveltal":          ("basic",  "D", False, False, 1, 120, None),
    "Shaymin":          ("basic",  "G", False, False, 1, 80,  None),
    "Patrat":           ("basic",  "C", False, False, 1, 70,  None),
    "Genesect":         ("basic",  "M", False, False, 2, 110, None),
}

ENERGY = {"Telepathic", "Psychic", "Legacy"}
SUPPORTERS = {"Lillie", "Gwynn", "Explorer", "Naveen", "Boss", "Larry"}
STADIUMS = {"Prism Tower", "Jamming Tower", "Gravity Mountain"}
# everything else is an Item / Tool


def is_pokemon(c):
    return c in POKEMON


def is_basic(c):
    return c in POKEMON and POKEMON[c][0] == "basic"


def is_hns(c):
    return c in POKEMON and POKEMON[c][3]


def is_rulebox(c):
    return c in POKEMON and POKEMON[c][2]


def ptype(c):
    return POKEMON[c][1]
