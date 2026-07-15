# Configura assortimento

Web app statica per dimensionare l'assortimento dei punti vendita in base ai cluster **Alto**, **Medio** e **Basso**.

## Funzionamento

- Il file fisso `data/config/Cluster.xlsx` contiene la mappatura dei punti vendita nei cluster.
- A ogni elaborazione si caricano dalla pagina:
  1. l'anagrafica assortimento della sottofamiglia;
  2. le vendite degli ultimi sei mesi della stessa sottofamiglia.
- L'app analizza solo le righe con `Breve = N`.
- `GAlto`, `GMedio` e `GBasso` rappresentano la giacenza teorica assegnata a ciascun punto vendita del relativo cluster.
- I file caricati vengono elaborati nel browser e non sono inviati a un server.

## Pubblicazione GitHub Pages

Il repository deve contenere `index.html` direttamente nella radice. In GitHub:

1. `Settings` → `Pages`;
2. `Deploy from a branch`;
3. branch `main`, cartella `/ (root)`;
4. `Save`.

L'app sarà disponibile su:

`https://NOMEUTENTE.github.io/NOMEREPOSITORY/`

## Struttura

```text
index.html
css/style.css
js/engine.js
js/app.js
data/config/Cluster.xlsx
data/templates/Anagrafica_Template.xlsx
data/templates/Vendite_Template.xlsx
.nojekyll
```

## Nota sulla riservatezza

Con un repository pubblico, anche `Cluster.xlsx` è pubblicamente scaricabile. I file caricati dall'utente nella web app restano invece locali nel browser.
