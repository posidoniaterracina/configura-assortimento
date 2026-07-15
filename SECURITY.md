# Sicurezza e gestione dati

- Il repository non deve contenere anagrafiche prodotto, vendite o esportazioni generate dagli utenti.
- La sola base dati inclusa è la mappatura aziendale fissa `data/config/Cluster.xlsx`.
- Il repository deve essere privato.
- I file caricati tramite Streamlit vengono elaborati in memoria e non vengono salvati dal codice dell'MVP.
- Non aggiungere log contenenti righe di vendita, codici articolo o dati dei punti vendita.
- Per un utilizzo continuativo è preferibile un ambiente aziendale o cloud riservato con autenticazione.
- Le future funzioni di storico dovranno usare un archivio protetto e politiche di conservazione definite.
