import { useState } from "preact/hooks";
import type { PageProps } from "../main";
import { deckKey } from "../main";
import { anchor, bo3, pct, tone } from "../data";
import { Bar, Dots } from "../components/ui";

type Mode = "anchored" | "sim" | "real";
const LABEL: Record<Mode, string> = { anchored: "Stima", sim: "Simulato", real: "Reale" };
const HELP: Record<Mode, string> = {
  anchored: "Stima: parte dal risultato reale dell'archetipo nei Regional e lo corregge di quanto la simulazione dice che la tua lista fa meglio o peggio della lista tipo. È il numero da guardare.",
  sim: "Percentuale di match vinti secondo il solo simulatore, al meglio delle tre. Utile per confrontare varianti, non ancora affidabile in assoluto.",
  real: "Percentuale di match vinti davvero dall'archetipo nei Regional, da Limitless Labs. Il pareggio vale un terzo.",
};

/** Giudizio in parole: si legge prima del numero. */
export function verdict(v: number): string {
  return v >= 0.65 ? "Molto favorevole" : v >= 0.55 ? "Favorevole" : v > 0.45 ? "Pari" : v > 0.35 ? "Sfavorevole" : "Molto sfavorevole";
}
const outOf10 = (v: number) => String(Math.round(v * 10));

function Verdict({ v, large }: { v: number; large?: boolean }) {
  return <span class={`verdict${large ? " large" : ""}`} style={{ color: tone(v), background: `color-mix(in srgb, ${tone(v)} 16%, var(--surface))` }}>{verdict(v)}</span>;
}

export function MatchupPage({ data, analyzed, deckText, deckName, sim, runSim, stopSim }: PageProps) {
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
    // quanto la simulazione delle liste tipo si discosta dalla realtà in questo matchup (validazione)
    const gap = real && refG !== undefined ? Math.abs(bo3(refG) - real.wr) : null;
    return { a, value, real, mirror: a.name === arch, unreliable: gap !== null && gap > 0.2 };
  });
  const weighted = (() => {
    let s = 0, w = 0;
    for (const r of rows) if (r.value !== null) { s += r.value * r.a.share; w += r.a.share; }
    return w ? s / w : null;
  })();
  // quota del meta a favore, pari e contro (sugli archetipi con un numero)
  const split = (() => {
    let g = 0, e = 0, b = 0;
    for (const r of rows) if (r.value !== null) { if (r.value >= 0.55) g += r.a.share; else if (r.value > 0.45) e += r.a.share; else b += r.a.share; }
    const t = g + e + b || 1;
    return { good: g / t, even: e / t, bad: b / t };
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
      <div class="split">
        <div class="col sticky">
          <a href="#/mazzo" class="box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "var(--text)" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}>{deckName}</span>
              <span class="sub">{arch ?? "archetipo non riconosciuto"} · {analyzed.check.total} carte · cambia lista</span>
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </a>

          <div class="big">
            <span class="sub">{mode === "real" ? "Contro il meta, nei Regional veri" : "Contro il meta"}</span>
            {weighted !== null ? (
              <>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 20, color: "var(--text-2)" }}>vinci circa</span>
                  <span class="big-num">{outOf10(weighted)}</span>
                  <span style={{ fontSize: 20, color: "var(--text-2)" }}>match su 10</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Verdict v={weighted} large />
                  <span class="sub">{pct(weighted)} · {mode === "anchored" ? "stima sui dati reali" : mode === "sim" ? "solo simulazione" : "dati reali"}</span>
                </span>
              </>
            ) : <span class="num" style={{ fontSize: 34, color: "var(--muted)" }}>da simulare</span>}
          </div>

          {weighted !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span class="section-label">Quanti avversari ti sono favorevoli</span>
              <span class="meta-bar" role="img" aria-label={`A favore ${pct(split.good, 0)} del meta, pari ${pct(split.even, 0)}, contro ${pct(split.bad, 0)}`}>
                <span style={{ width: `${split.good * 100}%`, background: "var(--good)" }}></span>
                <span style={{ width: `${split.even * 100}%`, background: "var(--neutral)" }}></span>
                <span style={{ width: `${split.bad * 100}%`, background: "var(--bad)" }}></span>
              </span>
              <span class="legend">
                <span><span class="sw" style={{ background: "var(--good)" }}></span>a favore {pct(split.good, 0)} del meta</span>
                <span><span class="sw" style={{ background: "var(--neutral)" }}></span>pari {pct(split.even, 0)}</span>
                <span><span class="sw" style={{ background: "var(--bad)" }}></span>contro {pct(split.bad, 0)}</span>
              </span>
            </div>
          )}

          {(!simGame || running) && (
            <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontWeight: 600 }}>{running ? "Simulazione in corso" : "Questa lista non è ancora stata simulata"}</span>
              <span class="sub">La simulazione gira in questo browser: {games} partite contro ognuno dei {meta.archetypes.length} archetipi, {games * meta.archetypes.length} partite in tutto. Con {games} partite per avversario ogni matchup ha un margine di errore di circa ±{Math.round(100 / Math.sqrt(games))} punti: il numero vero può essere più alto o più basso di tanto. Il dato su tutto il meta è più stabile.</span>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span class="section-label">Da dove viene il numero</span>
            <div class="seg" role="group" aria-label="Da dove viene il numero">
              {(Object.keys(LABEL) as Mode[]).map(m => <button aria-pressed={mode === m} onClick={() => setMode(m)}>{LABEL[m]}</button>)}
            </div>
            <p class="sub">{HELP[mode]}</p>
            <p class="sub">
              Media pesata sulle quote dei {rows.length} archetipi principali
              {coveredShare < totalShare - 0.01 && weighted !== null ? ` (copre il ${pct(coveredShare / totalShare, 0)} del meta considerato)` : ""}.
              {source ? ` ${source}.` : ""}
            </p>
          </div>
          <p class="sub"><span class="beta">Beta</span> Il simulatore gioca ancora alcuni mazzi peggio della realtà: dove la simulazione delle liste tipo si discosta di oltre 20 punti dai risultati veri, il matchup è segnato come poco affidabile. In media lo scarto oggi è di circa 25 punti.</p>
          <p class="sub">Simulazioni aggiornate al {new Date(meta.updated).toLocaleDateString("it-IT")}. Le liste tipo sono le meglio piazzate nei Regional del formato.</p>
        </div>
        <div class="col">
          <div>
            {rows.map(r => {
              const level = !r.real ? 0 : r.real.n >= 200 ? 3 : r.real.n >= 100 ? 2 : 1;
              return (
                <div class="mrow">
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span class="mname">{r.a.name}{r.mirror ? " (mirror)" : ""}</span>
                      <span class="mmeta">{pct(r.a.share / 100, 0)} del meta · <Dots level={level} />{["nessun dato reale", "pochi match reali", "dato indicativo", "dato solido"][level]}</span>
                      {r.unreliable && mode !== "real" && <span class="mmeta" style={{ color: "var(--bad)" }}>simulazione poco affidabile in questo matchup</span>}
                    </span>
                    {r.value !== null ? (
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "none" }}>
                        <Verdict v={r.value} />
                        <span style={{ fontSize: 13, color: "var(--text-2)" }}><span class="num" style={{ fontSize: 20, color: tone(r.value) }}>{outOf10(r.value)}</span> su 10</span>
                      </span>
                    ) : <span class="sub">da simulare</span>}
                  </span>
                  {r.value !== null && <Bar value={r.value} real={mode !== "real" ? r.real?.wr ?? null : null} color={tone(r.value)} />}
                </div>
              );
            })}
          </div>
          <div class="legend">
            <span>La barra parte dal centro: verso destra a tuo favore, verso sinistra contro.</span>
            <span><span style={{ width: 2, height: 12, background: "var(--text)" }}></span>risultato reale dell'archetipo</span>
          </div>

        </div>
      </div>
    </div>
  );
}
