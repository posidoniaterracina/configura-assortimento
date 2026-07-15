# Note funzionali del progetto

## Architettura degli input

La web app usa tre fonti, con responsabilità separate:

1. `data/config/Cluster.xlsx`: mappatura aziendale fissa dei punti vendita;
2. anagrafica assortimento: caricata dall'utente a ogni analisi;
3. vendite ultimi sei mesi: caricate dall'utente a ogni analisi.

Anagrafica e vendite non devono essere inserite nel repository.

## Regole confermate

1. `GAlto`, `GMedio` e `GBasso` rappresentano la giacenza teorica target per singolo store del relativo cluster.
2. Vengono analizzate soltanto le righe con `Breve = N`.
3. La sottofamiglia viene scelta dinamicamente dai dati caricati.
4. La colonna `Priorita` del file cluster determina Alto, Medio o Basso.
5. Il livello cluster viene risolto con priorità Famiglia `F`, Gruppo `G`, Reparto `R`.
6. La proposta è inizialmente calcolata soltanto per il cluster Basso.
7. In assenza di un dato affidabile di spazio, l'app usa i pezzi assegnati come prima proxy; la colonna Volume viene utilizzata quando valorizzata.
8. La domanda Basso delle referenze oggi escluse viene stimata partendo dalle vendite nei cluster Alto e Medio.

## Controlli da validare sui primi file reali

- corrispondenza dei nomi o codici dei punti vendita;
- corrispondenza dell'ID prodotto tra anagrafica e vendite;
- significato delle quantità negative e dei resi;
- presenza di periodi di indisponibilità;
- soglia minima per inserire una referenza nel cluster Basso;
- comportamento delle sottofamiglie senza cluster specifico `F`.
