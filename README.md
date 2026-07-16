# Configura assortimento — versione 3.2

Web app statica per GitHub Pages. Elabora localmente nel browser un file assortimento e un file vendite, propone i nuovi assegnati Medio e Basso e genera un layout operativo dello scaffale.

## Input fissi

- Assortimento: foglio `Q_Temp`
- Vendite: foglio `Q_TempPV`
- Filtro assortimento: `Breve = N`
- Collegamento prodotto: `Id` ↔ `Fk_Prd`
- Vendite: colonna `Vnd`
- Quantità di imballo: `Art_Pz`
- Mappatura cluster: `data/config/Cluster.xlsx`

## Logica assortimentale

- I metri Alto, Medio e Basso sono vincoli fissi.
- L'Alto è il riferimento 100%.
- La graduatoria usa i cluster di vendita selezionati.
- Modalità automatica: il Gini assegna più peso al taglio referenze quando le vendite sono concentrate.
- Modalità manuale: l'utente sceglie il peso del taglio referenze; il peso quantità è il complemento a 100%.
- Le quantità rispettano multipli o sottomultipli di `Art_Pz`.
- L'output è riepilogato per `Fornitore` e può essere esportato in Excel.

## Layout scaffale

La scheda `Layout scaffale` usa le referenze dell'assortimento Alto, Medio proposto o Basso proposto e offre due modalità:

1. **Un fornitore per ripiano**: ogni ripiano contiene un solo fornitore; le referenze sono ordinate per gradazione crescente, per esempio W40, W45, W50.
2. **Una gradazione per ripiano**: ogni ripiano contiene una gradazione; all'interno le referenze sono ordinate e raggruppate per fornitore.

La gradazione viene estratta automaticamente dalla descrizione del prodotto. Sono riconosciute forme come `5W40`, `5W-40`, `W40` e `SAE 40`. Le referenze non riconosciute vengono collocate in coda e segnalate.

Le schede prodotto possono essere riordinate manualmente con drag&drop all'interno dello stesso ripiano. Il pulsante `Stampa layout` genera una vista A3 orizzontale destinata agli addetti di reparto.

## Pubblicazione

Caricare tutto il contenuto nella radice del repository GitHub Pages. Il file principale è `index.html`.

## Descrizioni colonne

Le intestazioni delle tabelle mostrano un’icona `i`: al passaggio del mouse, al focus da tastiera o al tocco viene visualizzata una breve spiegazione del valore della colonna.
