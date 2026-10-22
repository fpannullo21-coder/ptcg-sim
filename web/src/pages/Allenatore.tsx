import { useEffect, useRef, useState } from "preact/hooks";
import type { PageProps } from "../main";
import { load, pct, save, type Position, type SideView } from "../data";
import { BenchTile, MiniCard } from "../components/ui";
import type { PositionRequest, SimMessage } from "../sim.worker";

/** Scarti: totale, Pokémon con Hide 'n' Sneak in evidenza, elenco per nome. */
function Discard({ side, open }: { side: SideView; open?: boolean }) {
  const d = side.discard as SideView["discard"] | number;
  if (typeof d === "number") return <span class="sub">Scarti: {d} carte</span>;
  return (
    <details class="discard" open={open}>
      <summary>
        <span>Scarti · {d.total} {d.total === 1 ? "carta" : "carte"}</span>
        {d.hideNSneak > 0 && <span class="verdict" style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 16%, var(--surface))" }}>Hide 'n' Sneak: {d.hideNSneak}</span>}
      </summary>
      {d.cards.length ? (
        <div class="chips" style={{ marginTop: 8 }}>
          {d.cards.map(c => <span class="chip"><span class="num" style={{ fontSize: 15, marginRight: 6 }}>{c.count}</span>{c.name}</span>)}
        </div>
      ) : <p class="sub" style={{ marginTop: 6 }}>Vuoti.</p>}
    </details>
  );
}

function Side({ title, side, hand, openDiscard }: { title: string; side: SideView; hand?: string[]; openDiscard?: boolean }) {
  return (
    <div class="side">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--muted)" }}>
        <span>{title}</span>
        <span>premi {side.prizes} · mano {side.handCount} · mazzo {side.deck}</span>
      </div>
      <div class="side-row">
        {side.active ? <MiniCard m={side.active} /> : <div class="card" style={{ borderColor: "var(--line)" }}>Nessun attivo</div>}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <span class="section-label">Panchina</span>
          {side.bench.length ? side.bench.map(m => <BenchTile m={m} />) : <span class="sub">vuota</span>}
        </div>
      </div>
      {hand && (
        <div class="chips">
          <span style={{ fontSize: 12, color: "var(--muted)", width: "100%" }}>In mano</span>
          {hand.map(h => <span class="chip">{h}</span>)}
        </div>
      )}
      <Discard side={side} open={openDiscard} />
    </div>
  );
}

export function AllenatorePage({ data, deckText, deckName, analyzed }: PageProps) {
  const ready = data.trainer?.positions ?? [];
  const readyList = data.trainer?.list ?? "";
  const [mine, setMine] = useState<Position[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [opp, setOpp] = useState(data.meta.archetypes[0].name);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const [score, setScore] = useState<{ right: number; done: number }>(() => {
    try { return JSON.parse(load("ptcg.trainer") ?? "") ?? { right: 0, done: 0 }; } catch { return { right: 0, done: 0 }; }
  });
  useEffect(() => () => worker.current?.terminate(), []);

  const all = [...mine, ...ready];
  const p = all.length ? all[i % all.length] : null;

  const generate = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("../sim.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setBusy("Carico le carte…"); setErr(null);
    const a = data.meta.archetypes.find(x => x.name === opp)!;
    const t0 = Date.now();
    w.onmessage = (ev: MessageEvent<SimMessage>) => {
      const m = ev.data;
      if (m.type === "status") setBusy(`${m.text} · ${Math.round((Date.now() - t0) / 1000)} s`);
      if (m.type === "position") {
        w.terminate(); setBusy(null);
        if (!m.position) { setErr("In queste partite non ho trovato una scelta che cambi davvero il risultato. Riprova: ogni volta è una partita diversa."); return; }
        setMine(prev => [m.position!, ...prev]); setI(0); setPicked(null); window.scrollTo(0, 0);
      }
      if (m.type === "error") { w.terminate(); setBusy(null); setErr(m.message); }
    };
    const req: PositionRequest = { type: "position", mine: deckText, opp: { name: a.name, text: a.list }, seed: Math.floor(Math.random() * 1e6), rollouts: 40, cardsUrl: new URL("./data/cards.json", location.href).href };
    w.postMessage(req);
  };
  const stop = () => { worker.current?.terminate(); setBusy(null); };

  const pick = (k: number) => {
    if (picked !== null || !p) return;
    setPicked(k);
    const best = Math.max(...p.options.map(o => o.wr));
    const s = { right: score.right + (p.options[k].wr >= best - 0.02 ? 1 : 0), done: score.done + 1 };
    setScore(s);
    save("ptcg.trainer", JSON.stringify(s));
  };
  const next = () => { setI(i + 1); setPicked(null); window.scrollTo(0, 0); };
  const listName = `"${deckName}"`;
  const fromMine = p ? mine.includes(p) : false;

  return (
    <div class="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span class="h1">Allenatore</span>
        <span class="num box" style={{ fontSize: 18, padding: "8px 12px", color: "var(--accent)" }} aria-label={`${score.right} giuste su ${score.done}`}>{score.right}/{score.done}</span>
      </div>

      <div class="split">
        <div class="col">
          <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontWeight: 600 }}>Nuova posizione</span>
            <span class="sub">Il simulatore gioca una partita con {listName} finché arriva una scelta che conta, poi prova ogni mossa giocando 40 partite fino in fondo. Sul telefono serve da mezzo minuto a un minuto.</span>
            <div class="field">
              <label for="t-opp">Avversario</label>
              <select id="t-opp" value={opp} onChange={e => setOpp((e.target as HTMLSelectElement).value)}>
                {data.meta.archetypes.map(a => <option value={a.name}>{a.name}</option>)}
              </select>
            </div>
            {busy ? (
              <>
                <span class="sub" aria-live="polite">{busy}</span>
                <button class="btn" onClick={stop}>Ferma</button>
              </>
            ) : (
              <button class="btn primary" onClick={generate} disabled={!analyzed.check.ok}>Genera una posizione</button>
            )}
            {!analyzed.check.ok && <div class="msg err">La lista ha errori: correggili nella pagina Mazzo.</div>}
            {err && <div class="msg">{err}</div>}
          </div>

          {p && (
            <>
              <span class="sub">
                {fromMine ? "Posizione generata ora" : `Posizione pronta (${readyList.replace(/^.*\//, "").replace(/-/g, " ")})`} · contro {p.vs} · {(i % all.length) + 1} di {all.length}.
                {" "}Per ogni mossa, {p.rollouts} partite giocate fino in fondo dal simulatore, con le carte nascoste rimescolate ogni volta.
              </span>
              <Side title={`Avversario · ${p.vs}`} side={p.position.opp} />
              <Side title="Tu" side={p.position.me} hand={p.position.hand} openDiscard />
              {p.position.stadium && <span class="sub">Stadio in gioco: {p.position.stadium}</span>}
            </>
          )}
        </div>
        <div class="col sticky">
          {p && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>Tocca a te. Cosa fai adesso?</span>
                <span class="sub">
                  Turno {p.position.turn} della partita. {p.position.energyAttached ? "Hai già attaccato l'Energia del turno. " : ""}
                  {p.position.supporterPlayed ? "Hai già giocato un Supporter. " : ""}
                  Scegli la prossima azione; il resto del turno lo gioca il simulatore.
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p.options.map((o, k) => {
                  const best = Math.max(...p.options.map(x => x.wr));
                  const isBest = o.wr === best;
                  const cls = picked === null ? "opt" : isBest ? "opt best" : picked === k ? "opt wrong" : "opt";
                  return (
                    <button class={cls} onClick={() => pick(k)} aria-pressed={picked === k}>
                      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{o.label}</span>
                        {picked !== null && <span class="num" style={{ fontSize: 24, color: isBest ? "var(--good)" : "var(--text-2)" }}>{pct(o.wr, 0)}</span>}
                      </span>
                      {picked !== null && <span class="bar" style={{ display: "block" }}><span class="bar-fill" style={{ left: 0, width: `${o.wr * 100}%`, background: isBest ? "var(--good)" : "var(--muted)" }}></span></span>}
                    </button>
                  );
                })}
              </div>
              {picked !== null && (() => {
                const best = Math.max(...p.options.map(x => x.wr));
                const right = p.options[picked].wr >= best - 0.02;
                const bestOpt = p.options.find(o => o.wr === best)!;
                return (
                  <div class="box" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontWeight: 700, color: right ? "var(--good)" : "var(--bad)" }}>
                      {right ? "Giusto: è la mossa che vince di più." : `Si poteva fare meglio: "${bestOpt.label}" vince il ${pct(best, 0)}.`}
                    </span>
                    <span class="sub">Le percentuali vengono dal simulatore, che gioca ancora alcuni mazzi peggio della realtà: differenze sotto i 5 punti sono quasi pari.</span>
                  </div>
                );
              })()}
              <div class="row-btns">
                <button class="btn" onClick={() => setPicked(null)} disabled={picked === null}>Riprova</button>
                <button class="btn primary" onClick={next}>Prossima posizione</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
