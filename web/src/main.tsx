import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "./styles.css";
import { analyze, loadData, type Data } from "./data";
import { loadActive, loadLists, newId, saveActive, saveLists, type MyList } from "./lists";
import { Footer, Nav, type Route } from "./components/ui";
import { MazzoPage } from "./pages/Mazzo";
import { MatchupPage } from "./pages/Matchup";
import { VariantiPage } from "./pages/Varianti";
import { ConsistenzaPage } from "./pages/Consistenza";
import { AllenatorePage } from "./pages/Allenatore";
import { LegalePage } from "./pages/Legale";
import type { SimMessage, SimRequest } from "./sim.worker";
import { formatDeck, parseDeck } from "../../src/data/decklist";

const ROUTES: Route[] = ["mazzo", "matchup", "varianti", "consistenza", "allenatore", "legale"];
const routeOf = (): Route => {
  const r = location.hash.replace(/^#\/?/, "") as Route;
  return ROUTES.includes(r) ? r : "matchup";
};

export interface SimState {
  tag: string;
  running: boolean;
  done: number;
  total: number;
  results: Record<string, Record<string, { wins: number; games: number }>>;
  error?: string;
}
export type RunSim = (tag: string, req: Omit<SimRequest, "cardsUrl">) => void;

/** Chiave di una lista indipendente da come è scritta (ordine, nomi, stampe). */
export const deckKey = (data: Data, text: string) => formatDeck(parseDeck(text, data.db));

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(routeOf());
  const [lists, setLists] = useState<MyList[]>(loadLists);
  const [activeId, setActiveId] = useState<string | null>(() => loadActive() ?? null);
  const [sim, setSim] = useState<SimState>({ tag: "", running: false, done: 0, total: 0, results: {} });
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    loadData().then(setData).catch(e => setErr(String(e)));
    const on = () => { setRoute(routeOf()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // lista in uso: una delle mie liste, altrimenti un esempio (la lista tipo dell'archetipo più giocato)
  const active = lists.find(l => l.id === activeId) ?? lists[0] ?? null;
  const example = data?.meta.archetypes[0];
  const deckText = active?.text ?? example?.list ?? "";
  const deckName = active?.name ?? (example ? `Esempio: ${example.name} (${example.place})` : "");
  const analyzed = useMemo(() => (data && deckText ? analyze(data, deckText, active?.archetype ?? "") : null), [data, deckText, active?.archetype]);

  const store = (l: MyList[]) => { setLists(l); saveLists(l); };
  const selectList = (id: string) => { setActiveId(id); saveActive(id); };
  const upsertList = (x: Omit<MyList, "id" | "updated"> & { id?: string }) => {
    const id = x.id ?? newId();
    const item: MyList = { id, name: x.name.trim() || "Lista senza nome", archetype: x.archetype, text: x.text, updated: Date.now() };
    store(lists.some(l => l.id === id) ? lists.map(l => (l.id === id ? item : l)) : [item, ...lists]);
    selectList(id);
    return id;
  };
  const deleteList = (id: string) => {
    const rest = lists.filter(l => l.id !== id);
    store(rest);
    if (activeId === id && rest[0]) selectList(rest[0].id);
  };
  /** Una lista nuova (da una lista dei Regional o da un suggerimento) diventa una delle mie liste e va in uso. */
  const useDeck = (text: string, name = "Nuova lista", archetype = "") => { upsertList({ name, archetype, text }); };

  const runSim: RunSim = (tag, req) => {
    worker.current?.terminate();
    const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setSim({ tag, running: true, done: 0, total: req.lists.length * req.opponents.length * req.games, results: {} });
    w.onmessage = (ev: MessageEvent<SimMessage>) => {
      const m = ev.data;
      setSim(s => {
        if (s.tag !== tag) return s;
        if (m.type === "progress") return { ...s, done: m.done, total: m.total };
        if (m.type === "result") return { ...s, results: { ...s.results, [m.id]: { ...(s.results[m.id] ?? {}), [m.vs]: { wins: m.wins, games: m.games } } } };
        if (m.type === "done") return { ...s, running: false };
        if (m.type === "error") return { ...s, running: false, error: m.message };
        return s;
      });
      if (m.type === "done" || m.type === "error") w.terminate();
    };
    w.postMessage({ ...req, type: "sim", cardsUrl: new URL("./data/cards.json", location.href).href });
  };
  const stopSim = () => { worker.current?.terminate(); setSim(s => ({ ...s, running: false })); };

  if (err) return <div class="app"><div class="page"><p class="msg err">Non riesco a caricare i dati: {err}</p></div></div>;
  if (!data || !analyzed) return <div class="app"><div class="page"><p class="sub">Carico le carte e il meta…</p></div></div>;

  const props = { data, analyzed, deckText, deckName, useDeck, sim, runSim, stopSim, lists, active, selectList, upsertList, deleteList };
  const sources = `Dati dei tornei: ${data.meta.sources.tournaments}. Matchup reali: ${data.meta.sources.matchups}.`;
  return (
    <div class="shell">
    <Nav route={route} />
    <div class="app">
      <header class="top">
        <span class="brand">PTCG Sim <span class="beta">Beta</span></span>
        <a href="#/mazzo" class="list-pill" title="Cambia lista">{deckName}</a>
      </header>
      <main>
        {route === "mazzo" && <MazzoPage {...props} />}
        {route === "matchup" && <MatchupPage {...props} />}
        {route === "varianti" && <VariantiPage {...props} />}
        {route === "consistenza" && <ConsistenzaPage {...props} />}
        {route === "allenatore" && <AllenatorePage {...props} />}
        {route === "legale" && <LegalePage data={data} />}
      </main>
      <Footer sources={sources} />
    </div>
    </div>
  );
}

export type PageProps = {
  data: Data;
  analyzed: NonNullable<ReturnType<typeof analyze>>;
  deckText: string;
  deckName: string;
  useDeck: (text: string, name?: string, archetype?: string) => void;
  lists: MyList[];
  active: MyList | null;
  selectList: (id: string) => void;
  upsertList: (x: Omit<MyList, "id" | "updated"> & { id?: string }) => string;
  deleteList: (id: string) => void;
  sim: SimState;
  runSim: RunSim;
  stopSim: () => void;
};

render(<App />, document.getElementById("app")!);
