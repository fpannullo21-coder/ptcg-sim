/**
 * Componenti comuni: icone, barra di navigazione, avviso legale, carte disegnate da noi.
 * Le carte non usano grafica ufficiale (docs/LEGALE.md): colori dei tipi scelti da noi,
 * costi come pallini con l'iniziale italiana, nessuna illustrazione.
 */
import type { ComponentChildren } from "preact";
import type { MonView } from "../data";

export const TYPES: Record<string, { c: string; name: string; letter: string }> = {
  G: { c: "#6FCF7F", name: "Erba", letter: "E" },
  R: { c: "#FF8A5C", name: "Fuoco", letter: "F" },
  W: { c: "#5AB8FF", name: "Acqua", letter: "A" },
  L: { c: "#F2D04B", name: "Lampo", letter: "L" },
  P: { c: "#B98CFF", name: "Psico", letter: "P" },
  F: { c: "#D98B5F", name: "Lotta", letter: "Lo" },
  D: { c: "#8A94A6", name: "Oscurità", letter: "O" },
  M: { c: "#A9B6C4", name: "Metallo", letter: "M" },
  N: { c: "#D8B04A", name: "Drago", letter: "D" },
  C: { c: "#C7CDD8", name: "Incolore", letter: "I" },
  "*": { c: "#EDEFF3", name: "qualsiasi tipo", letter: "*" },
};
const T = (k: string) => TYPES[k] ?? TYPES.C;

export function Pill({ type, size = 14 }: { type: string; size?: number }) {
  const t = T(type);
  return (
    <span class="pill" title={`Energia ${t.name}`} aria-label={`Energia ${t.name}`}
      style={{ width: size, height: size, background: t.c, fontSize: Math.max(8, size - (t.letter.length > 1 ? 8 : 6)) }}>
      {t.letter}
    </span>
  );
}

const tint = (c: string, k = 14) => `color-mix(in srgb, ${c} ${k}%, var(--surface))`;

/** Mini-carta: fascia con nome e PS, Energie in gioco al posto dell'illustrazione, attacchi, debolezza e ritirata. */
export function MiniCard({ m }: { m: MonView }) {
  const t = T(m.type);
  const dmg = m.maxHp - m.hp;
  return (
    <div class="card" aria-label={`${m.name}, ${m.hp} PS su ${m.maxHp}`} style={{ background: tint(t.c), borderColor: t.c }}>
      <div>
        <div class="card-stage">{m.stage}</div>
        <div class="card-head">
          <span class="card-name">{m.name}</span>
          <span class="card-hp"><span style={{ fontSize: 10, color: "var(--text-2)" }}>PS</span><span class="num" style={{ fontSize: 20 }}>{m.hp}</span><span class="tdot" style={{ background: t.c }} title={t.name}></span></span>
        </div>
        {dmg > 0 && <div style={{ fontSize: 11, color: "var(--bad)" }}>{dmg} danni subiti</div>}
      </div>
      <div class="card-win">
        <span style={{ fontSize: 10, color: "var(--text-2)" }}>Energie in gioco</span>
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {m.energies.length ? m.energies.map(e => <Pill type={e} size={18} />) : <span style={{ fontSize: 11, color: "var(--muted)" }}>nessuna</span>}
        </span>
        {m.tools.length > 0 && <span style={{ fontSize: 10, color: "var(--text-2)" }}>{m.tools.join(", ")}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {m.attacks.map(a => (
          <span class="card-atk">
            <span style={{ display: "flex", gap: 2, flex: "none" }}>{a.cost.map(c => <Pill type={c} />)}</span>
            <span class="card-atk-name">{a.name}</span>
            <span class="num" style={{ fontSize: 16 }}>{a.damage || ""}</span>
          </span>
        ))}
      </div>
      <div class="card-foot">
        <span>Debolezza {m.weak ? T(m.weak).name : "—"}</span>
        <span>Ritirata {m.retreat}</span>
      </div>
    </div>
  );
}

/** Tessera piccola per la panchina. */
export function BenchTile({ m }: { m: MonView }) {
  const t = T(m.type);
  return (
    <div class="btile" style={{ background: tint(t.c), borderColor: t.c }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflowWrap: "anywhere", minWidth: 0 }}>{m.name}</span>
        <span class="num" style={{ fontSize: 16, flex: "none" }}>{m.hp}</span>
      </span>
      <span class="hpbar" aria-hidden="true"><div style={{ width: `${(100 * m.hp) / Math.max(1, m.maxHp)}%`, background: t.c }}></div></span>
      <span style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 11, color: "var(--text-2)" }}>
        {m.stage}{m.energies.length > 0 && " · "}{m.energies.map(e => <Pill type={e} size={12} />)}
      </span>
    </div>
  );
}

// --- icone (disegnate da noi, tratto semplice) --------------------------------

const icon = (d: ComponentChildren) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>
);
export const ICONS = {
  mazzo: icon(<><rect x="5" y="3" width="11" height="15" rx="2" /><path d="M9 21h8a2 2 0 0 0 2-2V7" /></>),
  matchup: icon(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  varianti: icon(<path d="M7 4v16M17 4v16M4 8h6M14 16h6" />),
  consistenza: icon(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  allenatore: icon(<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />),
};

export type Route = "mazzo" | "matchup" | "varianti" | "consistenza" | "allenatore" | "legale";

export function Nav({ route }: { route: Route }) {
  const items: [Route, string][] = [["mazzo", "Mazzo"], ["matchup", "Matchup"], ["varianti", "Varianti"], ["consistenza", "Consistenza"], ["allenatore", "Allenatore"]];
  return (
    <nav class="nav" aria-label="Sezioni">
      <div class="nav-in">
        {items.map(([r, label]) => (
          <a href={`#/${r}`} aria-current={route === r ? "page" : undefined}>{ICONS[r as keyof typeof ICONS]}{label}</a>
        ))}
      </div>
    </nav>
  );
}

export const DISCLAIMER =
  "Sito non ufficiale creato da fan. Non è affiliato, sponsorizzato né approvato da Nintendo, The Pokémon Company, Creatures o GAME FREAK. Pokémon e i nomi dei Pokémon sono marchi dei rispettivi proprietari. Le carte sono rappresentate solo con nome e dati di gioco.";

export function Footer({ sources }: { sources?: string }) {
  return (
    <footer class="footer">
      {sources && <span>{sources}</span>}
      <span>{DISCLAIMER}</span>
      <a href="#/legale">Note legali e segnalazioni</a>
    </footer>
  );
}

export function Bar({ value, real, color }: { value: number; real?: number | null; color: string }) {
  const left = Math.min(value, 0.5) * 100, width = Math.abs(value - 0.5) * 100;
  return (
    <span class="bar" aria-hidden="true" style={{ display: "block" }}>
      <span class="bar-fill" style={{ left: `${left}%`, width: `${width}%`, background: color }}></span>
      <span class="bar-mid"></span>
      {real != null && <span class="bar-real" style={{ left: `calc(${real * 100}% - 1px)` }}></span>}
    </span>
  );
}

export function Dots({ level }: { level: number }) {
  return <span class="dots" aria-hidden="true">{[1, 2, 3].map(k => <span class={`dot${k <= level ? " on" : ""}`}></span>)}</span>;
}
