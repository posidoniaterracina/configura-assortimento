(function () {
  "use strict";

  var APP_VERSION = "2.1";
  var REQUIRED_ASSORTMENT = ["Id", "Prodotto", "Reparto", "Famiglia", "SttFamiglia", "GAlto", "GMedio", "GBasso", "Fornitore", "Art_Pz", "Breve"];
  var REQUIRED_SALES = ["Fk_Prd", "Negozio", "Vnd"];
  var REQUIRED_CLUSTER = ["Descrizione", "Tipo", "Reparto", "Gruppo", "Famiglia", "Priorita"];

  var E;
  var state = {
    clusterRows: [],
    assortmentRows: [],
    salesRows: [],
    assortment: [],
    scope: null,
    storeMapping: [],
    results: null,
    suppliers: [],
    quality: null,
    selectedClusters: ["Alto", "Medio", "Basso"]
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmt(value, digits) {
    var number = Number(value);
    var decimals = Number.isInteger(digits) ? digits : 0;
    if (!Number.isFinite(number)) return "–";
    return number.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function pct(value) { return fmt(Number(value) * 100, 1) + "%"; }
  function days(value) { return Number.isFinite(Number(value)) ? fmt(value, 1) + " gg" : "–"; }

  function setStatus(text, type) {
    var node = $("clusterStatus");
    node.textContent = text;
    node.className = "status-pill" + (type ? " " + type : "");
  }

  function clearMessages() { $("messages").innerHTML = ""; }

  function message(text, type) {
    var div = document.createElement("div");
    div.className = "message " + (type || "info");
    div.textContent = text;
    $("messages").appendChild(div);
  }

  function ensureSpreadsheetLibrary() {
    if (!window.XLSX) {
      throw new Error("Libreria Excel non caricata. Aggiorna la pagina con Ctrl+F5 e verifica la connessione Internet.");
    }
  }

  function readWorkbook(buffer) {
    ensureSpreadsheetLibrary();
    return window.XLSX.read(buffer, { type: "array", cellDates: true });
  }

  function rowsFrom(workbook, preferredSheet) {
    if (!workbook) return [];
    var sheetName = workbook.SheetNames.indexOf(preferredSheet) >= 0 ? preferredSheet : workbook.SheetNames[0];
    if (!sheetName) return [];
    return window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
      raw: true,
      blankrows: false
    });
  }

  function missingColumns(rows, required) {
    var columns = rows.length ? Object.keys(rows[0]) : [];
    return required.filter(function (name) { return columns.indexOf(name) < 0; });
  }

  function loadFile(file, sheetName, requiredColumns) {
    ensureSpreadsheetLibrary();
    return file.arrayBuffer().then(function (buffer) {
      var rows = rowsFrom(readWorkbook(buffer), sheetName);
      if (!rows.length) throw new Error("Il file non contiene righe leggibili.");
      var missing = missingColumns(rows, requiredColumns);
      if (missing.length) throw new Error("Colonne mancanti: " + missing.join(", "));
      return rows;
    });
  }

  function currentCutMode() {
    return $("cutMode").value === "manual" ? "manual" : "auto";
  }

  function readMeters(showErrors) {
    var alto = Number($("metersAlto").value);
    var medio = Number($("metersMedio").value);
    var basso = Number($("metersBasso").value);
    var valid = Number.isFinite(alto) && alto > 0 &&
      Number.isFinite(medio) && medio >= 0 &&
      Number.isFinite(basso) && basso >= 0 &&
      medio <= alto && basso <= medio;

    if (!valid && showErrors) {
      message("Inserisci metri validi rispettando Basso ≤ Medio ≤ Alto e Alto maggiore di zero.", "error");
    }
    return valid ? { alto: alto, medio: medio, basso: basso } : null;
  }

  function readStockDays(showErrors) {
    var medio = Number($("stockDaysMedio").value);
    var basso = Number($("stockDaysBasso").value);
    var valid = Number.isFinite(medio) && medio > 0 && Number.isFinite(basso) && basso > 0;
    if (!valid && showErrors) message("Inserisci giorni di scorta maggiori di zero per Medio e Basso.", "error");
    return valid ? { medio: medio, basso: basso } : null;
  }

  function readReferenceWeight() {
    var value = Number($("referenceWeight").value);
    if (!Number.isFinite(value)) value = 50;
    value = Math.max(0, Math.min(100, Math.round(value)));
    $("referenceWeight").value = String(value);
    $("quantityWeight").value = String(100 - value);
    $("weightTotal").textContent = "100%";
    return value;
  }

  function updateReady() {
    var ready = Boolean(
      window.XLSX &&
      state.clusterRows.length &&
      state.assortmentRows.length &&
      state.salesRows.length &&
      readMeters(false) &&
      readStockDays(false) &&
      state.selectedClusters.length
    );
    $("analyzeButton").disabled = !ready;
  }

  function updateRatios() {
    var meters = readMeters(false);
    if (!meters) {
      $("ratioPreview").textContent = "Inserisci i metri rispettando Basso ≤ Medio ≤ Alto.";
    } else {
      $("ratioPreview").innerHTML = "Alto <b>100%</b> · Medio <b>" + pct(meters.medio / meters.alto) +
        "</b> · Basso <b>" + pct(meters.basso / meters.alto) + "</b>";
    }
    updateReady();
  }

  function updateWeightUi() {
    var manual = currentCutMode() === "manual";
    var referenceInput = $("referenceWeight");
    referenceInput.disabled = !manual;
    $("manualWeights").classList.toggle("is-disabled", !manual);
    $("manualWeights").setAttribute("aria-disabled", manual ? "false" : "true");
    $("autoWeightInfo").classList.toggle("hidden", manual);
    readReferenceWeight();
    updateReady();
  }

  function selectedClusterValues() {
    return Array.prototype.slice.call(document.querySelectorAll(".cluster-option:checked"))
      .map(function (input) { return input.value; });
  }

  function updateClusterSelection(changedInput) {
    var all = $("clusterAll");
    var options = Array.prototype.slice.call(document.querySelectorAll(".cluster-option"));

    if (changedInput === all) {
      options.forEach(function (option) { option.checked = all.checked; });
    } else {
      all.checked = options.every(function (option) { return option.checked; });
    }

    var selected = selectedClusterValues();
    if (!selected.length) {
      var fallback = changedInput && changedInput.classList.contains("cluster-option") ? changedInput : options[0];
      fallback.checked = true;
      selected = selectedClusterValues();
      all.checked = selected.length === options.length;
    }

    state.selectedClusters = E.normalizeClusterSelection(selected);
    $("clusterSelectLabel").textContent = state.selectedClusters.length === 3 ? "Tutti i cluster" : state.selectedClusters.join(", ");
    $("clusterChips").innerHTML = state.selectedClusters.map(function (cluster) {
      return '<span class="chip">' + escapeHtml(cluster) + "</span>";
    }).join("");
    updateReady();
  }

  function setupClusterSelector() {
    $("clusterAll").addEventListener("change", function () { updateClusterSelection(this); });
    document.querySelectorAll(".cluster-option").forEach(function (input) {
      input.addEventListener("change", function () { updateClusterSelection(this); });
    });
    updateClusterSelection($("clusterAll"));
  }

  function renderKpis(results) {
    var rows = results.rows;
    var highReferences = rows.filter(function (row) { return row.GAlto > 0; }).length;
    var highQuantity = rows.reduce(function (sum, row) { return sum + row.GAlto; }, 0);
    var items = [
      ["Alto", highReferences + " ref.", fmt(highQuantity) + " pezzi · 100%"],
      ["Medio proposto", results.medium.proposedReferences + " ref.", fmt(results.medium.proposedUnits) + " pezzi · capacità " + fmt(results.medium.quantityCapacity)],
      ["Basso proposto", results.low.proposedReferences + " ref.", fmt(results.low.proposedUnits) + " pezzi · capacità " + fmt(results.low.quantityCapacity)],
      ["Gini vendite", fmt(results.metrics.gini, 3), results.concentration],
      ["Peso referenze", pct(results.weights.referenceWeight), "quantità " + pct(results.weights.quantityWeight)],
      ["Scorta stimata", days(results.medium.achievedDays), "Medio · Basso " + days(results.low.achievedDays)]
    ];

    $("kpis").innerHTML = items.map(function (item) {
      return '<div class="kpi"><span class="kpi-label">' + escapeHtml(item[0]) +
        '</span><span class="kpi-value">' + escapeHtml(item[1]) +
        '</span><span class="kpi-help">' + escapeHtml(item[2]) + "</span></div>";
    }).join("");
  }

  function renderSupplierTable() {
    var headers = ["Fornitore", "Vendite", "Ref. Alto", "Ref. Medio prop.", "Ref. Basso prop.", "Q.tà Alto", "Q.tà Medio prop.", "Q.tà Basso prop.", "Scorta Medio", "Scorta Basso"];
    var html = "<thead><tr>" + headers.map(function (header, index) {
      return '<th class="' + (index ? "num" : "") + '">' + escapeHtml(header) + "</th>";
    }).join("") + "</tr></thead><tbody>";

    state.suppliers.forEach(function (row) {
      html += "<tr><td>" + escapeHtml(row.Fornitore) + "</td>" +
        '<td class="num">' + fmt(row.Vendite) + "</td>" +
        '<td class="num">' + fmt(row.Ref_Alto) + "</td>" +
        '<td class="num">' + fmt(row.Ref_Medio_Proposte) + "</td>" +
        '<td class="num">' + fmt(row.Ref_Basso_Proposte) + "</td>" +
        '<td class="num">' + fmt(row.Qta_Alto) + "</td>" +
        '<td class="num">' + fmt(row.Qta_Medio_Proposta) + "</td>" +
        '<td class="num">' + fmt(row.Qta_Basso_Proposta) + "</td>" +
        '<td class="num">' + days(row.Giorni_Scorta_Medio) + "</td>" +
        '<td class="num">' + days(row.Giorni_Scorta_Basso) + "</td></tr>";
    });
    $("supplierTable").innerHTML = html + "</tbody>";
  }

  function badge(actionText) {
    var cssClass = actionText === "Eliminare" ? "remove" :
      (actionText === "Ridurre" ? "reduce" :
        (actionText === "Aumentare" || actionText === "Inserire" ? "increase" : "keep"));
    return '<span class="badge ' + cssClass + '">' + escapeHtml(actionText) + "</span>";
  }

  function renderDetailTable() {
    if (!state.results) return;
    var query = String($("searchInput").value || "").trim().toLowerCase();
    var rows = state.results.rows.filter(function (row) {
      if (!query) return true;
      return [row.article_id, row.sku, row.description, row.supplier].join(" ").toLowerCase().indexOf(query) >= 0;
    });

    var headers = ["Rank", "Fornitore", "ID", "Prodotto", "Art_Pz", "Vendite", "Vend./store/giorno", "GAlto", "GMedio att.", "GMedio prop.", "Azione Medio", "GBasso att.", "GBasso prop.", "Azione Basso"];
    var html = "<thead><tr>" + headers.map(function (header, index) {
      return '<th class="' + ([0,4,5,6,7,8,9,11,12].indexOf(index) >= 0 ? "num" : "") + '">' + escapeHtml(header) + "</th>";
    }).join("") + "</tr></thead><tbody>";

    rows.forEach(function (row) {
      html += "<tr>" +
        '<td class="num">' + fmt(row.performance_rank) + "</td>" +
        "<td>" + escapeHtml(row.supplier) + "</td>" +
        "<td>" + escapeHtml(row.article_id) + "</td>" +
        "<td>" + escapeHtml(row.description) + "</td>" +
        '<td class="num">' + fmt(row.pack_size) + "</td>" +
        '<td class="num">' + fmt(row.sales_selected) + "</td>" +
        '<td class="num">' + fmt(row.sales_per_store_day, 4) + "</td>" +
        '<td class="num">' + fmt(row.GAlto) + "</td>" +
        '<td class="num">' + fmt(row.GMedio) + "</td>" +
        '<td class="num">' + fmt(row.GMedio_proposto) + "</td>" +
        "<td>" + badge(row.azione_Medio) + "</td>" +
        '<td class="num">' + fmt(row.GBasso) + "</td>" +
        '<td class="num">' + fmt(row.GBasso_proposto) + "</td>" +
        "<td>" + badge(row.azione_Basso) + "</td></tr>";
    });
    $("detailTable").innerHTML = html + "</tbody>";
  }

  function renderQuality() {
    var quality = state.quality;
    var results = state.results;
    var items = [
      ["Versione applicazione", APP_VERSION],
      ["Righe vendite lette", fmt(quality.inputRows)],
      ["Righe usate", fmt(quality.usedRows)],
      ["Punti vendita considerati", fmt(quality.selectedStoreCount)],
      ["Righe online/totali ignorate", fmt(quality.ignoredOnlineOrTotals)],
      ["Articoli vendite non trovati", fmt(quality.articlesNotMatched)],
      ["Vendite non numeriche", fmt(quality.invalidSales)],
      ["Punti vendita non mappati", quality.storesNotMappedNames.length ? quality.storesNotMappedNames.join(", ") : "Nessuno"],
      ["Livello cluster usato", state.storeMapping.level_used],
      ["Periodo vendite assunto", fmt(E.SALES_PERIOD_DAYS, 1) + " giorni"],
      ["Coefficiente di Gini", fmt(results.metrics.gini, 4) + " · " + results.concentration],
      ["Coefficiente di variazione", fmt(results.metrics.cv, 4)],
      ["Modalità taglio", results.weights.mode === "auto" ? "Automatica" : "Manuale"],
      ["Peso taglio referenze", pct(results.weights.referenceWeight)],
      ["Peso taglio quantità", pct(results.weights.quantityWeight)],
      ["Medio: quota referenze", pct(results.medium.referenceShare)],
      ["Medio: quota quantità", pct(results.medium.quantityShare)],
      ["Basso: quota referenze", pct(results.low.referenceShare)],
      ["Basso: quota quantità", pct(results.low.quantityShare)]
    ];

    $("qualityContent").innerHTML = '<div class="quality-grid">' + items.map(function (item) {
      return '<div class="quality-item"><b>' + escapeHtml(item[0]) + "</b><span>" + escapeHtml(item[1]) + "</span></div>";
    }).join("") + "</div>";
  }

  function exportExcel() {
    if (!state.results) return;
    try {
      ensureSpreadsheetLibrary();
      var detail = state.results.rows.map(function (row) {
        return {
          Rank: row.performance_rank,
          Fornitore: row.supplier,
          Id: row.article_id,
          SkuCodice: row.sku,
          Prodotto: row.description,
          Art_Pz: row.pack_size,
          Vendite_Cluster_Selezionati: row.sales_selected,
          Vendita_Media_Giornaliera_Per_Store: row.sales_per_store_day,
          GAlto: row.GAlto,
          GMedio_Attuale: row.GMedio,
          GMedio_Proposto: row.GMedio_proposto,
          Giorni_Scorta_Medio_Stimati: row.giorni_Medio_raggiunti,
          Azione_Medio: row.azione_Medio,
          GBasso_Attuale: row.GBasso,
          GBasso_Proposto: row.GBasso_proposto,
          Giorni_Scorta_Basso_Stimati: row.giorni_Basso_raggiunti,
          Azione_Basso: row.azione_Basso
        };
      });

      var meters = readMeters(false);
      var stock = readStockDays(false);
      var results = state.results;
      var parameters = [
        { Parametro: "Versione", Valore: APP_VERSION },
        { Parametro: "Metri Alto", Valore: meters.alto },
        { Parametro: "Metri Medio", Valore: meters.medio },
        { Parametro: "Metri Basso", Valore: meters.basso },
        { Parametro: "% Medio su Alto", Valore: meters.medio / meters.alto },
        { Parametro: "% Basso su Alto", Valore: meters.basso / meters.alto },
        { Parametro: "Cluster vendite", Valore: state.selectedClusters.join(", ") },
        { Parametro: "Modalità taglio", Valore: results.weights.mode === "auto" ? "Automatica su Gini" : "Manuale" },
        { Parametro: "Gini", Valore: results.metrics.gini },
        { Parametro: "Coefficiente di variazione", Valore: results.metrics.cv },
        { Parametro: "Peso taglio referenze", Valore: results.weights.referenceWeight },
        { Parametro: "Peso taglio quantità", Valore: results.weights.quantityWeight },
        { Parametro: "Giorni scorta Medio", Valore: stock.medio },
        { Parametro: "Giorni scorta Basso", Valore: stock.basso },
        { Parametro: "Periodo vendite giorni", Valore: E.SALES_PERIOD_DAYS },
        { Parametro: "Filtro", Valore: "Breve = N" },
        { Parametro: "Livello cluster", Valore: state.storeMapping.level_used }
      ];

      var workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(state.suppliers), "Riepilogo Fornitori");
      window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(detail), "Dettaglio");
      window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(parameters), "Parametri");
      window.XLSX.writeFile(workbook, "Dimensionamento_Assortimento.xlsx");
    } catch (error) {
      message("Esportazione non riuscita: " + error.message, "error");
    }
  }

  function analyze() {
    clearMessages();
    try {
      var meters = readMeters(true);
      var stock = readStockDays(true);
      if (!meters || !stock) return;

      state.assortment = E.prepareAssortment(state.assortmentRows);
      if (!state.assortment.length) {
        message("Nessuna referenza valida con Breve = N e GAlto maggiore di zero.", "error");
        return;
      }

      state.scope = E.detectScope(state.assortment);
      if (state.scope.multiple) {
        message("Il file assortimento deve contenere una sola sottofamiglia per volta.", "error");
        return;
      }

      state.storeMapping = E.prepareClusterMapping(state.clusterRows, state.scope);
      if (!state.storeMapping.length) {
        message("La sottofamiglia non è stata trovata nel file fisso dei cluster.", "error");
        return;
      }

      var performance = E.calculatePerformance(state.assortment, state.salesRows, state.storeMapping, state.selectedClusters);
      if (!performance.metrics.selectedStoreCount) {
        message("Nessun punto vendita appartiene ai cluster selezionati.", "error");
        return;
      }

      state.quality = performance.quality;
      state.results = E.buildProposals(performance.rows, meters, {
        cutMode: currentCutMode(),
        manualReferenceWeight: readReferenceWeight(),
        stockDaysMedio: stock.medio,
        stockDaysBasso: stock.basso
      }, performance.metrics);
      state.suppliers = E.supplierSummary(state.results.rows);

      if (state.results.weights.mode === "auto") {
        $("autoWeightInfo").innerHTML = "Gini <b>" + fmt(state.results.metrics.gini, 3) + "</b> (" +
          escapeHtml(state.results.concentration) + "): taglio referenze <b>" + pct(state.results.weights.referenceWeight) +
          "</b>, taglio quantità <b>" + pct(state.results.weights.quantityWeight) + "</b>.";
      }

      $("scopeBanner").innerHTML = "<b>" + escapeHtml(state.scope.reparto) + "</b> → " +
        escapeHtml(state.scope.gruppo) + " → <b>" + escapeHtml(state.scope.famiglia) +
        "</b> · vendite: " + escapeHtml(state.selectedClusters.join(", "));
      $("methodBanner").innerHTML = "Metri fissi: Alto <b>" + fmt(meters.alto, 2) + " m</b>, Medio <b>" +
        fmt(meters.medio, 2) + " m</b>, Basso <b>" + fmt(meters.basso, 2) +
        " m</b>. Capacità equivalente Medio <b>" + fmt(state.results.medium.quantityCapacity) +
        " pezzi</b>, Basso <b>" + fmt(state.results.low.quantityCapacity) + " pezzi</b>.";

      renderKpis(state.results);
      renderSupplierTable();
      renderDetailTable();
      renderQuality();
      $("welcome").classList.add("hidden");
      $("results").classList.remove("hidden");

      if (performance.metrics.totalSales <= 0) {
        message("Non risultano vendite positive nei cluster selezionati: la graduatoria usa GAlto come criterio secondario.", "warning");
      }
    } catch (error) {
      console.error(error);
      message("Analisi non riuscita: " + error.message, "error");
    }
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (tab) { tab.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (panel) { panel.classList.remove("active"); });
        button.classList.add("active");
        $(button.dataset.tab).classList.add("active");
      });
    });
  }

  function bindFileInputs() {
    $("assortmentFile").addEventListener("change", function () {
      clearMessages();
      var file = this.files[0];
      $("assortmentName").textContent = file ? file.name : "Nessun file selezionato";
      state.assortmentRows = [];
      if (!file) return updateReady();

      try {
        loadFile(file, "Q_Temp", REQUIRED_ASSORTMENT).then(function (rows) {
          state.assortmentRows = rows;
          message("File assortimento caricato: " + rows.length + " righe.", "info");
          updateReady();
        }).catch(function (error) {
          message("Assortimento non valido. " + error.message, "error");
          updateReady();
        });
      } catch (error) {
        message(error.message, "error");
        updateReady();
      }
    });

    $("salesFile").addEventListener("change", function () {
      clearMessages();
      var file = this.files[0];
      $("salesName").textContent = file ? file.name : "Nessun file selezionato";
      state.salesRows = [];
      if (!file) return updateReady();

      try {
        loadFile(file, "Q_TempPV", REQUIRED_SALES).then(function (rows) {
          state.salesRows = rows;
          message("File vendite caricato: " + rows.length + " righe.", "info");
          updateReady();
        }).catch(function (error) {
          message("Vendite non valide. " + error.message, "error");
          updateReady();
        });
      } catch (error) {
        message(error.message, "error");
        updateReady();
      }
    });
  }

  function loadClusters() {
    if (!window.XLSX) {
      setStatus("Libreria Excel non disponibile", "error");
      message("La libreria Excel non è stata caricata. Aggiorna la pagina con Ctrl+F5.", "error");
      return;
    }

    var url = new URL("data/config/Cluster.xlsx?v=20260715-3", document.baseURI).toString();
    fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }).then(function (buffer) {
      state.clusterRows = rowsFrom(readWorkbook(buffer), "Q_Temp");
      var missing = missingColumns(state.clusterRows, REQUIRED_CLUSTER);
      if (missing.length) throw new Error("colonne mancanti: " + missing.join(", "));
      setStatus("Cluster disponibili", "ok");
      updateReady();
    }).catch(function (error) {
      setStatus("Errore cluster", "error");
      message("Impossibile leggere data/config/Cluster.xlsx: " + error.message, "error");
    });
  }

  function bindControls() {
    ["metersAlto", "metersMedio", "metersBasso"].forEach(function (id) {
      $(id).addEventListener("input", updateRatios);
    });
    ["stockDaysMedio", "stockDaysBasso"].forEach(function (id) {
      $(id).addEventListener("input", updateReady);
    });
    $("cutMode").addEventListener("change", updateWeightUi);
    $("referenceWeight").addEventListener("input", function () {
      readReferenceWeight();
      updateReady();
    });
    $("analyzeButton").addEventListener("click", analyze);
    $("exportButton").addEventListener("click", exportExcel);
    $("searchInput").addEventListener("input", renderDetailTable);
  }

  function init() {
    E = window.AssortmentEngine;
    if (!E) {
      setStatus("Errore motore", "error");
      message("Il motore di calcolo non è stato caricato. Aggiorna la pagina con Ctrl+F5.", "error");
      return;
    }

    bindControls();
    setupTabs();
    setupClusterSelector();
    bindFileInputs();
    updateRatios();
    updateWeightUi();
    loadClusters();
  }

  window.addEventListener("error", function (event) {
    if ($("messages")) message("Errore applicazione: " + (event.message || "errore sconosciuto"), "error");
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
