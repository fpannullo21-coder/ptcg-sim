import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PageProps } from "../main";
import { bo3, pct } from "../data";
import { swapCandidates, type Swap } from "../suggest";
import type { SimMessage, SuggestItem, SuggestRequest } from "../sim.worker";

/**
 * "Suggeriscimi una variante": scambi di una carta presi dalle altre liste dell'archetipo,
 * provati contro l'avversario scelto. Le migliori ricevono altre partite.
 */
export function SuggestBox({ data, analyzed, deckText, deckName, active, useDeck, onCompare }: PageProps & { onCompare: (out: string, add: string) => void }) {
  const opps = data.meta.archetypes;
  const [opp, setOpp] = useState(opps[0].name);
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ opp: string; base: { wr: number; games: number }; items: (SuggestItem & { swap: Swap })[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const arch = analyzed.archetype;
  const swaps = useMemo(() => (arch ? swapCandidates(data, deckText, arch) : []), [data, deckText, arch]);

  const run = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("../sim.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setResult(null); setErr(null); setState({ done: 0, total: 1 });
    const a = opps.find(x => x.name === opp)!;
    w.onmessage = (ev: MessageEvent<SimMessage>) => {
      const m = ev.data;
      if (m.type === "progress") setState({ done: m.done, total: m.total });
      if (m.type === "suggest") {
        w.terminate(); setState(null);
        setResult({ opp, base: m.base, items: m.items.map(it => ({ ...it, swap: swaps[Number(it.id)] })) });
      }
      if (m.type === "error") { w.terminate(); setState(null); setErr(m.message); }
    };
    const req: SuggestRequest = {
      type: "suggest", base: deckText, swaps: swaps.map((s, i) => ({ id: String(i), text: s.text })),
      opp: { name: a.name, text: a.list }, first: 24, second: 56, keep: 4, seed: 4242,
      cardsUrl: new URL("./data/cards.json", location.href).href,
    };
    w.postMessage(req);
  };
  const stop = () => { worker.current?.terminate(); setState(null); };

  const best = result?.items.filter(it => it.games > 24) ?? [];
  const games = state ? state.total : (swaps.length + 1) * 24 + 5 * 56;

  return (
    <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontWeight: 600, fontSize: 17 }}>Suggeriscimi una variante</span>
      {!arch ? (
        <span class="sub">Serve un archetipo riconosciuto: i suggerimenti vengono dalle altre liste dello stesso archetipo nei Regional.</span>
      ) : swaps.length === 0 ? (
        <span class="sub">La tua lista è già molto simile alle altre liste {arch}: non ci sono scambi da provare.</span>
      ) : (
        <>
          <span class="sub">Prendo dalle {data.meta.lists.filter(l => l.archetype === arch).length} liste {arch} dei Regional le carte che gli altri giocano più di te, provo {swaps.length} scambi di una carta contro l'avversario scelto e riprovo con più partite i 4 migliori. Circa {games} partite, di solito un minuto o due.</span>
          <div class="field">
            <label for="s-opp">Matchup da migliorare</label>
            <select id="s-opp" value={opp} onChange={e => setOpp((e.target as HTMLSelectElement).value)}>
              {opps.map(a => <option value={a.name}>{a.name}</option>)}
            </select>
          </div>
          {state ? (
            <>
              <div class="progress" role="progressbar" aria-valuenow={state.done} aria-valuemax={state.total}><div style={{ width: `${(100 * state.done) / Math.max(1, state.total)}%` }}></div></div>
              <span class="sub">{state.done} di {state.total} partite</span>
              <button class="btn" onClick={stop}>Ferma</button>
            </>
          ) : (
            <button class="btn primary" onClick={run} disabled={!analyzed.check.ok}>Trova la variante migliore contro {opp}</button>
          )}
        </>
      )}
      {err && <div class="msg err">{err}</div>}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <span class="sub">Contro {result.opp} la tua lista vince {pct(bo3(result.base.wr), 0)} dei match nel simulatore ({result.base.games} partite).</span>
          {best.map((it, k) => {
            const dm = bo3(it.wr) - bo3(it.baseWr);
            const sure = it.delta > 2 * it.se;
            const good = dm > 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: k ? "1px solid var(--line-soft)" : "none" }}>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>−1 {it.swap.out}, +1 {it.swap.in}</span>
                  <span class="num" style={{ fontSize: 22, flex: "none", color: good ? "var(--good)" : "var(--bad)" }}>{good ? "+" : ""}{Math.round(100 * dm)} punti</span>
                </span>
                <span class="sub">Match vinti: da {pct(bo3(it.baseWr), 0)} a {pct(bo3(it.wr), 0)} su {it.games} partite. {good ? (sure ? "Miglioramento probabile." : "Da confermare: la differenza è vicina al rumore.") : "Nessun miglioramento."}</span>
                <span class="sub">{it.swap.why}.</span>
                {good && (
                  <span class="row-btns">
                    <button class="btn" onClick={() => onCompare(it.swap.out, it.swap.in)}>Prova sul meta</button>
                    <button class="btn" onClick={() => useDeck(it.swap.text, `${deckName.replace(/^Esempio: /, "")} (−1 ${it.swap.out}, +1 ${it.swap.in})`, active?.archetype ?? "")}>Salva come nuova lista</button>
                  </span>
                )}
              </div>
            );
          })}
          <span class="sub">Solo simulazione: il simulatore gioca ancora alcuni mazzi peggio della realtà. Prima di cambiare la lista, prova la variante sul meta intero per vedere cosa perdi negli altri matchup.</span>
        </div>
      )}
    </div>
  );
}
