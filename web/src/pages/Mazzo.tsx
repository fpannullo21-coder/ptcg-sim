import { useMemo, useState } from "preact/hooks";
import type { PageProps } from "../main";
import { analyze, pct } from "../data";
import type { MyList } from "../lists";

type Draft = { id?: string; name: string; archetype: string; text: string };

/** Nuova lista o modifica: nome, archetipo (automatico o scelto), testo di Live. */
function Editor({ data, draft, onSave, onCancel }: Pick<PageProps, "data"> & { draft: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const a = useMemo(() => (d.text.trim() ? analyze(data, d.text, d.archetype) : null), [d.text, d.archetype]);
  return (
    <div class="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontWeight: 600, fontSize: 17 }}>{d.id ? "Modifica la lista" : "Nuova lista"}</span>
      <div class="field">
        <label for="l-name">Nome</label>
        <input id="l-name" type="text" value={d.name} placeholder="Es. Hide n' Sneak di Francesco" onInput={e => setD({ ...d, name: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="field">
        <label for="l-arch">Archetipo</label>
        <select id="l-arch" value={d.archetype} onChange={e => setD({ ...d, archetype: (e.target as HTMLSelectElement).value })}>
          <option value="">Riconosci in automatico{a && !a.manual ? ` (${a.archetype ?? "nessuno"})` : ""}</option>
          {data.meta.archetypes.map(x => <option value={x.name}>{x.name}</option>)}
          <option value="-">Altro (nessun archetipo del meta)</option>
        </select>
      </div>
      <div class="field">
        <label for="deck-text">Lista, copiata da Pokémon TCG Live</label>
        <textarea id="deck-text" value={d.text} spellcheck={false} placeholder={"Pokémon: 20\n4 Dreepy TWM 128\n…\n\nTrainer: 32\n…\n\nEnergy: 8\n…"} onInput={e => setD({ ...d, text: (e.target as HTMLTextAreaElement).value })}></textarea>
      </div>
      {a && (a.check.ok
        ? <div class="msg">{a.check.total} carte, lista legale.</div>
        : <div class="msg err">{a.check.errors.slice(0, 3).join(" · ")}</div>)}
      <div class="row-btns">
        <button class="btn" onClick={onCancel}>Annulla</button>
        <button class="btn primary" disabled={!d.text.trim()} onClick={() => onSave(d)}>Salva e usa</button>
      </div>
    </div>
  );
}

function ListRow({ l, on, data, onUse, onEdit, onDelete }: { l: MyList; on: boolean; data: PageProps["data"]; onUse: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const a = useMemo(() => analyze(data, l.text, l.archetype), [l]);
  return (
    <div class={`mylist${on ? " on" : ""}`}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 16, minWidth: 0, overflowWrap: "anywhere" }}>{l.name}</span>
        {on && <span class="verdict" style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 16%, var(--surface))" }}>In uso</span>}
      </span>
      <span class="sub">
        {a.archetype ?? "nessun archetipo del meta"}{a.manual ? " (scelto da te)" : ""} · {a.check.total} carte{a.check.ok ? "" : " · da correggere"} · aggiornata il {new Date(l.updated).toLocaleDateString("it-IT")}
      </span>
      {confirm ? (
        <span class="row-btns">
          <span class="sub" style={{ flexBasis: "100%" }}>Eliminare "{l.name}"? Non si può annullare.</span>
          <button class="btn" onClick={() => setConfirm(false)}>No, tienila</button>
          <button class="btn" style={{ color: "var(--bad)" }} onClick={onDelete}>Sì, elimina</button>
        </span>
      ) : (
        <span class="row-btns">
          {!on && <button class="btn primary" onClick={onUse}>Usa</button>}
          <button class="btn" onClick={onEdit}>Modifica</button>
          <button class="btn" onClick={() => setConfirm(true)}>Elimina</button>
        </span>
      )}
    </div>
  );
}

export function MazzoPage(props: PageProps) {
  const { data, analyzed, lists, active, deckName, selectList, upsertList, deleteList, useDeck } = props;
  const [editing, setEditing] = useState<Draft | null>(null);
  const { deck, check, coverage, archetype } = analyzed;
  const sections: [string, (s: string) => boolean][] = [["Pokémon", s => s === "Pokémon"], ["Allenatori", s => s === "Trainer"], ["Energie", s => s === "Energy"]];
  const cov = coverage.total ? coverage.complete / coverage.total : 0;
  const [event, setEvent] = useState("");
  const [archFilter, setArchFilter] = useState("");
  const [shown, setShown] = useState(12);
  const events = useMemo(() => [...new Set(data.meta.lists.map(l => l.event))], [data]);
  const archs = useMemo(() => [...new Set(data.meta.lists.map(l => l.archetype))].sort(), [data]);
  const found = data.meta.lists.filter(l => (!event || l.event === event) && (!archFilter || l.archetype === archFilter));
  const known = (a: string) => (data.meta.archetypes.some(x => x.name === a) ? a : "");
  const save = (d: Draft) => { upsertList(d); setEditing(null); window.scrollTo(0, 0); };

  return (
    <div class="page">
      <div class="split">
        <div class="col">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h1 class="h1">Le mie liste</h1>
            {!editing && <button class="btn primary" onClick={() => setEditing({ name: "", archetype: "", text: "" })}>Nuova lista</button>}
          </div>
          <p class="sub">Dai un nome a ogni lista, scegli l'archetipo o lascialo riconoscere al sito, e incolla la lista da Pokémon TCG Live. Le liste restano solo in questo browser.</p>

          {editing && <Editor data={data} draft={editing} onSave={save} onCancel={() => setEditing(null)} />}

          {!lists.length && !editing && (
            <div class="msg">Non hai ancora liste salvate: per ora stai guardando {deckName.replace(/^Esempio: /, "la lista d'esempio ")}. Crea la tua con "Nuova lista", oppure copia una lista dei Regional qui sotto.</div>
          )}
          {lists.map(l => (
            <ListRow l={l} on={active?.id === l.id} data={data}
              onUse={() => selectList(l.id)}
              onEdit={() => { setEditing({ id: l.id, name: l.name, archetype: l.archetype, text: l.text }); window.scrollTo(0, 0); }}
              onDelete={() => deleteList(l.id)} />
          ))}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 class="h1" style={{ fontSize: 18 }}>Copia una lista</h2>
            <p class="sub">{data.meta.lists.length} liste dalle classifiche di Limitless, le prime 32 di ogni Regional del formato. "Copia" la aggiunge alle tue liste, dove puoi rinominarla e modificarla.</p>
            {data.meta.team.length > 0 && (
              <div>
                <div class="section-label">Liste del team</div>
                {data.meta.team.map(t => (
                  <div class="deck-line" style={{ alignItems: "center", padding: "10px 0" }}>
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <button class="btn" style={{ fontSize: 13, padding: "0 14px" }} onClick={() => useDeck(t.list, t.name, "")}>Copia</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div class="field"><label for="f-event">Torneo</label>
                <select id="f-event" value={event} onChange={e => { setEvent((e.target as HTMLSelectElement).value); setShown(12); }}>
                  <option value="">Tutti</option>{events.map(ev => <option value={ev}>{ev}</option>)}
                </select></div>
              <div class="field"><label for="f-arch">Archetipo</label>
                <select id="f-arch" value={archFilter} onChange={e => { setArchFilter((e.target as HTMLSelectElement).value); setShown(12); }}>
                  <option value="">Tutti</option>{archs.map(a => <option value={a}>{a}</option>)}
                </select></div>
            </div>
            <div>
              {found.slice(0, shown).map(l => (
                <div class="deck-line" style={{ alignItems: "center", padding: "10px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span class="num" style={{ fontSize: 22, minWidth: 40, textAlign: "right", color: l.place <= 8 ? "var(--accent)" : "var(--text)" }}>{l.place}°</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.player || "Giocatore"}</span>
                      <span class="sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.archetype} · {l.event} · {l.players} giocatori</span>
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: 6, flex: "none" }}>
                    {l.source && <a class="btn" href={l.source} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", fontSize: 13, padding: "0 12px" }}>Limitless</a>}
                    <button class="btn" style={{ fontSize: 13, padding: "0 14px" }} onClick={() => { useDeck(l.list, `${l.archetype} · ${l.player || `${l.place}° ${l.event}`}`, known(l.archetype)); window.scrollTo(0, 0); }}>Copia</button>
                  </span>
                </div>
              ))}
              {found.length > shown && <button class="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setShown(shown + 24)}>Mostra altre ({found.length - shown})</button>}
              {!found.length && <p class="sub">Nessuna lista con questi filtri.</p>}
            </div>
          </div>

        </div>
        <div class="col">
          <div class="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span class="section-label">In uso</span>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 17, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{deckName}</span>
              <span class="num" style={{ fontSize: 22, flex: "none" }}>{check.total} carte</span>
            </div>
            <span class="sub">
              {archetype ? `Archetipo: ${archetype}${analyzed.manual ? " (scelto da te)" : `, riconosciuto dai Pokémon (${pct(analyzed.similarity, 0)} in comune con la lista tipo)`}.` : "Nessun archetipo del meta: i matchup si possono simulare, ma senza confronto con i dati reali."}
            </span>
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
                <div class="section-label">{title} · {es.reduce((s, e) => s + e.count, 0)} · {deckName}</div>
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
      </div>
    </div>
  );
}
