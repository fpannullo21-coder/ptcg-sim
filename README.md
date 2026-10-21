# ptcg-sim

Simulatore del Pokémon TCG per prepararsi ai tornei: confrontare liste, studiare i matchup e allenare le decisioni al tavolo.

## Obiettivo

Dare in input una lista qualsiasi e ottenere percentuali su quanto funziona, carta per carta, contro il meta del momento. Le carte sono dati: per un mazzo nuovo non serve riscrivere il simulatore, basta aggiungere le carte che mancano.

## Cosa misura

| Domanda | Come risponde |
| --- | --- |
| Quanto vince questa lista? | Win rate contro ogni mazzo del meta e media pesata sulle quote di Limitless |
| Quanto vale questa carta? | Win rate con e senza la carta (−1/+1), e win rate quando la carta viene pescata o giocata |
| Quanto è costante? | Probabilità di setup al turno 2, di arrivare a una soglia (es. 13 nello scarto), di avere carte chiave nei premi |
| Cosa conviene giocare adesso? | Win rate di ogni giocata possibile in una posizione, calcolato dal giocatore forte |

## Strumenti

- **Matrice dei matchup**, aggiornata dopo ogni Regional con le liste e le quote di Limitless.
- **Ottimizzatore di lista:** prova in automatico gli scambi di 1-2 carte e misura quanto valgono sul meta.
- **Allenatore di decisioni:** mostra una posizione, chiede la giocata, confronta la risposta con quella del giocatore forte.
- **Partite contro l'IA.**

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `src/engine/` | Regole del gioco a punti di decisione: stato, azioni legali, turni, KO, premi |
| `src/cards/` | Effetti di base e definizioni delle carte, un modulo per espansione |
| `src/ai/` | Giocatori: base (regole per archetipo) e forte (ricerca Monte Carlo) |
| `src/tools/` | Matrice, ottimizzatore, allenatore, demo |
| `test/` | Test delle regole e delle carte |
| `decks/` | Liste in formato Pokémon TCG Live |
| `data/` | Import di carte, liste e win rate |
| `reports/` | Risultati delle simulazioni |
| `legacy/` | Il modello di Danzica e il primo prototipo in Python |
| `docs/` | Architettura e roadmap |

## Come si usa

Serve Node 22.

```
npm install
npm test              # test delle regole e delle carte
npm run demo          # una partita di prova con registro, più 5.000 partite per misurare la velocità
npm run typecheck     # controllo dei tipi
```

## Destinazione

Un sito: privato fino a dicembre 2026, poi beta chiusa, poi pubblico e gratuito, senza immagini delle carte. Il motore è in TypeScript perché lo stesso codice gira nel browser (partite, puzzle, simulazioni brevi) e su server o in cloud (matrice completa).

## Principi

1. **Un solo motore per i due giocatori.** Nessun avversario "semplificato": entrambi giocano con le stesse regole e le stesse carte.
2. **Ogni carta ha un test** che riproduce il testo stampato.
3. **I risultati si confrontano sempre con i dati reali** di Limitless Labs. Se un matchup simulato si discosta di più di 8-10 punti, c'è un errore da trovare.
