import type { Data } from "../data";
import { DISCLAIMER } from "../components/ui";

export function LegalePage({ data }: { data: Data }) {
  return (
    <div class="page legal">
      <h1 class="h1">Note legali</h1>
      <p>{DISCLAIMER}</p>
      <p lang="en">Unofficial fan-made site. Not affiliated with, sponsored or endorsed by Nintendo, The Pokémon Company, Creatures or GAME FREAK. Pokémon and Pokémon character names are trademarks of their respective owners.</p>

      <h2>Carte</h2>
      <p>Il sito non mostra immagini, illustrazioni, cornici, simboli o loghi ufficiali. Le carte sono tessere disegnate per questo sito, con il nome della carta e i dati di gioco (PS, tipo, costi, danni, debolezza, ritirata) che servono a identificarla. Il testo completo degli effetti non è riprodotto.</p>

      <h2>Dati</h2>
      <p>Liste e classifiche dei tornei: {data.meta.sources.tournaments}. Risultati reali dei matchup: {data.meta.sources.matchups}. Le liste sono indicate per torneo e piazzamento, senza il nome di chi le ha giocate. I numeri simulati sono stime del simulatore e possono essere sbagliati.</p>

      <h2>Uso</h2>
      <p>Il sito è gratuito, senza pubblicità e senza vendita di prodotti. Le liste che incolli restano nel tuo browser e non vengono inviate a nessun server.</p>

      <h2>Segnalazioni</h2>
      <p>Per segnalazioni o richieste di rimozione: [EMAIL DI CONTATTO]. Ogni richiesta viene gestita subito.</p>
    </div>
  );
}
