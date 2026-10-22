import { useState } from "preact/hooks";
import type { PageProps } from "../main";
import { load, pct, save, type SideView } from "../data";
import { BenchTile, MiniCard } from "../components/ui";

function Side({ title, side, hand }: { title: string; side: SideView; hand?: string[] }) {
  return (
    <div class="side">
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
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
    </div>
  );
}

export function AllenatorePage({ data }: PageProps) {
  const tr = data.trainer;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState<{ right: number; done: number }>(() => {
    try { return JSON.parse(load("ptcg.trainer") ?? "") ?? { right: 0, done: 0 }; } catch { return { right: 0, done: 0 }; }
  });
  if (!tr || !tr.positions.length) return <div class="page"><h1 class="h1">Allenatore</h1><p class="sub">Nessuna posizione disponibile.</p></div>;

  const p = tr.positions[i % tr.positions.length];
  const pos = p.position;
  const best = Math.max(...p.options.map(o => o.wr));
  const pick = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    const right = p.options[k].wr >= best - 0.02;
    const s = { right: score.right + (right ? 1 : 0), done: score.done + 1 };
    setScore(s);
    save("ptcg.trainer", JSON.stringify(s));
  };
  const next = () => { setI(i + 1); setPicked(null); window.scrollTo(0, 0); };
  const right = picked !== null && p.options[picked].wr >= best - 0.02;
  const bestOpt = p.options.find(o => o.wr === best)!;
  const teamName = data.meta.team[0]?.name ?? "la lista";

  return (
    <div class="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span class="h1" style={{ fontSize: 18 }}>Allenatore</span>
          <span class="sub">contro {p.vs} · posizione {(i % tr.positions.length) + 1} di {tr.positions.length}</span>
        </span>
        <span class="num box" style={{ fontSize: 18, padding: "8px 12px", color: "var(--accent)" }} aria-label={`${score.right} giuste su ${score.done}`}>{score.right}/{score.done}</span>
      </div>
      <p class="sub">Posizione da una partita simulata con {teamName}. Per ogni mossa, {p.rollouts} partite giocate fino in fondo dal simulatore, con le carte nascoste rimescolate ogni volta.</p>

      <Side title={`Avversario · ${p.vs}`} side={pos.opp} />
      <Side title="Tu" side={pos.me} hand={pos.hand} />
      {pos.stadium && <span class="sub">Stadio in gioco: {pos.stadium}</span>}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Turno {Math.ceil(pos.turn / 2)}, tocca a te. Cosa fai adesso?</span>
        <span class="sub">
          {pos.energyAttached ? "Hai già attaccato l'Energia del turno. " : ""}
          {pos.supporterPlayed ? "Hai già giocato un Supporter. " : ""}
          Scegli la prossima azione; il resto del turno lo gioca il simulatore.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {p.options.map((o, k) => {
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
      {picked !== null && (
        <div class="box" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 700, color: right ? "var(--good)" : "var(--bad)" }}>
            {right ? "Giusto: è la mossa che vince di più." : `Si poteva fare meglio: "${bestOpt.label}" vince il ${pct(best, 0)}.`}
          </span>
          <span class="sub">Le percentuali vengono dal simulatore, che gioca ancora alcuni mazzi peggio della realtà: differenze sotto i 5 punti sono quasi pari.</span>
        </div>
      )}
      <div class="row-btns">
        <button class="btn" onClick={() => setPicked(null)} disabled={picked === null}>Riprova</button>
        <button class="btn primary" onClick={next}>Prossima posizione</button>
      </div>
    </div>
  );
}
