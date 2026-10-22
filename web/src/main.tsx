import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "./styles.css";
import { analyze, load, loadData, save, type Data } from "./data";
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
  const [deckText, setDeckText] = useState<string>(load("ptcg.deck") ?? "");
  const [sim, setSim] = useState<SimState>({ tag: "", running: false, done: 0, total: 0, results: {} });
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    loadData().then(d => {
      setData(d);
      if (!deckText) setDeckText(d.meta.team[0]?.list ?? d.meta.archetypes[0].list);
    }).catch(e => setErr(String(e)));
    const on = () => { setRoute(routeOf()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const analyzed = useMemo(() => (data && deckText ? analyze(data, deckText) : null), [data, deckText]);

  const useDeck = (text: string) => { setDeckText(text); save("ptcg.deck", text); };

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
        return { ...s, running: false, error: m.message };
      });
      if (m.type === "done" || m.type === "error") w.terminate();
    };
    w.postMessage({ ...req, cardsUrl: new URL("./data/cards.json", location.href).href });
  };
  const stopSim = () => { worker.current?.terminate(); setSim(s => ({ ...s, running: false })); };

  if (err) return <div class="app"><div class="page"><p class="msg err">Non riesco a caricare i dati: {err}</p></div></div>;
  if (!data || !analyzed) return <div class="app"><div class="page"><p class="sub">Carico le carte e il meta…</p></div></div>;

  const props = { data, analyzed, deckText, useDeck, sim, runSim, stopSim };
  const sources = `Dati dei tornei: ${data.meta.sources.tournaments}. Matchup reali: ${data.meta.sources.matchups}.`;
  return (
    <div class="app">
      <header class="top">
        <span class="brand">PTCG Sim{data.meta.private ? " · privato" : ""}</span>
        <span class="sub">{data.meta.format}</span>
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
      <Nav route={route} />
    </div>
  );
}

export type PageProps = {
  data: Data;
  analyzed: NonNullable<ReturnType<typeof analyze>>;
  deckText: string;
  useDeck: (t: string) => void;
  sim: SimState;
  runSim: RunSim;
  stopSim: () => void;
};

render(<App />, document.getElementById("app")!);
