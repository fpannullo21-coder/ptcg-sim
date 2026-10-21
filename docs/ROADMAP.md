# Roadmap

## Fase 0 · fino al 31 ottobre 2026 (in parallelo con Danzica)

- [x] Modello Danzica: Hide n' Sneak carta per carta contro 11 avversari tarati sui win rate reali (`legacy/danzica_model`)
- [x] Avversario forte con ricerca Monte Carlo (Timbro, ritirata, Crushing Hammer, Boss's Orders)
- [ ] Simulazione finale con avversario forte e lista per Danzica bloccata
- [x] Struttura del progetto, README, roadmap
- [x] Motore di regole: stato, azioni legali, turni, KO, premi, primo turno, condizioni speciali (prima versione, 6 test)
- [ ] Libreria di effetti base: pesca, cerca, scarta, danno, segnalini, cura, cambio
- [ ] Primo mazzo completo nel nuovo motore: Hide n' Sneak (lista per Danzica)

## Fase 1 · novembre, settimane 1-3

Delta Reign esce il 6 novembre: il primo formato di riferimento è quello con Delta Reign.

- [ ] Import delle liste da Limitless (formato TCG Live) e delle quote da Limitless Labs
- [ ] I 12 mazzi principali del nuovo formato, carta per carta, con test
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
