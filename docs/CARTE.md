# Come si aggiunge una carta

1. **I numeri ci sono già.** PS, tipo, debolezza, ritirata, costi e danni stampati arrivano da `data/cards.json` (`npm run import-cards` lo aggiorna). Un attacco senza testo funziona già.
2. **Si scrive solo il testo.** In `src/cards/impl/` si aggiunge un oggetto `Impl` con il nome della carta:

```ts
{
  name: "Sinistcha",
  passive: hideNSneak,                       // effetto sempre attivo mentre è in gioco
  covers: ["Hide 'n' Sneak"],                // Abilità coperta dal passivo
  attacks: {
    "Matcha Spin": { *effect(g, me) { if (hnsInDiscard(g, me) >= 6) fx.countersEach(g, me, 4); } },
  },
}
```

| Testo della carta | Campo |
| --- | --- |
| effetto di un attacco (può restituire il danno, es. "30+") | `attacks["Nome"].effect` |
| Abilità da usare ("Once during your turn…") | `abilities["Nome"]` con `use` e `canUse` |
| Abilità sempre attiva, Strumento, Stadio, Energia speciale | `passive` |
| Allenatore | `play` e, se serve, `canPlay` |
| Supporter "durante questo turno…" | `turnPassive` |
| Stadio "once during each player's turn…" | `stadiumAction` |
| Energia "quando la attacchi…" | `onAttach` |
| più versioni con lo stesso nome | `version: c => …` per scegliere quale |

3. **Effetti di base** in `src/cards/effects.ts`: `draw`, `searchDeck`, `lookTop`, `mill`, `discardFromHand`, `recover`, `gust`, `switchOwn`, `placeCounters`, `countersEach`, `heal`, `attachFromDiscard`, filtri (`isBasicPokemon`, `noRuleBox`, `hasTag`, `ofType`…). Ogni scelta passa da `yield*`: il motore si ferma e chiede al giocatore.
4. **Test.** In `test/cards.test.ts` si costruisce una posizione con `position({...}, {...})` e si verifica il testo, compresi i casi limite (soglie, bersagli protetti).
5. **Controllo.** `npm run coverage` aggiorna `reports/copertura.md`: la carta sparisce dall'elenco "da implementare".

## Regole per le parti non implementate

Una parte non implementata non fa niente: un attacco fa solo il danno stampato, un'Abilità non si può usare, un Allenatore non si può giocare, un'Energia speciale vale {C}. Per questo ogni report di simulazione mostra la percentuale di carte complete di ogni lista.
