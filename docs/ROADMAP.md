# Roadmap

## Fase 0 · fino al 31 ottobre 2026 (in parallelo con Danzica)

- [x] Modello Danzica: Hide n' Sneak carta per carta contro 11 avversari tarati sui win rate reali (`legacy/danzica_model`)
- [x] Avversario forte con ricerca Monte Carlo (Timbro, ritirata, Crushing Hammer, Boss's Orders)
- [ ] Simulazione finale con avversario forte e lista per Danzica bloccata
- [x] Struttura del progetto, README, roadmap
- [x] Prototipo in Python del motore (in `legacy/python-proto`)
- [x] Scelta: sito, pubblico più avanti, motore in TypeScript
- [x] Motore TypeScript a punti di decisione: setup, mulligan, turni, Abilità, attacchi, debolezza e resistenza, condizioni, KO, premi, clone a metà effetto (10 test, circa 3.600 partite al secondo)
- [x] Libreria di effetti base: pesca, cerca, scarta, segnalini, cura, cambio, Boss's Orders
- [x] Import delle carte dal database aperto (4.765 carte, PS, tipi, attacchi, testi)
- [x] Liste in formato Live: lettura, riconoscimento delle ristampe, controllo (60 carte, 4 copie, ACE SPEC, legalità)
- [x] 35 liste in `decks/`: Hide n' Sneak (16), Frankfurt top 16 (10), Yokohama (9)
- [x] Registro delle carte con report di copertura
- [x] Motore: effetti passivi, effetti per il turno, regola Tera, Stadi con azione, prevenzione degli effetti
- [x] Primo mazzo completo nel nuovo motore: Hide n' Sneak, tutte le varianti
- [x] Giocatore base generico, matrice in parallelo, replay, CI su GitHub
- [x] Carte del meta: tutti gli archetipi sopra l'1,5% con la lista rappresentativa completa al 100%
- [x] Liste e classifiche di sei Regional da Limitless, quote e matchup reali da Limitless Labs
- [x] Matrice contro il meta reale e confronto automatico con Labs (`meta-matrix --validate`)

## Fase 1 · novembre, settimane 1-3

Delta Reign esce il 6 novembre: il primo formato di riferimento è quello con Delta Reign.

- [x] Import automatico delle liste da Limitless e delle quote da Limitless Labs
- [ ] I 12 mazzi principali del nuovo formato, carta per carta, con test
- [ ] Giocatore migliore: lo scarto medio dai risultati reali è sceso da 29,6 a 25,3 punti (correlazione da 0,11 a 0,24) con i piani di mazzo di Dragapult, Slowking, Zoroark, Festival Lead e Honchkrow (22 ottobre). Obiettivo: sotto i 10 punti
- [ ] Giocatore base per archetipo

## Fase 2 · novembre, settimane 4-5

- [ ] Giocatore forte: ricerca Monte Carlo con ipotesi sulle carte nascoste dell'avversario
- [ ] Validazione: matrice simulata contro win rate reali; correzione dei mazzi che si discostano

## Fase 3 · dicembre

- [ ] Ottimizzatore di lista
- [ ] Matrice aggiornata in automatico dopo ogni Regional (attività programmata)
- [ ] Allenatore di decisioni
- [ ] Pagina web per giocare contro l'IA

## Dopo

- [ ] Ogni nuova espansione: aggiungere le carte che entrano nel meta
- [ ] Valutatore della posizione imparato con partite contro sé stesso, per rendere la ricerca più veloce
- [ ] Calcoli lunghi in cloud su più processori
