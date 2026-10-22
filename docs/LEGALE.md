# Regole legali del sito

Regole da rispettare prima di rendere pubblico il sito (beta chiusa o pubblico). Non sono un parere legale: prima del lancio pubblico vanno riviste con un avvocato esperto di proprietà intellettuale, insieme alle linee guida di The Pokémon Company sui contenuti dei fan.

## 1. Niente grafica ufficiale

- Nessuna immagine delle carte, illustrazione, sprite o sagoma dei Pokémon: né scaricata, né collegata da altri siti.
- Nessuna cornice ufficiale delle carte, nessun simbolo ufficiale delle Energie o dei tipi, nessun logo, nessun carattere tipografico ufficiale.
- Le carte si mostrano come **tessere disegnate da noi**: proporzioni da carta, fascia con nome e PS, colore del tipo scelto da noi, costi come pallini con l'iniziale italiana (F = Fuoco, P = Psico, I = Incolore…), riga con debolezza e ritirata. Dove sulla carta c'è l'illustrazione, la tessera mostra dati di gioco (le Energie in campo), mai un disegno.
- Icone dell'interfaccia: solo icone generiche disegnate da noi o da una libreria con licenza libera.

## 2. Nome e marchi

- Il nome e il logo del sito **non contengono "Pokémon"**. "Pokémon TCG" si usa solo nel testo, per dire a cosa serve lo strumento ("simulatore per il gioco di carte collezionabili Pokémon").
- Avviso in fondo a ogni pagina:

  > Sito non ufficiale creato da fan. Non è affiliato, sponsorizzato né approvato da Nintendo, The Pokémon Company, Creatures o GAME FREAK. Pokémon e i nomi dei Pokémon sono marchi dei rispettivi proprietari.

  In inglese: *Unofficial fan-made site. Not affiliated with, sponsored or endorsed by Nintendo, The Pokémon Company, Creatures or GAME FREAK. Pokémon and Pokémon character names are trademarks of their respective owners.*
- Una pagina **Note legali** con lo stesso testo, le fonti dei dati e un contatto per le segnalazioni. Ogni richiesta di rimozione si esegue subito.

## 3. Testi e dati delle carte

- Nel sito: **nome della carta, set, numero e dati di gioco** (PS, tipo, costi, danni, debolezza, resistenza, ritirata), che servono a identificare la carta.
- Il **testo completo degli effetti non si ripubblica**: il sito mostra il nome dell'attacco o dell'Abilità e un riassunto scritto da noi, con un collegamento alla carta sul database ufficiale o su Limitless.
- `data/cards.json` contiene anche i testi delle carte: serve al lavoro nel repository privato e **non va incluso nel pacchetto del sito pubblico**. Per il sito se ne genera una versione senza testi.
- Il database da cui importiamo le carte (github.com/PokemonTCG/pokemon-tcg-data) non indica una licenza. Prima del lancio: chiedere ai manutentori, oppure usare solo i dati di gioco, che sono informazioni di fatto, citando la fonte.

## 4. Dati dei tornei

- Liste, classifiche e risultati vengono da Limitless (limitlesstcg.com, labs.limitlesstcg.com). Prima del lancio pubblico: **chiedere il permesso a Limitless** di mostrare dati derivati, e citare la fonte in ogni pagina che li usa.
- **Nomi dei giocatori**: nel sito pubblico le liste si indicano per torneo e piazzamento (es. "4° Recife"), senza nome e cognome, salvo permesso. Riduce i problemi di privacy (GDPR).

## 5. Gratuito e non commerciale

- Il sito resta gratuito, senza pubblicità e senza vendita di prodotti legati a Pokémon. Le tolleranze verso gli strumenti dei fan valgono soprattutto per i progetti non commerciali.
- Niente partnership o sponsor sul sito senza una verifica legale prima.

## 6. Repository

- Il repository resta privato fino al lancio. Se diventa pubblico, prima si tolgono i dati che non vanno pubblicati (testi delle carte, nomi dei giocatori).

## Stato

| Regola | Mockup del sito | Codice del sito |
| --- | --- | --- |
| Niente grafica ufficiale, tessere nostre | fatto | fatto (`web/src/components/ui.tsx`) |
| Avviso in ogni pagina e Note legali | fatto | fatto; manca l'indirizzo di contatto |
| Nome senza "Pokémon" | "PTCG Sim" provvisorio | nome da scegliere |
| Niente testi completi delle carte | fatto | fatto (`build-web-data`, controllato da `test/web-data.test.ts`) |
| Permesso di Limitless | — | da chiedere prima della beta |
| Licenza del database delle carte | — | da chiedere prima della beta |
| Nomi dei giocatori nascosti | — | fatto per le liste tipo |
