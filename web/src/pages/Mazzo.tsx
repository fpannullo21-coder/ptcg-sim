import { useState } from "preact/hooks";
import type { PageProps } from "../main";
import { pct } from "../data";

export function MazzoPage({ data, analyzed, deckText, useDeck }: PageProps) {
  const [draft, setDraft] = useState(deckText);
  const { deck, check, coverage, archetype } = analyzed;
  const choices = [
    ...data.meta.team.map(t => ({ label: `${t.name} (team)`, list: t.list })),
    ...data.meta.archetypes.map(a => ({ label: `${a.name} · lista tipo, ${a.place}`, list: a.list })),
  ];
  const sections: [string, (s: string) => boolean][] = [["Pokémon", s => s === "Pokémon"], ["Allenatori", s => s === "Trainer"], ["Energie", s => s === "Energy"]];
  const cov = coverage.total ? coverage.complete / coverage.total : 0;

  return (
    <div class="page">
      <h1 class="h1">Il mio mazzo</h1>
      <p class="sub">Incolla la lista nel formato di Pokémon TCG Live, oppure parti da una lista del meta. La lista resta solo in questo browser.</p>

      <div class="field">
        <label for="meta-list">Parti da una lista</label>
        <select id="meta-list" onChange={e => { const v = (e.target as HTMLSelectElement).value; if (v) { setDraft(v); useDeck(v); } }}>
          <option value="">Scegli…</option>
          {choices.map(c => <option value={c.list}>{c.label}</option>)}
        </select>
      </div>
      <div class="field">
        <label for="deck-text">Lista</label>
        <textarea id="deck-text" value={draft} onInput={e => setDraft((e.target as HTMLTextAreaElement).value)} spellcheck={false}></textarea>
      </div>
      <div class="row-btns">
        <button class="btn primary" onClick={() => useDeck(draft)} disabled={draft === deckText}>Usa questa lista</button>
      </div>

      <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{archetype ?? "Archetipo non riconosciuto"}</span>
          <span class="num" style={{ fontSize: 22 }}>{check.total} carte</span>
        </div>
        <span class="sub">{archetype ? `Riconosciuto dai Pokémon della lista (${pct(analyzed.similarity, 0)} in comune con la lista tipo).` : "Nessun archetipo del meta ha almeno metà dei Pokémon in comune: i matchup si possono simulare, ma senza confronto con i dati reali."}</span>
        {check.errors.map(e => <div class="msg err">{e}</div>)}
        {check.warnings.slice(0, 5).map(w => <div class="msg">{w}</div>)}
        {check.ok && <div class="msg">Lista legale nel formato {data.meta.format}.</div>}
        <div>
          <div class="section-label">Carte che il simulatore sa giocare</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span class="num" style={{ fontSize: 28, color: cov === 1 ? "var(--good)" : "var(--bad)" }}>{pct(cov, 0)}</span>
            <span class="sub">{coverage.complete} di {coverage.total}</span>
          </div>
          {coverage.missing.length > 0 && (
            <p class="sub">Effetti ancora da implementare: {coverage.missing.map(m => `${m.count} ${m.name} (${m.parts.map(p => p.replace(/:.*$/, "")).join(", ")})`).join("; ")}. Nelle simulazioni queste carte giocano senza quell'effetto.</p>
          )}
        </div>
      </div>

      {sections.map(([title, f]) => {
        const es = deck.entries.filter(e => e.card && f(e.card.supertype));
        if (!es.length) return null;
        return (
          <div>
            <div class="section-label">{title} · {es.reduce((s, e) => s + e.count, 0)}</div>
            {es.map(e => (
              <div class="deck-line">
                <span><span class="num" style={{ fontSize: 16, marginRight: 8 }}>{e.count}</span>{e.card!.name}</span>
                <span class="sub">{e.card!.id.split("#")[0]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
