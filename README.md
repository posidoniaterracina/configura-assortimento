# Configura assortimento — versione 3.3

Web app statica per GitHub Pages. Elabora localmente nel browser un file assortimento e un file vendite, propone i nuovi assegnati Medio e Basso e genera un layout operativo dello scaffale.

## Input fissi

- Assortimento: foglio `Q_Temp`
- Vendite: foglio `Q_TempPV`
- Filtro assortimento: `Breve = N`
- Collegamento prodotto: `Id` ↔ `Fk_Prd`
- Vendite: colonna `Vnd`
- Quantità di imballo: `Art_Pz`
- Mappatura cluster: `data/config/Cluster.xlsx`
- Attributi layout obbligatori: `Caratteristica`, `Fornitore`, `Linea`, `Brand`

## Logica assortimentale

- I metri Alto, Medio e Basso sono vincoli fissi.
- L'Alto è il riferimento 100%.
- La graduatoria usa i cluster di vendita selezionati.
- Modalità automatica: il Gini assegna più peso al taglio referenze quando le vendite sono concentrate.
- Modalità manuale: l'utente sceglie il peso del taglio referenze; il peso quantità è il complemento a 100%.
- Le quantità rispettano multipli o sottomultipli di `Art_Pz`.
- L'output è riepilogato per `Fornitore` e può essere esportato in Excel.

## Layout scaffale

La scheda `Layout scaffale` usa sempre la colonna `Caratteristica` del file assortimento. Non vengono più interpretate o estratte sigle dalla descrizione prodotto.

L'utente seleziona l'attributo da combinare con `Caratteristica`:

- `Fornitore`
- `Linea`
- `Brand`

Per ciascun attributo sono disponibili due composizioni:

1. **Attributo commerciale per ripiano**: ogni ripiano corrisponde a Fornitore, Linea o Brand; sul ripiano i prodotti sono ordinati per `Caratteristica`.
2. **Caratteristica per ripiano**: ogni ripiano corrisponde a una Caratteristica; sul ripiano i prodotti sono raggruppati e ordinati per Fornitore, Linea o Brand.

Le sigle di viscosità presenti nella colonna `Caratteristica`, come `5W30`, `10W40`, `15W40` e `80W90`, vengono ordinate considerando prima il valore dopo `W` e poi quello precedente. Le altre caratteristiche, come `2T`, `4T`, `DOT5.1` o `CATENA`, sono gestite senza leggere la descrizione.

Le schede prodotto possono essere riordinate manualmente con drag&drop all'interno dello stesso ripiano. Il pulsante `Stampa layout` genera una vista A3 orizzontale destinata agli addetti di reparto.

## Pubblicazione

Caricare tutto il contenuto nella radice del repository GitHub Pages. Il file principale è `index.html`.

## Descrizioni colonne

Le intestazioni delle tabelle mostrano un’icona `i`: al passaggio del mouse, al focus da tastiera o al tocco viene visualizzata una breve spiegazione del valore della colonna.
