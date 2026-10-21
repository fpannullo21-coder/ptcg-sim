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
| `engine/` | Regole del gioco: stato della partita, azioni legali, turni, KO, premi |
| `cards/` | Definizioni ed effetti delle carte, un modulo per espansione, ognuna con il suo test |
| `decks/` | Liste in formato Pokémon TCG Live |
| `ai/` | Giocatori: base (regole per archetipo) e forte (ricerca Monte Carlo) |
| `data/` | Import da Limitless (liste, risultati) e Limitless Labs (win rate) |
| `tools/` | Matrice, ottimizzatore, allenatore |
| `reports/` | Risultati delle simulazioni |
| `tests/` | Test delle regole e delle carte |
| `legacy/danzica_model/` | Il modello usato per preparare Danzica (Hide n' Sneak contro avversari semplificati) |
| `docs/` | Architettura e roadmap |

## Come si usa (in arrivo con la fase 0)

```
python -m pytest tests          # test delle regole
python -m tools.demo            # una partita di prova tra due mazzi
```

## Principi

1. **Un solo motore per i due giocatori.** Nessun avversario "semplificato": entrambi giocano con le stesse regole e le stesse carte.
2. **Ogni carta ha un test** che riproduce il testo stampato.
3. **I risultati si confrontano sempre con i dati reali** di Limitless Labs. Se un matchup simulato si discosta di più di 8-10 punti, c'è un errore da trovare.
