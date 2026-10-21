import json, sys
import match2
from match2 import game_wr, bo3, TARGET
exec(open("run_meta.py").read().split("N = int")[0])
from match2 import game_wr, bo3, TARGET
LISTS['Vostra (2 Black Belt)'] = L({'Poltchageist':4,'Sinistcha':4,'Clefairy ex':2,'Dhelmise':4,'Latias ex':1,'Shuppet':3,'Banette':4,'Spiritomb':1,'Ursaluna ex':1,
  'Night Stretcher':3,'Poke Pad':3,'Pokegear':2,'Ultra Ball':4,'Prism Tower':3,'Black Belt':2,'Lillie':3,'Explorer':2,'Gwynn':3,'Boss':3,
  'Telepathic':4,'Psychic':3,'Legacy':1})
variant('Vostra (2 Black Belt)', {'Black Belt':1,'Pokegear':2}, {'Shuppet':1,'Explorer':2}, 'Vostra: 1 BB, 4 Shuppet, 4 EG')
variant('Launay (2° Nizza)', {'Spiritomb':1}, {'Gwynn':1}, 'Lista per Danzica')
variant('Lista per Danzica', {'Naveen':1}, {'Black Belt':1}, 'Lista per Danzica +1 Black Belt')
variant('Tua (Legacy)', {'Dudunsparce ex':1}, {'Shuppet':1}, 'Tua Dunsparce')
part = int(sys.argv[1]); NC = int(sys.argv[2]); NE = int(sys.argv[3]); K = int(sys.argv[4])
opps = list(TARGET)[part::2]
base_cal = json.load(open('cal_v5.json'))
refs = ['Launay (2° Nizza)', 'Reddy (4° Louisville)']
def solve_game_p(M):
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo+hi)/2
        lo, hi = (mid, hi) if bo3(mid) < M else (lo, mid)
    return lo
lists = ['Lista per Danzica','Launay (2° Nizza)','Lista per Danzica +1 Black Belt','Vostra (2 Black Belt)','Vostra: 1 BB, 4 Shuppet, 4 EG','Tua Dunsparce','Reddy (4° Louisville)']
out = {}
for opp in opps:
    tgt = solve_game_p(TARGET[opp])
    lo, hi = base_cal[opp] - 0.45, base_cal[opp] + 0.15
    for _ in range(5):
        mid = (lo+hi)/2
        p = sum(game_wr(LISTS[r], opp, mid, NC, 99, strong=True, K=K) for r in refs)/2
        lo, hi = (mid, hi) if p > tgt else (lo, mid)
    s = (lo+hi)/2
    res = {'s': s}
    for name in lists:
        res[name] = bo3(game_wr(LISTS[name], opp, s, NE, 4242, strong=True, K=K))
    out[opp] = res
    print(opp, json.dumps({k: round(v, 3) for k, v in res.items()}), flush=True)
    json.dump(out, open(f'strong_part{part}.json', 'w'), indent=1)
print("DONE", flush=True)
