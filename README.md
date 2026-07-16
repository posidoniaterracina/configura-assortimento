# Dimensionamento assortimenti

Web app statica per GitHub Pages che dimensiona gli assortimenti **Medio** e **Basso** partendo dall'assortimento **Alto**.

## Input

- file assortimento, foglio `Q_Temp`;
- file vendite, foglio `Q_TempPV`;
- metri scaffale Alto, Medio e Basso;
- cluster delle vendite da analizzare;
- modalità del taglio automatica o manuale;
- giorni di scorta desiderati per Medio e Basso.

## Regole fisse

- filtro assortimento: `Breve = N`;
- codice articolo: `Id` collegato a `Fk_Prd`;
- quantità teoriche: `GAlto`, `GMedio`, `GBasso`;
- fornitore: `Fornitore`;
- imballo: `Art_Pz`;
- vendite: `Vnd`;
- negozio: `Negozio`;
- cluster fisso: `data/config/Cluster.xlsx`.

## Funzionamento

I metri sono un vincolo fisso. Se Alto ha 10 metri, Medio 6 e Basso 3, le capacità equivalenti sono il 60% e il 30% dell'Alto.

Il peso del taglio può essere:

- **automatico**: il coefficiente di Gini assegna più peso al taglio delle quantità quando le vendite sono omogenee e più peso al taglio delle referenze quando sono concentrate;
- **manuale**: l'utente imposta direttamente la percentuale attribuita al taglio delle referenze. Il peso delle quantità è il complemento a 100.

Le quantità proposte rispettano multipli o sottomultipli di `Art_Pz` e non superano `GAlto`.

## Pubblicazione

Caricare tutti i file nella radice del repository GitHub Pages. Il file `index.html` deve trovarsi nella radice.

Dopo l'aggiornamento eseguire un refresh forzato con `Ctrl+F5`. La versione visibile nell'intestazione deve essere **2.1**.

## Verifiche eseguite

- sintassi JavaScript;
- contratto tra ID HTML e codice JavaScript;
- filtro `Breve = N` su 66 referenze reali;
- cluster: 4 Alto, 11 Medio, 5 Basso;
- selezione cluster con risultati differenti;
- bilanciamento manuale 0%, 50% e 100%;
- capacità determinate dai metri;
- rispetto di `Art_Pz`;
- vincolo `GBasso proposto ≤ GMedio proposto ≤ GAlto`.
