# Configura assortimento

Web app statica per GitHub Pages che confronta l'assegnato dei cluster Alto, Medio e Basso con le vendite aggregate degli ultimi 6 mesi.

## Flusso

1. Caricare il file assortimento nel formato standard aziendale (`Q_Temp`).
2. Caricare il file vendite nel formato standard aziendale (`Q_TempPV`).
3. Selezionare la sottofamiglia, se il file ne contiene più di una.
4. Elaborare ed esportare la proposta per il cluster Basso.

## Colonne preimpostate

### Assortimento

- ID: `Id`
- EAN/SKU: `SkuCodice`
- Descrizione: `Prodotto`
- Reparto: `Reparto`
- Gruppo: `Famiglia`
- Sottofamiglia: `SttFamiglia`
- Filtro: `Breve = N`
- Assegnato: `GAlto`, `GMedio`, `GBasso`
- Pezzi per collo: `Art_Pz`

### Vendite aggregate 6 mesi

- Articolo: `Fk_Prd`
- Punto vendita: `Negozio`
- Codice punto vendita: `Pv`
- Acquisti: `Acq`
- Vendite: `Vnd`
- Giacenza finale: `GFn`
- Data finale periodo: `Data`

La riga totale e il canale `VendOnLine` vengono esclusi automaticamente dall'analisi dei punti vendita.

## Cluster

La mappatura fissa è contenuta in `data/config/Cluster.xlsx`. La priorità è:

1. Famiglia (`Tipo = F`)
2. Gruppo (`Tipo = G`)
3. Reparto (`Tipo = R`)

## Privacy

I file caricati vengono elaborati nel browser e non vengono inviati a un server.
