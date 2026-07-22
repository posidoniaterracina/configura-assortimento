# Configura assortimento — versione 4.0

Web app statica per GitHub Pages. Elabora localmente nel browser un file assortimento e un file vendite, arricchisce le descrizioni con attributi configurabili, analizza vendite e margine, propone gli assortimenti Alto/Medio/Basso e genera il layout operativo dello scaffale.

## Novità versione 4.0

### Arricchimento tramite parole chiave

È possibile configurare fino a tre attributi. Ogni attributo contiene più cluster e le relative parole alternative da ricercare nella descrizione.

Esempio:

```text
Pennello = pennello; pennelli
Pennellessa = pennellessa; pennellesse; plafoncino
Rullo = rullo; rulli; ricambio rullo
```

La ricerca non distingue maiuscole, minuscole, accenti e punteggiatura. Quando una descrizione non corrisponde a nessuna regola viene assegnato il valore `NON CLASSIFICATO`. Le corrispondenze multiple vengono segnalate nell'esportazione.

### Rappresentatività dei cluster

Per ciascun attributo si può scegliere:

- tutti i valori presenti;
- Top X% dei valori per vendite;
- Top X% dei valori per margine totale;
- Top N valori per vendite;
- Top N valori per margine totale.

Gli attributi sono gerarchici: Attributo 1 ha priorità maggiore di Attributo 2, che ha priorità maggiore di Attributo 3. Il motore prova a mantenere almeno una referenza dei cluster prioritari anche nel Medio e nel Basso. Se i minimi obbligatori superano la capacità disponibile, viene mostrato un avviso.

### Analisi del margine

Dopo il caricamento del file assortimento l'app mostra le colonne disponibili e propone automaticamente:

- `Pvp` come prezzo di vendita lordo IVA;
- `PrzUnipam` come costo di acquisto;
- una colonna IVA, quando presente, tra `IVA`, `Iva`, `Aliquota IVA`, `Aliquota_IVA`, `AliquotaIva`, `Vat` o `VAT`.

Le colonne possono essere cambiate dall'utente. Se la colonna IVA non è disponibile, viene applicata l'aliquota predefinita del 22%, modificabile nell'interfaccia.

Calcoli:

- PVP netto IVA = PVP lordo / (1 + aliquota IVA / 100);
- Margine unitario = PVP netto IVA − costo di acquisto;
- Margine % = margine unitario / PVP netto IVA × 100;
- Margine totale = margine unitario × quantità venduta.

Nell'esportazione Excel sono riportati separatamente `PVP_Lordo`, `Aliquota_IVA` e `PVP_Netto_IVA`.

### Vista proposta nuovo assortimento

La nuova scheda mostra una riga per articolo con tre indicatori:

- verde = presente nell'Alto;
- giallo = presente nel Medio proposto;
- rosso = presente nel Basso proposto.

Il pallino è acceso solo se la quantità proposta del livello è maggiore di zero. La stessa riga mostra quantità A/M/B, attributi generati, vendite, margine percentuale e margine totale.

## Input

### Assortimento

- foglio: `Q_Temp`;
- filtro: `Breve = N`;
- collegamento prodotto: `Id` e `SkuCodice`;
- dati base: `GAlto`, `GMedio`, `GBasso`, `Art_Pz`;
- attributi già presenti: `Caratteristica`, `Fornitore`, `Linea`, `Brand`.

### Vendite

- foglio: `Q_TempPV`;
- collegamento prodotto: `Fk_Prd`;
- punto vendita: `Negozio`;
- quantità venduta: `Vnd`.

### Cluster punti vendita

File fisso: `data/config/Cluster.xlsx`.

## Logica assortimentale

- i metri Alto, Medio e Basso sono vincoli fissi;
- l'Alto rappresenta il 100%;
- la graduatoria usa i punti vendita dei cluster selezionati;
- il Gini stabilisce automaticamente quanto ridurre referenze e quantità, oppure il peso può essere impostato manualmente;
- le quantità rispettano multipli o sottomultipli di `Art_Pz`;
- le priorità degli attributi vengono applicate prima di vendite, margine totale e criteri secondari;
- il Basso non può contenere una quantità superiore al Medio.

## Layout scaffale

La scheda `Layout scaffale` combina `Caratteristica` con uno dei seguenti campi:

- Fornitore;
- Linea;
- Brand;
- Attributo 1, 2 o 3, quando attivo.

Sono disponibili le due composizioni:

1. attributo selezionato per ripiano e Caratteristica sul ripiano;
2. Caratteristica per ripiano e attributo selezionato sul ripiano.

Le card possono essere riordinate con drag&drop nello stesso ripiano. La stampa è ottimizzata per A3 orizzontale.

## Esportazione Excel

Il file `Proposta_Nuovo_Assortimento.xlsx` contiene:

- Riepilogo Fornitori;
- Proposta Assortimento;
- Analisi Attributi, quando presenti;
- Parametri.

La proposta include gli indicatori SI/NO per Alto, Medio e Basso, margini, cluster, priorità applicate e conflitti di classificazione.

## Pubblicazione

Caricare tutto il contenuto nella radice del repository GitHub Pages. Il file principale è `index.html`.

I file vengono elaborati localmente nel browser e non vengono inviati a server esterni.

## Test

Dopo aver estratto i file Excel di prova in `/tmp` con `tests/extract_xlsx.py`:

```bash
node tests/engine-v3.test.js
node tests/enrichment-v1.test.js
node tests/planogram-v3.test.js
python tests/ui_contract_test.py
```


## Correzione 4.0.2 – pulsante Elabora

- La tabella `Cluster.xlsx` è incorporata anche in `js/cluster-data-v1.js`, quindi il calcolo funziona aprendo direttamente `index.html`.
- Il pulsante indica nel tooltip quali dati mancano quando è disabilitato.
- Rimane disponibile il file Excel originale in `data/config/Cluster.xlsx` come sorgente di manutenzione.
