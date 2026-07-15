# Dimensionamento assortimenti

Web app statica per GitHub Pages. Elabora localmente nel browser:

- file assortimento, foglio `Q_Temp`;
- file vendite, foglio `Q_TempPV`;
- mappatura fissa `data/config/Cluster.xlsx`.

## Regole principali

- vengono considerate soltanto le righe con `Breve = N`;
- `GAlto` è l'assortimento di riferimento;
- i metri Alto, Medio e Basso sono vincoli fissi di capacità;
- la performance è calcolata dalla colonna `Vnd`, normalizzata per punti vendita e 182,5 giorni;
- la modalità automatica usa il coefficiente di Gini per attribuire il peso tra taglio referenze e taglio quantità;
- la modalità manuale permette di impostare il peso del taglio referenze, mentre il peso quantità è il complemento a 100%;
- le quantità dipendono dai giorni di scorta desiderati e rispettano multipli o sottomultipli di `Art_Pz`;
- l'output è riepilogato per `Fornitore` ed esportabile in Excel.

## Pubblicazione

Caricare il contenuto di questa cartella nella radice del repository GitHub Pages. Il file principale è `index.html`.

## Nota sullo spazio

In assenza di centimetri lineari per singola referenza, la capacità derivata dai metri viene modellata usando `GAlto` come base equivalente. I metri restano comunque un limite massimo e non vengono modificati dall'algoritmo.
