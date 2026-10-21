# Architettura

## Stato della partita (`engine/state.py`)

- `GameState`: due `PlayerState`, giocatore di turno, numero di turno, Stadio in gioco, vincitore, generatore casuale.
- `PlayerState`: mazzo, mano, premi, scarti, Pokémon attivo, panchina (massimo 5), indicatori del turno (Supporter giocato, Energia attaccata, ritirata fatta, Stadio giocato).
- `InPlay`: un Pokémon in campo con la pila di evoluzione, le Energie e gli Strumenti attaccati, i segnalini, le condizioni speciali e il turno in cui è entrato in campo.

## Carte (`cards/`)

- `CardDef`: nome, tipo di carta, sottotipo (Base, Fase 1, Fase 2, Oggetto, Supporter, Stadio, Strumento, Energia base o speciale), PS, tipo, debolezza, resistenza, ritirata, attacchi, Abilità, premi dati al KO (1, 2 per gli ex, 3 per i Mega ex), da chi evolve.
- Gli effetti sono funzioni Python composte da una libreria di primitive (`cards/effects.py`): pescare, cercare nel mazzo, scartare, fare danno, piazzare segnalini, curare, cambiare il Pokémon attivo, accelerare Energie, bloccare Abilità o Oggetti.
- Quando un effetto richiede una scelta (quali carte scartare, quale bersaglio), chiede al giocatore tramite `game.choose(...)`. Così la stessa carta funziona con qualsiasi IA.

## Regole (`engine/rules.py`)

- `legal_actions(state)`: elenco di tutte le azioni legali del giocatore di turno.
- `step(state, action)`: applica l'azione e le sue conseguenze (KO, premi, promozione, fine partita).
- Fine partita: premi finiti, nessun Pokémon in campo, impossibile pescare a inizio turno.
- Primo turno: chi inizia non attacca e non gioca Supporter.

## Giocatori (`ai/`)

- Interfaccia unica: `choose_action(state, actions)` e `choose(state, kind, options, k)`.
- `RandomAgent`: per i test.
- Giocatore base: regole per archetipo (cosa cercare, cosa scartare, chi attaccare).
- Giocatore forte: per ogni decisione importante gioca molte continuazioni della partita con il giocatore base e sceglie l'azione che vince di più. Le carte nascoste dell'avversario vengono estratte a caso tra quelle compatibili con la sua lista (determinizzazione).

## Validazione

Per ogni matchup del meta: win rate simulato tra giocatori forti contro win rate reale di Limitless Labs. Gli scostamenti grandi indicano carte o archetipi da correggere.
