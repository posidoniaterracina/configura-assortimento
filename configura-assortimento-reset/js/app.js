(function () {
  "use strict";
  var E = window.AssortmentEngine;
  var $ = function (id) { return document.getElementById(id); };
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

  var REQUIRED_ASSORTMENT = ["Id", "Prodotto", "Reparto", "Famiglia", "SttFamiglia", "GAlto", "GMedio", "GBasso", "Fornitore", "Art_Pz", "Breve"];
  var REQUIRED_SALES = ["Fk_Prd", "Negozio", "Vnd"];
  var REQUIRED_CLUSTER = ["Descrizione", "Tipo", "Reparto", "Gruppo", "Famiglia", "Priorita"];

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function fmt(value, digits) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "–";
    return n.toLocaleString("it-IT", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }
  function pct(value) { return fmt(value * 100, 1) + "%"; }
  function setStatus(text, type) {
    $("clusterStatus").textContent = text;
    $("clusterStatus").className = "status-pill" + (type ? " " + type : "");
  }
  function clearMessages() { $("messages").innerHTML = ""; }
  function message(text, type) {
    var div = document.createElement("div");
    div.className = "message " + (type || "info");
    div.textContent = text;
    $("messages").appendChild(div);
  }
  function readWorkbook(buffer) { return XLSX.read(buffer, { type: "array", cellDates: true }); }
  function rowsFrom(workbook, preferredSheet) {
    if (!workbook) return [];
    var sheetName = workbook.SheetNames.indexOf(preferredSheet) >= 0 ? preferredSheet : workbook.SheetNames[0];
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: true, blankrows: false });
  }
  function missingColumns(rows, required) {
    var columns = rows.length ? Object.keys(rows[0]) : [];
    return required.filter(function (x) { return columns.indexOf(x) < 0; });
  }
  function loadFile(file, sheet, required) {
    return file.arrayBuffer().then(function (buffer) {
      var rows = rowsFrom(readWorkbook(buffer), sheet);
      if (!rows.length) throw new Error("Il file non contiene righe leggibili.");
      var missing = missingColumns(rows, required);
      if (missing.length) throw new Error("Colonne mancanti: " + missing.join(", "));
      return rows;
    });
  }

  function updateReady() {
    var meters = readMeters(false);
    var hasMode = $("resizeReferences").checked || $("resizeQuantities").checked;
    $("analyzeButton").disabled = !(state.clusterRows.length && state.assortmentRows.length && state.salesRows.length && meters && hasMode);
  }

  function readMeters(showErrors) {
    var alto = Number($("metersAlto").value);
    var medio = Number($("metersMedio").value);
    var basso = Number($("metersBasso").value);
    var valid = Number.isFinite(alto) && alto > 0 && Number.isFinite(medio) && medio >= 0 && Number.isFinite(basso) && basso >= 0;
    if (valid && (medio > alto || basso > alto)) valid = false;
    if (valid && basso > medio) valid = false;
    if (!valid && showErrors) message("Inserisci metri validi rispettando Basso ≤ Medio ≤ Alto e Alto maggiore di zero.", "error");
    return valid ? { alto: alto, medio: medio, basso: basso } : null;
  }

  function updateRatios() {
    var meters = readMeters(false);
    if (!meters) {
      $("ratioPreview").textContent = "Inserisci i metri rispettando Basso ≤ Medio ≤ Alto.";
    } else {
      $("ratioPreview").innerHTML = "Alto <b>100%</b> · Medio <b>" + pct(meters.medio / meters.alto) + "</b> · Basso <b>" + pct(meters.basso / meters.alto) + "</b>";
    }
    updateReady();
  }

  function setupClusterSelector() {
    var menu = $("clusterSelectMenu");
    var button = $("clusterSelectButton");
    button.addEventListener("click", function () {
      var hidden = menu.classList.toggle("hidden");
      button.setAttribute("aria-expanded", hidden ? "false" : "true");
    });
    document.addEventListener("click", function (event) {
      if (!$("clusterSelect").contains(event.target)) {
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
      }
    });
    menu.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("change", function () {
        var all = menu.querySelector('input[value="Tutti"]');
        var singles = Array.from(menu.querySelectorAll('input:not([value="Tutti"])'));
        if (input.value === "Tutti") singles.forEach(function (x) { x.checked = input.checked; });
        else all.checked = singles.every(function (x) { return x.checked; });
        var selected = singles.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        if (!selected.length) {
          input.checked = true;
          selected = singles.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        }
        state.selectedClusters = selected;
        $("clusterSelectLabel").textContent = selected.length === 3 ? "Tutti i cluster" : selected.join(", ");
        updateReady();
      });
    });
  }

  function renderKpis(meters, proposals) {
    var rows = proposals.rows;
    var highRefs = rows.filter(function (r) { return r.GAlto > 0; }).length;
    var highQty = rows.reduce(function (s, r) { return s + r.GAlto; }, 0);
    var items = [
      ["Alto", highRefs + " ref.", fmt(highQty) + " pezzi · 100%"],
      ["Medio proposto", proposals.medium.proposedReferences + " ref.", fmt(proposals.medium.proposedUnits) + " pezzi · " + pct(meters.medio / meters.alto)],
      ["Basso proposto", proposals.low.proposedReferences + " ref.", fmt(proposals.low.proposedUnits) + " pezzi · " + pct(meters.basso / meters.alto)],
      ["Vendite analizzate", fmt(rows.reduce(function (s, r) { return s + r.sales_selected; }, 0)), state.selectedClusters.join(", ")],
      ["Fornitori", fmt(state.suppliers.length), "colonna Fornitore"]
    ];
    $("kpis").innerHTML = items.map(function (x) {
      return '<div class="kpi"><span class="kpi-label">' + escapeHtml(x[0]) + '</span><span class="kpi-value">' + escapeHtml(x[1]) + '</span><span class="kpi-help">' + escapeHtml(x[2]) + '</span></div>';
    }).join("");
  }

  function renderSupplierTable() {
    var headers = ["Fornitore", "Vendite", "Ref. Alto", "Ref. Medio att.", "Ref. Medio prop.", "Ref. Basso att.", "Ref. Basso prop.", "Q.tà Alto", "Q.tà Medio prop.", "Q.tà Basso prop."];
    var html = "<thead><tr>" + headers.map(function (h, i) { return '<th class="' + (i ? "num" : "") + '">' + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead><tbody>";
    state.suppliers.forEach(function (r) {
      html += "<tr><td>" + escapeHtml(r.Fornitore) + "</td>" +
        '<td class="num">' + fmt(r.Vendite) + "</td>" +
        '<td class="num">' + fmt(r.Ref_Alto) + "</td>" +
        '<td class="num">' + fmt(r.Ref_Medio_Attuali) + "</td>" +
        '<td class="num">' + fmt(r.Ref_Medio_Proposte) + "</td>" +
        '<td class="num">' + fmt(r.Ref_Basso_Attuali) + "</td>" +
        '<td class="num">' + fmt(r.Ref_Basso_Proposte) + "</td>" +
        '<td class="num">' + fmt(r.Qta_Alto) + "</td>" +
        '<td class="num">' + fmt(r.Qta_Medio_Proposta) + "</td>" +
        '<td class="num">' + fmt(r.Qta_Basso_Proposta) + "</td></tr>";
    });
    $("supplierTable").innerHTML = html + "</tbody>";
  }

  function badge(action) {
    var cls = action === "Eliminare" ? "remove" : (action === "Ridurre" ? "reduce" : "keep");
    return '<span class="badge ' + cls + '">' + escapeHtml(action) + "</span>";
  }

  function renderDetailTable() {
    var query = E.normalizeText($("searchInput").value);
    var rows = state.results.rows.slice().sort(function (a, b) {
      var supplier = a.supplier.localeCompare(b.supplier, "it", { sensitivity: "base" });
      return supplier || a.performance_rank - b.performance_rank;
    }).filter(function (r) {
      if (!query) return true;
      return E.normalizeText(r.supplier + " " + r.description + " " + r.article_id + " " + r.sku).indexOf(query) >= 0;
    });
    var headers = ["Fornitore", "Rank", "ID", "Prodotto", "Art_Pz", "Vendite", "GAlto", "GMedio att.", "GMedio prop.", "Azione Medio", "GBasso att.", "GBasso prop.", "Azione Basso"];
    var html = "<thead><tr>" + headers.map(function (h, i) { return '<th class="' + ([1,4,5,6,7,8,10,11].indexOf(i) >= 0 ? "num" : "") + '">' + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead><tbody>";
    var previousSupplier = null;
    rows.forEach(function (r) {
      var start = previousSupplier !== null && previousSupplier !== r.supplier ? " supplier-start" : "";
      previousSupplier = r.supplier;
      html += '<tr class="' + start.trim() + '"><td>' + escapeHtml(r.supplier) + "</td>" +
        '<td class="num">' + fmt(r.performance_rank) + "</td>" +
        "<td>" + escapeHtml(r.article_id) + "</td><td>" + escapeHtml(r.description) + "</td>" +
        '<td class="num">' + fmt(r.pack_size) + "</td>" +
        '<td class="num">' + fmt(r.sales_selected) + "</td>" +
        '<td class="num">' + fmt(r.GAlto) + "</td>" +
        '<td class="num">' + fmt(r.GMedio) + "</td>" +
        '<td class="num"><b>' + fmt(r.GMedio_proposto) + "</b></td><td>" + badge(r.azione_Medio) + "</td>" +
        '<td class="num">' + fmt(r.GBasso) + "</td>" +
        '<td class="num"><b>' + fmt(r.GBasso_proposto) + "</b></td><td>" + badge(r.azione_Basso) + "</td></tr>";
    });
    $("detailTable").innerHTML = html + "</tbody>";
  }

  function renderQuality() {
    var q = state.quality;
    var items = [
      ["Righe vendite lette", fmt(q.inputRows)],
      ["Righe usate nell'analisi", fmt(q.usedRows)],
      ["Punti vendita considerati", fmt(q.selectedStoreCount)],
      ["Righe online/totali ignorate", fmt(q.ignoredOnlineOrTotals)],
      ["Articoli vendite non trovati", fmt(q.articlesNotMatched)],
      ["Vendite non numeriche", fmt(q.invalidSales)],
      ["Punti vendita non mappati", q.storesNotMappedNames.length ? q.storesNotMappedNames.join(", ") : "Nessuno"],
      ["Livello cluster usato", state.storeMapping.level_used]
    ];
    $("qualityContent").innerHTML = '<div class="quality-grid">' + items.map(function (x) {
      return '<div class="quality-item"><b>' + escapeHtml(x[0]) + "</b><span>" + escapeHtml(x[1]) + "</span></div>";
    }).join("") + "</div>";
  }

  function exportExcel() {
    if (!state.results) return;
    var detail = state.results.rows.slice().sort(function (a, b) {
      var supplier = a.supplier.localeCompare(b.supplier, "it", { sensitivity: "base" });
      return supplier || a.performance_rank - b.performance_rank;
    }).map(function (r) {
      return {
        Fornitore: r.supplier,
        Rank: r.performance_rank,
        Id: r.article_id,
        SkuCodice: r.sku,
        Prodotto: r.description,
        Art_Pz: r.pack_size,
        Vendite_Cluster_Selezionati: r.sales_selected,
        GAlto: r.GAlto,
        GMedio_Attuale: r.GMedio,
        GMedio_Proposto: r.GMedio_proposto,
        Azione_Medio: r.azione_Medio,
        GBasso_Attuale: r.GBasso,
        GBasso_Proposto: r.GBasso_proposto,
        Azione_Basso: r.azione_Basso
      };
    });
    var supplier = state.suppliers.map(function (r) { return Object.assign({}, r); });
    var meters = readMeters(false);
    var parameters = [
      { Parametro: "Metri Alto", Valore: meters.alto },
      { Parametro: "Metri Medio", Valore: meters.medio },
      { Parametro: "Metri Basso", Valore: meters.basso },
      { Parametro: "% Medio su Alto", Valore: meters.medio / meters.alto },
      { Parametro: "% Basso su Alto", Valore: meters.basso / meters.alto },
      { Parametro: "Cluster vendite", Valore: state.selectedClusters.join(", ") },
      { Parametro: "Ridimensiona n° referenze", Valore: $("resizeReferences").checked ? "Sì" : "No" },
      { Parametro: "Ridimensiona quantità", Valore: $("resizeQuantities").checked ? "Sì" : "No" },
      { Parametro: "Filtro", Valore: "Breve = N" },
      { Parametro: "Livello cluster", Valore: state.storeMapping.level_used }
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplier), "Riepilogo Fornitori");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Dettaglio");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parameters), "Parametri");
    XLSX.writeFile(wb, "Bilanciamento_Assortimento.xlsx");
  }

  function analyze() {
    clearMessages();
    var meters = readMeters(true);
    if (!meters) return;
    var options = { resizeReferences: $("resizeReferences").checked, resizeQuantities: $("resizeQuantities").checked };
    if (!options.resizeReferences && !options.resizeQuantities) {
      message("Seleziona almeno una priorità di ridimensionamento.", "error");
      return;
    }
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
    state.quality = performance.quality;
    state.results = E.buildProposals(performance.rows, meters, options);
    state.suppliers = E.supplierSummary(state.results.rows);

    $("scopeBanner").innerHTML = "<b>" + escapeHtml(state.scope.reparto) + "</b> → " + escapeHtml(state.scope.gruppo) + " → <b>" + escapeHtml(state.scope.famiglia) + "</b> · vendite: " + escapeHtml(state.selectedClusters.join(", "));
    renderKpis(meters, state.results);
    renderSupplierTable();
    renderDetailTable();
    renderQuality();
    $("welcome").classList.add("hidden");
    $("results").classList.remove("hidden");
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (x) { x.classList.remove("active"); });
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
      loadFile(file, "Q_Temp", REQUIRED_ASSORTMENT).then(function (rows) {
        state.assortmentRows = rows;
        message("File assortimento caricato: " + rows.length + " righe.", "info");
        updateReady();
      }).catch(function (error) { message("Assortimento non valido. " + error.message, "error"); updateReady(); });
    });
    $("salesFile").addEventListener("change", function () {
      clearMessages();
      var file = this.files[0];
      $("salesName").textContent = file ? file.name : "Nessun file selezionato";
      state.salesRows = [];
      if (!file) return updateReady();
      loadFile(file, "Q_TempPV", REQUIRED_SALES).then(function (rows) {
        state.salesRows = rows;
        message("File vendite caricato: " + rows.length + " righe.", "info");
        updateReady();
      }).catch(function (error) { message("Vendite non valide. " + error.message, "error"); updateReady(); });
    });
  }

  function loadClusters() {
    fetch("data/config/Cluster.xlsx", { cache: "no-store" }).then(function (response) {
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

  ["metersAlto", "metersMedio", "metersBasso"].forEach(function (id) { $(id).addEventListener("input", updateRatios); });
  ["resizeReferences", "resizeQuantities"].forEach(function (id) { $(id).addEventListener("change", updateReady); });
  $("analyzeButton").addEventListener("click", analyze);
  $("exportButton").addEventListener("click", exportExcel);
  $("searchInput").addEventListener("input", renderDetailTable);
  setupTabs();
  setupClusterSelector();
  bindFileInputs();
  loadClusters();
  updateRatios();
})();
