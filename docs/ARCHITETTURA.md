# Architettura

Motore in TypeScript (`src/`). Lo stesso codice gira in Node per le simulazioni lunghe e nel browser per il sito.

## Punti di decisione (`src/engine/game.ts`)

Tutta la partita è un generatore. Ogni volta che serve una scelta (un'azione del turno, quali carte cercare, chi promuovere, cosa scartare) il motore si ferma con `yield` e restituisce una `Decision`:

```ts
{ player, kind, options, min, max }
```

La risposta è un elenco di indici in `options`. `Match` tiene la storia delle risposte. Con lo stesso seme e le stesse risposte la partita si riproduce identica: `match.clone()` copia una partita in qualsiasi punto, anche a metà di un effetto. È ciò che serve al giocatore forte per esplorare ogni alternativa, all'allenatore per salvare una posizione e al sito per i replay.

## Stato (`src/engine/types.ts`)

Solo dati semplici: si può copiare, salvare, confrontare e mandare al browser.

- `State`: due `Player`, turno, giocatore di turno, chi ha iniziato, Stadio, vincitore, stato del generatore casuale.
- `Player`: mazzo, mano, premi, scarti, attivo, panchina, indicatori del turno.
- `Mon`: un Pokémon in campo con pila di evoluzione, Energie, Strumenti, danni, condizioni, Abilità usate.
- Le carte sono numeri; `State.cards[n]` è l'id della definizione (es. `PBL-6`) nel registro.

## Carte (`src/cards/`)

- `CardDef`: i numeri della carta (PS, tipo, debolezza, ritirata, costi e danni) arrivano dall'import del database aperto delle carte; a mano si scrive solo l'effetto.
- Gli effetti sono generatori composti da `effects.ts`: pescare, cercare, scartare dal mazzo, scartare dalla mano, recuperare, segnalini, cura, cambio, Boss's Orders, Energie dagli scarti.
- Ogni carta ha un test che ne verifica il testo.

## Giocatori (`src/ai/`)

- Interfaccia unica: `decide(g, decision) -> number[]`.
- `RandomAgent` per i test, `GreedyAgent` come base minima.
- Giocatore base per archetipo: regole generali più un piano del mazzo (cosa mettere in campo, chi attacca, cosa tenere e scartare).
- Giocatore forte: per ogni decisione importante clona la partita, gioca molte continuazioni con il giocatore base e sceglie la giocata che vince di più. Le carte nascoste dell'avversario vengono ipotizzate partendo dalla sua lista (determinizzazione), così l'IA non bara.

## Validazione

Per ogni matchup del meta: win rate simulato tra giocatori forti contro win rate reale di Limitless Labs. Uno scostamento oltre 8-10 punti segnala una carta o un piano di gioco da correggere.
