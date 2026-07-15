# Configura assortimento

Web app statica per il bilanciamento degli assortimenti dei punti vendita clusterizzati in **Alto**, **Medio** e **Basso**.

## Funzionamento

- Il cluster **Alto** è il riferimento pari a 100%.
- L'utente inserisce i metri lineari disponibili per Alto, Medio e Basso.
- Il totale di `GAlto` viene convertito nei metri Alto inseriti.
- Le capacità di Medio e Basso vengono calcolate in proporzione ai rispettivi metri.
- Le vendite degli ultimi sei mesi determinano la priorità delle referenze.
- L'app propone un nuovo assegnato per `GMedio` e `GBasso` senza superare lo spazio disponibile.
- È sempre rispettata la gerarchia `Basso <= Medio <= Alto` per ciascuna referenza.

## File caricati dall'utente

### Assortimento

Formato fisso con almeno:

- `Id`
- `Prodotto`
- `Reparto`
- `Famiglia`
- `SttFamiglia`
- `Breve`
- `GAlto`
- `GMedio`
- `GBasso`

Vengono analizzate soltanto le righe con `Breve = N`.

### Vendite

Foglio preferito `Q_TempPV` con almeno:

- `Fk_Prd`
- `Negozio`
- `Vnd`
- `Data`

La colonna `Vnd` rappresenta i pezzi venduti nel periodo di sei mesi.

## Cluster

La mappatura fissa è contenuta in:

`data/config/Cluster.xlsx`

L'app usa il livello più specifico disponibile:

1. Famiglia (`Tipo = F`)
2. Gruppo (`Tipo = G`)
3. Reparto (`Tipo = R`)

## Pubblicazione GitHub Pages

Il progetto è completamente statico. Caricare nella radice del repository:

- `index.html`
- `css/`
- `js/`
- `data/`
- `.nojekyll`

In **Settings > Pages** selezionare la pubblicazione dal branch `main`, cartella `/root`.

## Privacy

I file assortimento e vendite vengono elaborati localmente nel browser e non vengono caricati su un server.
