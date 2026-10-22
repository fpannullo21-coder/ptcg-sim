import { useMemo, useState } from "preact/hooks";
import type { PageProps } from "../main";
import { deckKey } from "../main";
import { bo3, pct } from "../data";
import { formatDeck, parseDeck } from "../../../src/data/decklist";
import { SuggestBox } from "../components/Suggest";

/**
 * Varianti: togli e aggiungi fino a due carte e confronta le due liste contro gli archetipi
 * principali, con gli stessi semi (le differenze dipendono dalle carte, non dalla fortuna).
 */
export function VariantiPage(props: PageProps) {
  const { data, analyzed, deckText, sim, runSim, stopSim } = props;
  const names = useMemo(() => [...new Set(data.db.byId.values() ? [...data.db.byId.values()].map(c => c.name) : [])].sort(), [data]);
  const inDeck = analyzed.deck.entries.filter(e => e.card).map(e => e.card!.name);
  const [out1, setOut1] = useState(""), [out2, setOut2] = useState("");
  const [in1, setIn1] = useState(""), [in2, setIn2] = useState("");
  const [games, setGames] = useState(20);
  const [top, setTop] = useState(8);

  const variant = useMemo(() => {
    const deck = parseDeck(deckText, data.db);
    const remove = (n: string) => { const e = deck.entries.find(x => x.card?.name === n); if (e) e.count--; };
    const add = (n: string) => {
      const e = deck.entries.find(x => x.card?.name === n);
      if (e) { e.count++; return true; }
      const p = parseDeck(`1 ${n}`, data.db).entries[0];
      if (!p?.card) return false;
      deck.entries.push(p);
      return true;
    };
    for (const n of [out1, out2]) if (n) remove(n);
    const bad = [in1, in2].filter(n => n && !add(n));
    deck.entries = deck.entries.filter(e => e.count > 0);
    return { text: formatDeck(deck), bad };
  }, [deckText, out1, out2, in1, in2]);

  const changes = [out1, out2].filter(Boolean).length + [in1, in2].filter(Boolean).length;
  const opps = [...data.meta.archetypes].sort((a, b) => b.share - a.share).slice(0, top);
  const tag = `var:${deckKey(data, deckText)}|${deckKey(data, variant.text)}|${games}|${top}`;
  const results = sim.tag === tag ? sim.results : null;
  const running = sim.running && sim.tag === tag;

  const rows = opps.map(a => {
    const b = results?.base?.[a.name], v = results?.variant?.[a.name];
    return { a, b: b ? bo3(b.wins / b.games) : null, v: v ? bo3(v.wins / v.games) : null };
  });
  const w = (k: "b" | "v") => {
    let s = 0, t = 0;
    for (const r of rows) if (r[k] !== null) { s += r[k]! * r.a.share; t += r.a.share; }
    return t ? s / t : null;
  };
  const wb = w("b"), wv = w("v");

  return (
    <div class="page">
      <h1 class="h1">Varianti</h1>
      <div class="split">
        <div class="col sticky">
          <SuggestBox {...props} onCompare={(o, i) => { setOut1(o); setIn1(i); setOut2(""); setIn2(""); document.getElementById("manual")?.scrollIntoView({ behavior: "smooth" }); }} />
        </div>
        <div class="col">
          <h2 id="manual" class="h1" style={{ fontSize: 18 }}>Prova una variante sul meta</h2>
          <p class="sub">Togli e aggiungi fino a due carte: il simulatore gioca la tua lista e la variante contro gli archetipi principali, con le stesse partite di partenza, e mostra cosa cambia.</p>

          <datalist id="cards-in-deck">{[...new Set(inDeck)].map(n => <option value={n} />)}</datalist>
          <datalist id="all-cards">{names.map(n => <option value={n} />)}</datalist>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div class="field"><label for="o1">Togli</label><input id="o1" type="text" list="cards-in-deck" value={out1} onInput={e => setOut1((e.target as HTMLInputElement).value)} placeholder="Carta della lista" /></div>
            <div class="field"><label for="i1">Aggiungi</label><input id="i1" type="text" list="all-cards" value={in1} onInput={e => setIn1((e.target as HTMLInputElement).value)} placeholder="Nome della carta" /></div>
            <div class="field"><label for="o2">Togli (seconda)</label><input id="o2" type="text" list="cards-in-deck" value={out2} onInput={e => setOut2((e.target as HTMLInputElement).value)} /></div>
            <div class="field"><label for="i2">Aggiungi (seconda)</label><input id="i2" type="text" list="all-cards" value={in2} onInput={e => setIn2((e.target as HTMLInputElement).value)} /></div>
          </div>
          {variant.bad.length > 0 && <div class="msg err">Carta non trovata: {variant.bad.join(", ")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div class="field"><label for="vg">Partite per coppia</label>
              <select id="vg" value={String(games)} onChange={e => setGames(Number((e.target as HTMLSelectElement).value))}>
                <option value="10">10</option><option value="20">20</option><option value="50">50</option>
              </select></div>
            <div class="field"><label for="vt">Avversari</label>
              <select id="vt" value={String(top)} onChange={e => setTop(Number((e.target as HTMLSelectElement).value))}>
                <option value="4">i primi 4</option><option value="8">i primi 8</option><option value="16">tutti e 16</option>
              </select></div>
          </div>
          {running ? (
            <div class="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div class="progress"><div style={{ width: `${(100 * sim.done) / Math.max(1, sim.total)}%` }}></div></div>
              <span class="sub">{sim.done} di {sim.total} partite</span>
              <button class="btn" onClick={stopSim}>Ferma</button>
            </div>
          ) : (
            <button class="btn primary" disabled={!changes || variant.bad.length > 0}
              onClick={() => runSim(tag, { lists: [{ id: "base", text: deckText }, { id: "variant", text: variant.text }], opponents: opps.map(a => ({ name: a.name, text: a.list })), games, seed: 7 })}>
              Confronta {2 * games * opps.length} partite
            </button>
          )}

          {results && (
            <div class="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span class="sub">Variante contro la tua lista, pesato sulle quote</span>
                <span class="num" style={{ fontSize: 30, color: wb !== null && wv !== null ? (wv - wb >= 0 ? "var(--good)" : "var(--bad)") : "var(--muted)" }}>
                  {wb !== null && wv !== null ? `${wv - wb >= 0 ? "+" : ""}${(100 * (wv - wb)).toFixed(1).replace(".", ",")} punti` : "…"}
                </span>
              </div>
              <div class="scroll-x">
                <table class="t">
                  <thead><tr><th>Contro</th><th>Tua lista</th><th>Variante</th><th>Differenza</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr>
                        <td>{r.a.name}</td>
                        <td>{r.b !== null ? pct(r.b, 0) : "…"}</td>
                        <td>{r.v !== null ? pct(r.v, 0) : "…"}</td>
                        <td class="num" style={{ fontSize: 16, color: r.b !== null && r.v !== null ? (r.v >= r.b ? "var(--good)" : "var(--bad)") : "var(--muted)" }}>
                          {r.b !== null && r.v !== null ? `${r.v >= r.b ? "+" : ""}${Math.round(100 * (r.v - r.b))}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span class="sub">Match vinti su 100, solo simulazione; i punti sono la differenza tra variante e tua lista. Con {games} partite per avversario il margine di errore del singolo matchup è circa ±{games >= 50 ? 10 : 15} punti: differenze più piccole possono essere solo fortuna delle pescate. Il totale pesato su tutti gli avversari è più stabile, perché somma molte più partite.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
