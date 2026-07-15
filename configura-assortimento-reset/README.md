# Bilanciamento assortimenti

Web app statica per GitHub Pages. Elabora i file Excel direttamente nel browser.

## Input

- File assortimento, foglio `Q_Temp`
- File vendite, foglio `Q_TempPV`
- Metri scaffale Alto, Medio e Basso
- Cluster da considerare nelle vendite: Tutti, Alto, Medio, Basso
- Priorità: riduzione del numero di referenze, delle quantità o entrambe

Il filtro è fisso: `Breve = N`.

## Logica

L'assortimento Alto è la base 100%. Se Alto misura 10 m, Medio 6 m e Basso 3 m:

- Medio conserva il top 60% dell'assortimento quando è attiva la riduzione delle referenze;
- Basso conserva il top 30%;
- quando è attiva la riduzione delle quantità, i pezzi vengono proporzionati allo stesso rapporto;
- le quantità proposte rispettano multipli o sottomultipli di `Art_Pz` e non superano `GAlto`;
- la graduatoria è costruita sulla somma di `Vnd` nei cluster selezionati.

## Output

- Riepilogo aggregato per `Fornitore`
- Dettaglio referenze con `GMedio` e `GBasso` proposti
- Esportazione Excel con riepilogo fornitori, dettaglio e parametri

## Pubblicazione

Caricare tutto nella radice del repository GitHub Pages. Il file fisso di clusterizzazione deve essere disponibile in:

`data/config/Cluster.xlsx`
