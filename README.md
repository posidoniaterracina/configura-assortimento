# Configura assortimento — versione 3.1

Web app statica per GitHub Pages. Elabora localmente nel browser un file assortimento e un file vendite e propone i nuovi assegnati Medio e Basso.

## Input fissi

- Assortimento: foglio `Q_Temp`
- Vendite: foglio `Q_TempPV`
- Filtro assortimento: `Breve = N`
- Collegamento prodotto: `Id` ↔ `Fk_Prd`
- Vendite: colonna `Vnd`
- Quantità di imballo: `Art_Pz`
- Mappatura cluster: `data/config/Cluster.xlsx`

## Logica

- I metri Alto, Medio e Basso sono vincoli fissi.
- L'Alto è il riferimento 100%.
- La graduatoria usa i cluster di vendita selezionati.
- Modalità automatica: il Gini assegna più peso al taglio referenze quando le vendite sono concentrate.
- Modalità manuale: l'utente sceglie il peso del taglio referenze; il peso quantità è il complemento a 100%.
- Le quantità rispettano multipli o sottomultipli di `Art_Pz`.
- L'output è riepilogato per `Fornitore` e può essere esportato in Excel.

## Pubblicazione

Caricare tutto il contenuto nella radice del repository GitHub Pages. Il file principale è `index.html`.

## Descrizioni colonne

Le intestazioni delle tabelle mostrano un’icona `i`: al passaggio del mouse, al focus da tastiera o al tocco viene visualizzata una breve spiegazione del valore della colonna.
