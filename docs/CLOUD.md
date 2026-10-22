# Simulazioni in cloud

Il giocatore Monte Carlo (`mc`) gioca molto meglio del giocatore base, ma è lento: circa 2,5 secondi a partita per processore con 6 continuazioni per mossa e 2 turni di profondità. Le simulazioni grandi si fanno quindi su più macchine in parallelo, con GitHub Actions.

## Come si lancia

1. Su GitHub: **Actions → simula → Run workflow**.
2. Si scelgono le liste da provare, quanti archetipi del meta, quante partite per coppia, il giocatore (`basic`, `eval`, `mc:6:2`) e quante macchine (fino a 20).
3. Ogni macchina gioca una parte delle coppie (`meta-matrix --shard i/N`). Alla fine un ultimo job unisce le parti (`--merge`), salva `reports/meta-matrix-<nome>.md` nel repository e lo allega come file scaricabile.

Lo stesso si può fare in locale:

```
npx tsx src/tools/meta-matrix.ts --lists "..." --top 12 --games 60 --agent mc:6:2 --shard 0/2 --name prova
npx tsx src/tools/meta-matrix.ts --lists "..." --top 12 --games 60 --agent mc:6:2 --shard 1/2 --name prova
npx tsx src/tools/meta-matrix.ts --lists "..." --top 12 --games 60 --agent mc:6:2 --merge --name prova
```

## Quanto costa

GitHub conta i minuti di ogni macchina. Nei repository **privati** il piano gratuito ne include **2.000 al mese**; nei repository pubblici sono illimitati.

| Simulazione | Partite | Minuti-macchina (circa) | Durata con 10 macchine |
| --- | --- | --- | --- |
| 2 liste contro 12 archetipi, 60 partite | 1.400 | 30-40 | 5 minuti |
| 10 varianti contro 12 archetipi, 100 partite | 12.000 | 260 | 30 minuti |
| Validazione: 12 archetipi tra loro più 5 varianti, 40 partite (misurato il 22 ottobre) | 4.000 | 120 | 16 minuti con 20 macchine |
| Validazione: 16 archetipi tra loro, 100 partite | 12.000 | 260 | 30 minuti |

Con 2.000 minuti al mese si possono fare circa 6-8 simulazioni grandi. Se servono di più: rendere pubblico il repository (con le cautele del README), oppure una macchina cloud a ore con più processori, dove gli stessi comandi girano con `--workers` pari al numero di processori.
