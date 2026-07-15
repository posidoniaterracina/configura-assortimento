# Dimensionamento assortimento per cluster

Web app interna per analizzare e proporre il dimensionamento dell'assortimento dei punti vendita in base ai cluster **Alto**, **Medio** e **Basso**.

## Flusso corretto dei dati

Il repository **non contiene anagrafiche prodotto né file vendite reali**.

A ogni elaborazione l'utente carica dalla web app una nuova coppia di file:

1. **anagrafica assortimento** della sottofamiglia da analizzare;
2. **vendite degli ultimi sei mesi** riferite alla stessa sottofamiglia.

Rimane invece fissa la mappatura dei punti vendita nei cluster, salvata in:

```text
data/config/Cluster.xlsx
```

La web app seleziona automaticamente la clusterizzazione più specifica disponibile:

1. Famiglia/sottofamiglia, livello `F`;
2. Gruppo, livello `G`, se manca il livello famiglia;
3. Reparto, livello `R`, se mancano i livelli precedenti.

## Regole dell'MVP

- vengono analizzate esclusivamente le righe con `Breve = N`;
- `GAlto`, `GMedio` e `GBasso` rappresentano la giacenza teorica assegnata a ogni singolo store del relativo cluster;
- la sottofamiglia non è codificata nel progetto: viene scelta dai valori presenti nel file caricato;
- la proposta iniziale riguarda il nuovo assegnato del cluster Basso;
- i file caricati vengono elaborati in memoria e non sono copiati nel repository.

## Funzioni disponibili

- caricamento dell'anagrafica e delle vendite tramite interfaccia;
- scelta del foglio Excel;
- riconoscimento automatico e mappatura manuale delle colonne;
- selezione dinamica di reparto, gruppo e sottofamiglia;
- filtro fisso `Breve = N`;
- utilizzo della clusterizzazione fissa;
- fallback automatico Famiglia → Gruppo → Reparto;
- sintesi delle referenze e dei pezzi teorici per cluster;
- calcolo di rotazione mensile media per store, penetrazione e continuità;
- punteggio trasparente da 0 a 100;
- proposta iniziale del nuovo `GBasso`;
- classificazione: Inserire, Aumentare, Ridurre, Confermare, Confermare esclusione;
- esportazione Excel dell'analisi;
- test automatici tramite GitHub Actions.

## Formato minimo dell'anagrafica

| Campo | Obbligatorio | Utilizzo |
|---|---|---|
| `Id` | Sì | Collegamento con il file vendite |
| `Prodotto` | Sì | Descrizione referenza |
| `Reparto` | Sì | Gerarchia merceologica |
| `Famiglia` | Sì | Gruppo merceologico |
| `SttFamiglia` | Sì | Sottofamiglia da analizzare |
| `GAlto` | Sì | Assegnato cluster Alto |
| `GMedio` | Sì | Assegnato cluster Medio |
| `GBasso` | Sì | Assegnato cluster Basso |
| `Breve` | Sì | Sono considerate soltanto le righe `N` |
| `Art_Pz` | No | Pezzi per collo |
| `Volume` | No | Coefficiente di ingombro |

È incluso un modello vuoto in `data/templates/Anagrafica_Template.xlsx`.

## Formato minimo delle vendite

| Campo | Obbligatorio | Esempio |
|---|---|---|
| `Data` | Sì | 15/01/2026 |
| `PuntoVendita` | Sì | Isonzo |
| `Id` | Sì | 164731 |
| `Quantita` | Sì | 2 |
| `VendutoEuro` | No | 15,00 |
| `MargineEuro` | No | 4,20 |

È incluso un modello vuoto in `data/templates/Vendite_Template.xlsx`.

## Logica iniziale della proposta

Il punteggio per cluster è composto da:

- 50% velocità di vendita mensile per store;
- 25% penetrazione nei punti vendita;
- 25% continuità negli ultimi sei mesi.

Per le referenze con `GBasso = 0`, la domanda del cluster Basso viene stimata sulla base del rapporto osservato tra Basso e Medio sulle referenze già presenti. La proposta viene generata soltanto se il punteggio supera la soglia configurabile.

La quantità proposta è basata su:

```text
vendita mensile stimata × mesi di copertura + scorta di sicurezza
```

Questa è una prima regola trasparente da validare sui dati reali. Non è ancora un'ottimizzazione matematica vincolata dello spazio.

## Avvio locale

Richiede Python 3.11 o 3.12.

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

### macOS/Linux

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

L'app sarà normalmente disponibile su `http://localhost:8501`.

## Pubblicazione su GitHub e Streamlit

1. Creare un repository GitHub privato.
2. Estrarre lo ZIP e caricare il contenuto nella radice del repository.
3. Collegare il repository a Streamlit Community Cloud o a un server aziendale.
4. Impostare `app.py` come file principale.
5. Avviare il deploy.
6. Caricare anagrafica e vendite soltanto dall'interfaccia della web app.

Il repository deve rimanere privato perché contiene la mappatura aziendale dei cluster.

## Avvio con Docker

```bash
docker build -t assortimento-cluster .
docker run --rm -p 8501:8501 assortimento-cluster
```

## Struttura repository

```text
.
├── app.py
├── src/
│   ├── analytics.py
│   ├── config.py
│   ├── data_loader.py
│   ├── exporter.py
│   ├── utils.py
│   └── validation.py
├── data/
│   ├── config/
│   │   └── Cluster.xlsx
│   └── templates/
│       ├── Anagrafica_Template.xlsx
│       └── Vendite_Template.xlsx
├── tests/
├── .github/workflows/tests.yml
├── .streamlit/config.toml
├── Dockerfile
├── requirements.txt
└── LICENSE.md
```

## Prossimi sviluppi

- verifica automatica della coerenza tra sottofamiglia dell'anagrafica e vendite;
- disponibilità e rotture di stock;
- capacità massima per reparto e punto vendita;
- centimetri lineari o volume reale occupato;
- multipli di collo e minimi espositivi specifici per referenza;
- confronto tra scenari;
- storico delle elaborazioni;
- ottimizzazione simultanea Alto, Medio e Basso;
- autenticazione utenti e database.
