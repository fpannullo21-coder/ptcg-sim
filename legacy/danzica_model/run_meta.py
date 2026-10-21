import sys, json
from match import game_wr, bo3, TARGET, SHARE
from lists import LISTS, L, variant

variant('Launay (2° Nizza)',{'Night Stretcher':1},{'Yveltal':1},'Consigliata')
variant('Consigliata',{'Legacy':1},{'Brilliant Blender':1},'A')
variant('A',{'Yveltal':1,'Naveen':1},{'Genesect':1,'Lucky Helmet':1},'B (Genesect)')
variant('A',{'Yveltal':1,'Naveen':2,'Explorer':1},{'Dunsparce':2,'Dudunsparce':2},'C + Spiritomb')
LISTS['Tua (Mixer)'] = L({'Shuppet':3,'Banette':4,'Poltchageist':3,'Sinistcha':3,'Dhelmise':4,'Dunsparce':2,'Dudunsparce':2,
    'Dudunsparce ex':1,'Clefairy ex':2,'Latias ex':1,'Ursaluna ex':1,
    'Lillie':4,'Gwynn':3,'Explorer':2,'Boss':3,'Ultra Ball':4,'Poke Pad':4,'Night Stretcher':3,'Brilliant Blender':1,'Prism Tower':3,
    'Telepathic':4,'Psychic':3})
variant('Tua (Mixer)',{'Brilliant Blender':1},{'Legacy':1},'Tua (Legacy)')

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
refs = ['Launay (2° Nizza)', 'Reddy (4° Louisville)']

def solve_game_p(M):
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo+hi)/2
        if bo3(mid) < M: lo = mid
        else: hi = mid
    return lo

cal = {}
for opp, M in TARGET.items():
    tgt = solve_game_p(M)
    lo, hi = 0.0, 1.0
    for _ in range(9):
        mid = (lo+hi)/2
        p = sum(game_wr(LISTS[r], opp, mid, N, 99) for r in refs)/len(refs)
        if p > tgt: lo = mid   # too easy for us -> stronger opponent
        else: hi = mid
    cal[opp] = (lo+hi)/2
    print(f"calibrated {opp:22s} s={cal[opp]:.3f}", flush=True)

lists = ['Tua (Mixer)','Tua (Legacy)','C + Spiritomb','B (Genesect)','Launay (2° Nizza)','Reddy (4° Louisville)']
res = {}
for name in lists:
    res[name] = {}
    for opp in TARGET:
        p = game_wr(LISTS[name], opp, cal[opp], N, 2024)
        res[name][opp] = (p, bo3(p))
    tot = sum(SHARE.values())
    meta_g = sum(SHARE[o]*res[name][o][0] for o in TARGET)/tot
    meta_m = sum(SHARE[o]*res[name][o][1] for o in TARGET)/tot
    res[name]['_meta'] = (meta_g, meta_m)
    print(f"{name:24s} meta: partita {100*meta_g:5.1f}%  match {100*meta_m:5.1f}%", flush=True)
json.dump({'cal':cal,'res':res}, open('meta_results.json','w'), indent=1)
