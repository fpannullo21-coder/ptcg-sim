import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PageProps } from "../main";
import { bo3, pct } from "../data";
import { swapCandidates, type Swap } from "../suggest";
import type { SimMessage, SuggestItem, SuggestRequest } from "../sim.worker";

/**
 * "Suggeriscimi una variante": scambi di una carta presi dalle altre liste dell'archetipo,
 * provati contro l'avversario scelto. Le migliori ricevono altre partite.
 */
const fmtPts = (x: number) => (x > 0 ? `+${x}` : `${x}`);

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
          <div class="msg" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <strong>Come leggere i risultati</strong>
            <span>Esempio: la tua lista vince 54 match su 100, la variante 65. La variante vince 11 match in più ogni 100: sono gli 11 punti.</span>
            <span>Ma sono partite simulate, non infinite: come lanciando una moneta 10 volte può uscire testa 7 volte, anche una variante può vincere di più solo per pescate fortunate. Per questo il risultato è una forbice: "tra +2 e +20" vuol dire che il guadagno vero sta lì in mezzo.</span>
            <span>Se tutta la forbice è sopra zero, la variante è migliore di sicuro. Se arriva sotto zero, potrebbe anche essere peggiore: va riprovata con più partite.</span>
          </div>
          <span class="sub">Oggi la tua lista vince {Math.round(100 * bo3(result.base.wr))} match su 100 contro {result.opp}, secondo il simulatore ({result.base.games} partite).</span>
          {best.map((it, k) => {
            const before = bo3(it.baseWr), after = bo3(it.wr), dm = after - before;
            // margine di errore in punti di match: due errori standard della differenza, portati da partite a match
            const p0 = Math.min(0.95, Math.max(0.05, it.baseWr));
            const margin = Math.max(1, Math.round(100 * 2 * it.se * 6 * p0 * (1 - p0)));
            const pts = Math.round(100 * dm);
            const level = pts > margin ? "sure" : pts > 0 ? "maybe" : "no";
            const chip = { sure: ["Miglioramento sicuro", "var(--good)"], maybe: ["Forse: da confermare", "var(--neutral)"], no: ["Nessun miglioramento", "var(--bad)"] }[level];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: k ? "1px solid var(--line-soft)" : "none" }}>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>−1 {it.swap.out}, +1 {it.swap.in}</span>
                  <span class="num" style={{ fontSize: 22, flex: "none", color: pts > 0 ? "var(--good)" : "var(--bad)" }}>{pts > 0 ? "+" : ""}{pts} punti</span>
                </span>
                <span><span class="verdict" style={{ color: chip[1], background: `color-mix(in srgb, ${chip[1]} 16%, var(--surface))` }}>{chip[0]}</span></span>
                <span class="sub">
                  Vince {Math.round(100 * after)} match su 100 invece di {Math.round(100 * before)}. Guadagno vero: tra {fmtPts(pts - margin)} e {fmtPts(pts + margin)} punti ({it.games} partite).{" "}
                  {level === "sure" ? "Tutta la forbice è sopra zero: la variante è migliore." : level === "maybe" ? "La forbice arriva sotto zero: potrebbe anche essere peggiore, va riprovata con più partite." : "In queste partite la variante non ha fatto meglio della tua lista."}
                </span>
                <span class="sub">Perché provarla: {it.swap.why}.</span>
                {pts > 0 && (
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
