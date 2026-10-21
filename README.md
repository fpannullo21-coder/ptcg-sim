# ptcg-sim

Simulatore del Pokémon TCG per prepararsi ai tornei: confrontare liste, studiare i matchup e allenare le decisioni al tavolo.

## Cosa farà

- **Matrice dei matchup** di un mazzo contro il meta, aggiornata dopo ogni Regional con le liste e le quote di Limitless.
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
