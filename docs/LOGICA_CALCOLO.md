# Logica di calcolo

## 1. Conversione dello spazio

Il totale dell'assegnato Alto è:

`SpazioAlto = somma(GAlto * spazio_unitario)`

Se non è presente una colonna di ingombro esplicita, `spazio_unitario = 1`.

Le unità equivalenti per metro sono:

`UnitaPerMetro = SpazioAlto / MetriAlto`

Le capacità dei cluster sono:

- `CapacitaMedio = SpazioAlto * MetriMedio / MetriAlto`
- `CapacitaBasso = SpazioAlto * MetriBasso / MetriAlto`

## 2. Indicatori di vendita

Per ciascuna referenza vengono calcolati:

- vendite totali nei sei mesi;
- vendita mensile media per punto vendita;
- penetrazione nei punti vendita;
- classe ABC;
- punteggio di priorità specifico per Medio e Basso.

## 3. Punteggio

Il punteggio privilegia:

- rotazione media della rete;
- rotazione del cluster;
- penetrazione nella rete;
- penetrazione nel cluster;
- appartenenza alla classe ABC A o B.

## 4. Ottimizzazione

La proposta parte dal `GAlto` riproporzionato per i metri disponibili e viene corretta in base alla domanda e al punteggio.

Il motore:

1. assegna spazio alle referenze più importanti;
2. rispetta il limite complessivo del cluster;
3. aumenta i prodotti ad alta rotazione;
4. riduce o elimina i prodotti meno produttivi;
5. impone `GBasso proposto <= GMedio proposto <= GAlto`.
