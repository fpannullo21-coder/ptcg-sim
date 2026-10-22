# Il sito

Cartella `web/`: Vite + Preact, stesso motore del simulatore (`src/`), nessuna copia del codice. Pensato prima per il telefono, tema scuro predefinito e chiaro se il sistema lo chiede.

## Pagine

| Pagina | Cosa fa | Dove gira |
| --- | --- | --- |
| Mazzo | Incolli la lista (formato Live) o parti da una lista del meta: controllo di legalità, archetipo riconosciuto, carte che il simulatore sa giocare | browser |
| Matchup | La lista contro i 16 archetipi principali: stima sui dati reali (prima "ancorato"), solo simulato, reale. Le liste già calcolate in cloud si mostrano subito; le altre si simulano nel browser (10, 20 o 50 partite per coppia) | cloud o browser |
| Varianti | **Suggeriscimi una variante**: scegli il matchup da migliorare; dalle liste dello stesso archetipo nei Regional si prendono fino a 16 scambi di una carta (una carta che gli altri giocano più di te al posto di una che giochi più di loro), si provano tutti con 24 partite e i 4 migliori con altre 56. Poi la prova manuale: togli e aggiungi fino a due carte e confronta sul meta, con le stesse partite di partenza | browser |
| Consistenza | Probabilità esatte: mulligan, ogni carta in mano entro il turno 1-4, carte nei premi | browser |
| Allenatore | Posizioni da partite simulate, con mano, campo e scarti di entrambi (Hide 'n' Sneak contati a parte): scegli la mossa, vedi con quale percentuale vince ognuna. 12 posizioni pronte, più quelle nuove generate nel browser contro l'avversario scelto (40 partite per mossa, mezzo minuto-un minuto) | pronte (`trainer.json`) o browser |
| Note legali | Avviso di sito non ufficiale, fonti, segnalazioni | — |

La simulazione nel browser gira in un Web Worker con il giocatore base: circa 20 partite al secondo su un portatile, quindi 320 partite (20 per coppia) in meno di un minuto.

## Dati (`web/public/data/`)

Generati, da rigenerare quando cambiano carte, meta o simulazioni:

```
npm run web:data       # cards.json (carte legali senza testi) e meta.json, dall'ultima validazione in reports/
npm run web:trainer    # trainer.json: 12 posizioni dell'Allenatore (circa 25 minuti)
```

`web:data` scrive la versione privata, con la Lista per Danzica del team. Per la versione pubblica: `npx tsx src/tools/build-web-data.ts` senza `--private`.

Le regole di `docs/LEGALE.md` sono applicate qui: niente testi degli effetti (al loro posto un segnaposto e la chiave delle ristampe), liste tipo indicate per torneo e piazzamento senza nome del giocatore. `test/web-data.test.ts` lo controlla.

## Comandi

```
npm run web:dev        # sito in locale con ricarica automatica
npm run web:build      # controllo dei tipi e build in web/dist/
```

## Da fare

- Pagina Replay.
- Allenatore con le percentuali del giocatore Monte Carlo e più posizioni, anche per altri mazzi.
- Consistenza con le carte di ricerca (dalle partite simulate).
- Nome definitivo del sito (senza "Pokémon") e indirizzo di contatto nelle Note legali.
