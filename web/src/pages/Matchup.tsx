import { useState } from "preact/hooks";
import type { PageProps } from "../main";
import { deckKey } from "../main";
import { anchor, bo3, pct, tone } from "../data";
import { Bar, Dots } from "../components/ui";

type Mode = "anchored" | "sim" | "real";
const LABEL: Record<Mode, string> = { anchored: "Ancorato", sim: "Simulato", real: "Reale" };
const HELP: Record<Mode, string> = {
  anchored: "Il dato reale dell'archetipo, spostato di quanto la simulazione dice che la tua lista fa meglio o peggio della lista tipo.",
  sim: "Solo il simulatore, convertito al meglio delle tre. Utile per confrontare varianti, non ancora affidabile in assoluto.",
  real: "Match veri dell'archetipo nei Regional, da Limitless Labs. Il pareggio vale un terzo.",
};

export function MatchupPage({ data, analyzed, deckText, sim, runSim, stopSim }: PageProps) {
  const [mode, setMode] = useState<Mode>("anchored");
  const [games, setGames] = useState(20);
  const meta = data.meta;
  const arch = analyzed.archetype;
  const key = deckKey(data, deckText);

  // da dove vengono i numeri simulati di questa lista
  const team = meta.team.find(t => deckKey(data, t.list) === key);
  const rep = meta.archetypes.find(a => deckKey(data, a.list) === key);
  const mine = sim.tag === `mine:${key}` ? sim.results["mine"] : undefined;
  const simGame: Record<string, number> | null =
    team?.sim ?? (rep ? meta.sim[rep.name] : null) ??
    (mine ? Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, v.wins / v.games])) : null);
  const source = team ? `Simulazione in cloud, ${meta.games} partite per coppia` : rep ? `Lista tipo di ${rep.name} (${rep.place}), ${meta.games} partite per coppia` : mine ? `Simulata nel browser, ${Object.values(mine)[0]?.games ?? games} partite per coppia` : null;

  const rows = meta.archetypes.map(a => {
    const g = simGame?.[a.name];
    const simM = g !== undefined ? bo3(g) : null;
    const real = arch ? meta.real[arch]?.[a.name] : undefined;
    const refG = arch ? meta.sim[arch]?.[a.name] : undefined;
    let anchored: number | null = null;
    if (real && simM !== null && refG !== undefined) anchored = rep?.name === arch ? real.wr : anchor(real.wr, simM, bo3(refG));
    const value = mode === "anchored" ? anchored : mode === "sim" ? simM : real?.wr ?? null;
    return { a, value, real, mirror: a.name === arch };
  });
  const weighted = (() => {
    let s = 0, w = 0;
    for (const r of rows) if (r.value !== null) { s += r.value * r.a.share; w += r.a.share; }
    return w ? s / w : null;
  })();
  const coveredShare = rows.filter(r => r.value !== null).reduce((s, r) => s + r.a.share, 0);
  const totalShare = rows.reduce((s, r) => s + r.a.share, 0);

  const startSim = () => runSim(`mine:${key}`, {
    lists: [{ id: "mine", text: deckText }],
    opponents: meta.archetypes.map(a => ({ name: a.name, text: a.list })),
    games, seed: 1,
  });
  const running = sim.running && sim.tag === `mine:${key}`;

  return (
    <div class="page">
      <a href="#/mazzo" class="box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "var(--text)" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{team?.name ?? rep?.name ?? "La tua lista"}</span>
          <span class="sub">{arch ?? "archetipo non riconosciuto"} · {analyzed.check.total} carte · cambia lista</span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </a>

      <div class="big">
        <span class="sub">{mode === "real" ? "Risultato reale dell'archetipo contro il meta" : `Atteso contro il meta${mode === "anchored" ? ", ancorato ai dati reali" : ", solo simulazione"}`}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          {weighted !== null ? <span class="big-num">{pct(weighted)}</span> : <span class="num" style={{ fontSize: 34, color: "var(--muted)" }}>da simulare</span>}
          <span style={{ fontSize: 15, color: "var(--text-2)" }}>dei match</span>
        </span>
        <span class="sub">
          Media pesata sulle quote dei {rows.length} archetipi principali
          {weighted !== null && coveredShare < totalShare - 0.01 ? ` (copre il ${pct(coveredShare / totalShare, 0)} del meta considerato)` : ""}.
          {source ? ` ${source}.` : ""}
        </span>
      </div>

      <div class="seg" role="group" aria-label="Quale numero mostrare">
        {(Object.keys(LABEL) as Mode[]).map(m => <button aria-pressed={mode === m} onClick={() => setMode(m)}>{LABEL[m]}</button>)}
      </div>
      <p class="sub">{HELP[mode]}</p>

      {(!simGame || running) && (
        <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontWeight: 600 }}>{running ? "Simulazione in corso" : "Questa lista non è ancora stata simulata"}</span>
          <span class="sub">La simulazione gira in questo browser: {games} partite contro ognuno dei {meta.archetypes.length} archetipi, {games * meta.archetypes.length} partite in tutto. Con {games} partite per coppia ogni matchup ha un margine di circa ±{Math.round(100 / Math.sqrt(games))} punti; il dato pesato è più stabile.</span>
          {!analyzed.check.ok && <div class="msg err">La lista ha errori: correggili nella pagina Mazzo prima di simulare.</div>}
          <div class="field">
            <label for="games">Partite per coppia</label>
            <select id="games" value={String(games)} onChange={e => setGames(Number((e.target as HTMLSelectElement).value))}>
              <option value="10">10 (veloce)</option><option value="20">20</option><option value="50">50 (più precisa, più lenta)</option>
            </select>
          </div>
          {running ? (
            <>
              <div class="progress" role="progressbar" aria-valuenow={sim.done} aria-valuemax={sim.total}><div style={{ width: `${(100 * sim.done) / Math.max(1, sim.total)}%` }}></div></div>
              <span class="sub">{sim.done} di {sim.total} partite</span>
              <button class="btn" onClick={stopSim}>Ferma</button>
            </>
          ) : (
            <button class="btn primary" onClick={startSim} disabled={!analyzed.check.ok}>Simula contro il meta</button>
          )}
          {sim.error && <div class="msg err">{sim.error}</div>}
        </div>
      )}

      <div>
        <div class="mrow-grid section-label" style={{ padding: "0 8px 6px" }}>
          <span>Contro</span><span style={{ textAlign: "right" }}>Quota</span><span style={{ textAlign: "right" }}>{LABEL[mode]}</span>
        </div>
        {rows.map(r => {
          const level = !r.real ? 0 : r.real.n >= 200 ? 3 : r.real.n >= 100 ? 2 : 1;
          return (
            <div class="mrow">
              <span class="mrow-grid">
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span class="mname">{r.a.name}{r.mirror ? " (mirror)" : ""}</span>
                  <span class="mmeta"><Dots level={level} />{r.real ? `reale ${pct(r.real.wr)} · ${r.real.n} match` : "nessun dato reale"}</span>
                </span>
                <span style={{ textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{pct(r.a.share / 100)}</span>
                <span class="num" style={{ textAlign: "right", fontSize: 22, color: r.value !== null ? tone(r.value) : "var(--muted)" }}>{r.value !== null ? pct(r.value) : "—"}</span>
              </span>
              {r.value !== null && <Bar value={r.value} real={mode !== "real" ? r.real?.wr ?? null : null} color={tone(r.value)} />}
            </div>
          );
        })}
      </div>
      <div class="legend">
        <span><span class="sw" style={{ background: "var(--good)" }}></span>favorevole</span>
        <span><span class="sw" style={{ background: "var(--bad)" }}></span>sfavorevole</span>
        <span><span style={{ width: 2, height: 12, background: "var(--text)" }}></span>dato reale</span>
        <span><Dots level={3} />affidabilità (match reali)</span>
      </div>
      <p class="sub">Simulazioni aggiornate al {new Date(meta.updated).toLocaleDateString("it-IT")}. Le liste tipo sono le meglio piazzate nei Regional del formato.</p>
    </div>
  );
}
