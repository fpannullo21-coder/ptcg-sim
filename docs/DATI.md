# Dati

| File | Da dove | Come si aggiorna |
| --- | --- | --- |
| `data/cards.json` | database aperto [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data): PS, tipi, attacchi, testi | `npm run import-cards` |
| `data/meta.json` | classifiche dei Regional su [Limitless](https://limitlesstcg.com/tournaments): posizione, giocatore, archetipo, lista | `npm run import-limitless` |
| `decks/<città>-<anno>/` | liste delle prime 32 di ogni Regional, più la lista meglio piazzata di ogni archetipo sopra lo 0,7% | `npm run import-limitless` |
| `data/labs.json` | [Limitless Labs](https://labs.limitlesstcg.com): quote su tutti i giocatori e risultati reali di ogni matchup (vittorie, sconfitte, pareggi) | `npm run import-labs` |

Formato attuale (ottobre 2026): Standard H-I-J, da Temporal Forces a 30th Celebration. Tornei importati: Baltimore, Frankfurt, Brisbane, Recife, Louisville, Nizza.

Per un nuovo Regional: aggiungere il suo id di Limitless allo script `import-limitless` e il suo codice di Labs (es. `0078`) allo script `import-labs` in `package.json`, poi lanciare i due comandi e `npm run meta`.

## Come si usano

- **Quote:** `data/labs.json`, su tutti i giocatori di tutti i tornei importati.
- **Lista rappresentativa di un archetipo:** la meglio piazzata tra quelle in `decks/`.
- **Validazione:** `npm run meta-matrix -- --validate` gioca ogni archetipo contro ogni altro e confronta il risultato con i match reali di Labs. Il pareggio vale un terzo di vittoria, come su Labs; le partite simulate sono convertite in match al meglio delle tre.

Le richieste ai siti sono una ogni 400 ms.
