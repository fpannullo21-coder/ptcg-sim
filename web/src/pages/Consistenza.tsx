import { useState } from "preact/hooks";
import type { PageProps } from "../main";
import { allPrized, atLeastOne, pct } from "../data";

/** Probabilità esatte (ipergeometriche) sul mazzo di 60: apertura, pescate, premi. */
export function ConsistenzaPage({ analyzed }: PageProps) {
  const [turn, setTurn] = useState(2);
  const entries = analyzed.deck.entries.filter(e => e.card);
  const N = entries.reduce((s, e) => s + e.count, 0);
  const basics = entries.filter(e => e.card!.supertype === "Pokémon" && e.card!.subtypes.includes("Basic")).reduce((s, e) => s + e.count, 0);
  const mulligan = 1 - atLeastOne(N, basics, 7);
  // raggruppa per nome (ristampe diverse contano insieme)
  const byName = new Map<string, { count: number; kind: string }>();
  for (const e of entries) {
    const n = e.card!.name, k = e.card!.supertype;
    byName.set(n, { count: (byName.get(n)?.count ?? 0) + e.count, kind: k });
  }
  const groups: [string, string][] = [["Pokémon", "Pokémon"], ["Trainer", "Allenatori"], ["Energy", "Energie"]];
  const cards = 7 + turn; // mano iniziale + una pescata per turno (anche chi inizia pesca al primo turno)

  return (
    <div class="page">
      <h1 class="h1">Consistenza</h1>
      <p class="sub">Probabilità calcolate esattamente sulla lista di {N} carte, senza contare le carte che cercano altre carte.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <div class="box">
          <div class="section-label">Mulligan</div>
          <div class="num" style={{ fontSize: 34, color: mulligan > 0.15 ? "var(--bad)" : "var(--good)" }}>{pct(mulligan)}</div>
          <div class="sub">nessun Pokémon Base nelle prime 7 ({basics} Base nel mazzo)</div>
        </div>
        <div class="box">
          <div class="section-label">Carte viste</div>
          <div class="num" style={{ fontSize: 34 }}>{cards}</div>
          <div class="sub">mano iniziale e pescate fino al tuo turno {turn}</div>
        </div>
      </div>

      <div class="seg" role="group" aria-label="Entro quale turno" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {[1, 2, 3, 4].map(t => <button aria-pressed={turn === t} onClick={() => setTurn(t)}>Turno {t}</button>)}
      </div>

      {groups.map(([kind, title]) => {
        const rows = [...byName].filter(([, v]) => v.kind === kind).sort((a, b) => b[1].count - a[1].count);
        if (!rows.length) return null;
        return (
          <div class="scroll-x">
            <table class="t">
              <thead><tr><th>{title}</th><th>Copie</th><th>In mano entro il turno {turn}</th><th>Almeno una nei premi</th><th>Tutte nei premi</th></tr></thead>
              <tbody>
                {rows.map(([name, v]) => {
                  const p = atLeastOne(N, v.count, cards);
                  return (
                    <tr>
                      <td>{name}</td>
                      <td class="num" style={{ fontSize: 16 }}>{v.count}</td>
                      <td class="num" style={{ fontSize: 16, color: p >= 0.6 ? "var(--good)" : p <= 0.3 ? "var(--bad)" : "var(--text)" }}>{pct(p, 0)}</td>
                      <td>{pct(atLeastOne(N, v.count, 6), 0)}</td>
                      <td>{v.count <= 2 ? pct(allPrized(N, v.count), 1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <p class="sub">"In mano" conta solo le carte pescate: le carte di ricerca (Ultra Ball, Poké Pad, Supporter) alzano molto le probabilità reali. Il calcolo con le ricerche arriverà dalle partite simulate.</p>
    </div>
  );
}
