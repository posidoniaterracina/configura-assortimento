(function () {
  "use strict";

  var E = window.AssortmentEngine;
  var state = {
    clusterWorkbook: null,
    clusterRows: [],
    clusterSheet: "",
    assortmentWorkbook: null,
    salesWorkbook: null,
    assortmentRows: [],
    salesRows: [],
    assortmentMapping: {
      id: "Id", sku: "SkuCodice", description: "Prodotto", reparto: "Reparto",
      gruppo: "Famiglia", famiglia: "SttFamiglia", breve: "Breve",
      galto: "GAlto", gmedio: "GMedio", gbasso: "GBasso",
      pack: "Art_Pz", volume: "", brand: "Brand"
    },
    salesMapping: {
      article: "Fk_Prd", store: "Negozio", storeCode: "Pv", quantity: "Vnd",
      date: "Data", purchases: "Acq", finalStock: "GFn"
    },
    clusterMapping: {
      store: "Descrizione", priority: "Priorita", type: "Tipo",
      reparto: "Reparto", gruppo: "Gruppo", famiglia: "Famiglia"
    },
    scope: { reparto: "", gruppo: "", famiglia: "" },
    preparedAssortment: [],
    mappedStores: [],
    salesInfo: null,
    metrics: null,
    proposal: [],
    baseSummary: []
  };

  var $ = function (id) { return document.getElementById(id); };

  var REQUIRED_ASSORTMENT_COLUMNS = [
    "Id", "SkuCodice", "Prodotto", "Reparto", "Famiglia", "SttFamiglia",
    "Breve", "GAlto", "GMedio", "GBasso"
  ];

  var REQUIRED_SALES_COLUMNS = [
    "Fk_Prd", "Prodotto", "Pv", "Negozio", "Acq", "Vnd", "GFn", "Data"
  ];

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmt(value, digits) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "–";
    return n.toLocaleString("it-IT", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }

  function fmtDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "–";
    return value.toLocaleDateString("it-IT");
  }

  function setStatus(text, type) {
    var el = $("clusterStatus");
    el.textContent = text;
    el.className = "status-pill" + (type ? " " + type : "");
  }

  function clearMessages() { $("globalMessages").innerHTML = ""; }

  function message(text, type) {
    var div = document.createElement("div");
    div.className = "message " + (type || "info");
    div.textContent = text;
    $("globalMessages").appendChild(div);
  }

  function readWorkbookFromArrayBuffer(buffer) {
    return XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
  }

  function workbookRows(workbook, sheetName) {
    if (!workbook || !sheetName || !workbook.Sheets[sheetName]) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
      raw: true,
      blankrows: false
    });
  }

  function populateSheetSelect(select, workbook) {
    select.innerHTML = "";
    (workbook ? workbook.SheetNames : []).forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function columnsOf(rows) {
    var seen = {};
    rows.slice(0, 50).forEach(function (row) {
      Object.keys(row).forEach(function (col) { seen[col] = true; });
    });
    return Object.keys(seen);
  }

  function missingColumns(rows, required) {
    var cols = columnsOf(rows);
    return required.filter(function (name) { return cols.indexOf(name) < 0; });
  }

  function preferredSheet(workbook, expected) {
    if (!workbook || !workbook.SheetNames.length) return "";
    return workbook.SheetNames.indexOf(expected) >= 0 ? expected : workbook.SheetNames[0];
  }

  function setOptions(select, values, selected, emptyLabel) {
    select.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = emptyLabel || "Tutti";
    select.appendChild(blank);
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (selected && values.indexOf(selected) >= 0) select.value = selected;
    else if (values.length === 1) select.value = values[0];
  }

  function rowMatches(row, column, value) {
    return !value || !column || E.normalizeText(row[column]) === E.normalizeText(value);
  }

  function refreshScopeSelectors(changedLevel) {
    var m = state.assortmentMapping;
    var rows = state.assortmentRows;
    if (!rows.length) return;

    var repartoSel = $("scopeReparto");
    var gruppoSel = $("scopeGruppo");
    var famigliaSel = $("scopeFamiglia");

    var repartoCurrent = changedLevel === "reparto" ? repartoSel.value : (repartoSel.value || state.scope.reparto);
    var reparti = E.uniqueValues(rows, m.reparto);
    setOptions(repartoSel, reparti, repartoCurrent, "Tutti i reparti");

    var reparto = repartoSel.value;
    var gruppoCurrent = changedLevel === "gruppo" ? gruppoSel.value : (gruppoSel.value || state.scope.gruppo);
    var gruppi = E.uniqueValues(rows, m.gruppo, function (row) { return rowMatches(row, m.reparto, reparto); });
    setOptions(gruppoSel, gruppi, gruppoCurrent, "Tutti i gruppi");

    var gruppo = gruppoSel.value;
    var famigliaCurrent = changedLevel === "famiglia" ? famigliaSel.value : (famigliaSel.value || state.scope.famiglia);
    var famiglie = E.uniqueValues(rows, m.famiglia, function (row) {
      return rowMatches(row, m.reparto, reparto) && rowMatches(row, m.gruppo, gruppo);
    });
    setOptions(famigliaSel, famiglie, famigliaCurrent, "Tutte le sottofamiglie");

    state.scope = { reparto: repartoSel.value, gruppo: gruppoSel.value, famiglia: famigliaSel.value };
  }

  function refreshAssortmentSheet() {
    var sheetName = preferredSheet(state.assortmentWorkbook, "Q_Temp");
    state.assortmentRows = workbookRows(state.assortmentWorkbook, sheetName);
    var missing = missingColumns(state.assortmentRows, REQUIRED_ASSORTMENT_COLUMNS);
    if (missing.length) throw new Error("File assortimento non valido. Colonne mancanti: " + missing.join(", ") + ".");
    $("scopeSection").classList.remove("hidden");
    refreshScopeSelectors();
  }

  function refreshSalesSheet() {
    var sheetName = preferredSheet(state.salesWorkbook, "Q_TempPV");
    state.salesRows = workbookRows(state.salesWorkbook, sheetName);
    var missing = missingColumns(state.salesRows, REQUIRED_SALES_COLUMNS);
    if (missing.length) throw new Error("File vendite non valido. Colonne mancanti: " + missing.join(", ") + ".");
  }

  function updateReadyState() {
    var ready = Boolean(state.clusterRows.length && state.assortmentRows.length && state.salesRows.length);
    $("parameterSection").classList.toggle("hidden", !ready);
    $("analyzeButton").disabled = !ready;
  }

  async function readUserFile(file, kind) {
    clearMessages();
    if (!file) return;
    try {
      var workbook = readWorkbookFromArrayBuffer(await file.arrayBuffer());
      if (kind === "assortment") {
        state.assortmentWorkbook = workbook;
        refreshAssortmentSheet();
      } else {
        state.salesWorkbook = workbook;
        refreshSalesSheet();
      }
      updateReadyState();
      message("File " + file.name + " caricato correttamente.", "info");
    } catch (error) {
      console.error(error);
      message(error.message || ("Impossibile leggere " + file.name + ". Verifica che sia un file Excel valido."), "error");
    }
  }

  async function loadFixedCluster() {
    try {
      var response = await fetch("data/config/Cluster.xlsx", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.clusterWorkbook = readWorkbookFromArrayBuffer(await response.arrayBuffer());
      state.clusterSheet = state.clusterWorkbook.SheetNames[0];
      state.clusterRows = workbookRows(state.clusterWorkbook, state.clusterSheet);
      var missing = missingColumns(state.clusterRows, ["Descrizione", "Tipo", "Reparto", "Gruppo", "Famiglia", "Priorita"]);
      if (!state.clusterRows.length || missing.length) {
        throw new Error("Colonne cluster non riconosciute: " + missing.join(", "));
      }
      setStatus("Cluster caricati: " + fmt(state.clusterRows.length), "ok");
      updateReadyState();
    } catch (error) {
      console.error(error);
      setStatus("Errore file cluster", "error");
      message("Il file fisso data/config/Cluster.xlsx non è disponibile o non contiene le colonne attese.", "error");
    }
  }

  function parameters() {
    return {
      targetMonths: Number($("targetMonths").value) || 2,
      safetyStock: Number($("safetyStock").value) || 0,
      insertionScore: Number($("insertionScore").value) || 70,
      minimumDisplay: Math.max(1, Number($("minimumDisplay").value) || 1),
      maxIncreasePct: Math.max(0, Number($("maxIncreasePct").value) || 0),
      maxReductionPct: Math.max(0, Number($("maxReductionPct").value) || 0),
      roundToPack: $("roundToPack").checked,
      enforceCapacity: $("enforceCapacity").checked,
      bassoCapacity: Number($("bassoCapacity").value)
    };
  }

  function validateBeforeAnalysis() {
    var errors = [];
    if (!state.assortmentRows.length) errors.push("Carica il file assortimento.");
    if (!state.salesRows.length) errors.push("Carica il file vendite.");
    if (!state.scope.famiglia) errors.push("Seleziona una famiglia/sottofamiglia per evitare di mescolare assortimenti diversi.");
    return errors;
  }

  function analyze() {
    clearMessages();
    state.scope = {
      reparto: $("scopeReparto").value,
      gruppo: $("scopeGruppo").value,
      famiglia: $("scopeFamiglia").value
    };
    var errors = validateBeforeAnalysis();
    if (errors.length) {
      errors.forEach(function (x) { message(x, "error"); });
      return;
    }

    try {
      state.preparedAssortment = E.prepareAssortment(state.assortmentRows, state.assortmentMapping, state.scope);
      if (!state.preparedAssortment.length) throw new Error("Nessuna referenza disponibile dopo il filtro Breve = N e il perimetro selezionato.");

      state.mappedStores = E.prepareClusterMapping(state.clusterRows, state.clusterMapping, state.scope);
      if (!state.mappedStores.length) throw new Error("Nessun punto vendita associato alla clusterizzazione del perimetro selezionato.");

      var months = 6;
      var salesPrepared = E.prepareSales(
        state.salesRows,
        state.salesMapping,
        state.mappedStores,
        state.preparedAssortment,
        months,
        XLSX
      );
      state.salesInfo = salesPrepared.info;
      state.metrics = E.calculateMetrics(state.preparedAssortment, salesPrepared.sales, state.mappedStores, months);

      var params = parameters();
      var currentSpace = state.preparedAssortment.reduce(function (sum, row) { return sum + row.GBasso * row.space_unit; }, 0);
      if (!Number.isFinite(params.bassoCapacity) || params.bassoCapacity <= 0) {
        params.bassoCapacity = currentSpace;
        $("bassoCapacity").value = String(Math.round(currentSpace * 100) / 100);
      }
      state.proposal = E.generateProposal(state.metrics.rows, params);
      state.baseSummary = E.baseSummary(state.preparedAssortment);

      renderResults();
      $("welcome").classList.add("hidden");
      $("results").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      message(error.message || "Errore durante l'elaborazione.", "error");
    }
  }

  function kpi(label, value, delta) {
    return '<div class="kpi"><span class="kpi-label">' + escapeHtml(label) + '</span><strong class="kpi-value">' + escapeHtml(value) + '</strong><span class="kpi-delta">' + escapeHtml(delta || "") + '</span></div>';
  }

  function renderResults() {
    var ps = E.proposalSummary(state.proposal);
    $("scopeBanner").innerHTML = "<strong>Perimetro:</strong> " +
      escapeHtml([state.scope.reparto, state.scope.gruppo, state.scope.famiglia].filter(Boolean).join(" › ")) +
      " &nbsp;·&nbsp; <strong>Filtro:</strong> Breve = N &nbsp;·&nbsp; <strong>Cluster:</strong> " + escapeHtml(state.mappedStores.level_used || "") +
      " &nbsp;·&nbsp; <strong>PV:</strong> " + fmt(state.mappedStores.length);

    $("kpis").innerHTML = [
      kpi("Referenze analizzate", fmt(ps.references), "Perimetro selezionato"),
      kpi("Inserimenti nel Basso", fmt(ps.insert), "Referenze oggi a zero"),
      kpi("Riduzioni", fmt(ps.reduce + ps.remove), "Spazio recuperato"),
      kpi("Pezzi Basso", fmt(ps.proposed), "Attuali: " + fmt(ps.current)),
      kpi("Spazio teorico", fmt(ps.proposedSpace, 1), "Attuale: " + fmt(ps.currentSpace, 1))
    ].join("");

    renderBaseSummary();
    renderBarChart();
    renderProposalFilters();
    renderProposalTable();
    renderQuality();
    $("proposalCaption").textContent = "Domanda stimata Basso calcolata usando vendite aggregate dei 6 mesi, penetrazione e rapporto Basso/Medio. Rapporto applicato: " + fmt(state.proposal.basso_medio_ratio, 2) + ".";
  }

  function renderBaseSummary() {
    var html = '<div class="summary-table"><div class="summary-row header"><span>Cluster</span><span>Referenze</span><span>Escluse</span><span>Pezzi</span><span>Spazio</span></div>';
    state.baseSummary.forEach(function (row) {
      html += '<div class="summary-row"><strong>' + escapeHtml(row.Cluster) + '</strong><span>' + fmt(row["Referenze presenti"]) + '</span><span>' + fmt(row["Referenze escluse"]) + '</span><span>' + fmt(row["Pezzi teorici"]) + '</span><span>' + fmt(row["Indice spazio teorico"], 1) + '</span></div>';
    });
    html += "</div>";
    $("baseSummary").innerHTML = html;
  }

  function renderBarChart() {
    var max = Math.max.apply(null, state.baseSummary.map(function (r) { return r["Referenze presenti"]; }).concat([1]));
    $("barChart").innerHTML = state.baseSummary.map(function (row) {
      var width = row["Referenze presenti"] / max * 100;
      return '<div class="bar-row"><strong>' + escapeHtml(row.Cluster) + '</strong><div class="bar-track"><div class="bar-fill" style="width:' + width.toFixed(1) + '%"></div></div><span class="num">' + fmt(row["Referenze presenti"]) + '</span></div>';
    }).join("");
  }

  function renderProposalFilters() {
    var actions = {};
    state.proposal.forEach(function (r) { actions[r.azione_Basso] = true; });
    var select = $("actionFilter");
    var current = select.value;
    select.innerHTML = '<option value="">Tutte le azioni</option>';
    Object.keys(actions).sort().forEach(function (action) {
      var option = document.createElement("option");
      option.value = action;
      option.textContent = action;
      select.appendChild(option);
    });
    if (actions[current]) select.value = current;
  }

  function actionBadge(action) {
    var cls = "keep";
    if (action === "Inserire") cls = "insert";
    else if (action === "Aumentare") cls = "up";
    else if (action === "Ridurre") cls = "down";
    else if (action === "Eliminare") cls = "delete";
    return '<span class="badge ' + cls + '">' + escapeHtml(action) + "</span>";
  }

  function filteredProposal() {
    var query = E.normalizeText($("proposalSearch").value);
    var action = $("actionFilter").value;
    return state.proposal.filter(function (row) {
      var haystack = E.normalizeText([row.article_id, row.sku, row.description, row.brand].join(" "));
      return (!query || haystack.indexOf(query) >= 0) && (!action || row.azione_Basso === action);
    });
  }

  function renderProposalTable() {
    var rows = filteredProposal();
    var headers = ["ID", "SKU", "Descrizione", "GAlto", "GMedio", "GBasso", "Vendita mensile Basso", "Punteggio", "Proposto Basso", "Delta", "Azione", "Motivazione"];
    var html = "<thead><tr>" + headers.map(function (h) { return "<th>" + escapeHtml(h) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      html += "<tr>" +
        "<td>" + escapeHtml(r.article_id) + "</td>" +
        "<td>" + escapeHtml(r.sku) + "</td>" +
        "<td>" + escapeHtml(r.description) + "</td>" +
        '<td class="num">' + fmt(r.GAlto) + "</td>" +
        '<td class="num">' + fmt(r.GMedio) + "</td>" +
        '<td class="num">' + fmt(r.GBasso) + "</td>" +
        '<td class="num">' + fmt(r.estimated_monthly_Basso, 2) + "</td>" +
        '<td class="num">' + fmt(r.score_generale, 1) + "</td>" +
        '<td class="num"><strong>' + fmt(r.GBasso_proposto) + "</strong></td>" +
        '<td class="num">' + (r.delta_GBasso > 0 ? "+" : "") + fmt(r.delta_GBasso) + "</td>" +
        "<td>" + actionBadge(r.azione_Basso) + "</td>" +
        "<td>" + escapeHtml(r.motivazione) + "</td>" +
        "</tr>";
    });
    html += "</tbody>";
    $("proposalTable").innerHTML = html;
  }

  function renderQuality() {
    var info = state.salesInfo || {};
    var duplicateKeys = {};
    var duplicates = 0;
    state.preparedAssortment.forEach(function (r) {
      var key = E.normalizeId(r.article_id || r.sku);
      if (!key) return;
      if (duplicateKeys[key]) duplicates += 1;
      duplicateKeys[key] = true;
    });
    var zeroAll = state.preparedAssortment.filter(function (r) { return r.GAlto <= 0 && r.GMedio <= 0 && r.GBasso <= 0; }).length;
    var noSales = state.metrics.rows.filter(function (r) { return r.pieces_Alto + r.pieces_Medio + r.pieces_Basso === 0; }).length;
    var names = (info.unmappedStoreNames || []).slice(0, 20);

    var html = '<div class="quality-block">' +
      '<div class="quality-grid">' +
      '<div class="quality-card"><span>Righe escluse (totali/online)</span><strong>' + fmt(info.ignoredRows || 0) + '</strong></div>' +
      '<div class="quality-card"><span>Date non valide</span><strong>' + fmt(info.invalidDates || 0) + '</strong></div>' +
      '<div class="quality-card"><span>Quantità vendita non valide</span><strong>' + fmt(info.invalidQty || 0) + '</strong></div>' +
      '<div class="quality-card"><span>PV non mappati</span><strong>' + fmt(info.unmappedStores || 0) + '</strong></div>' +
      '<div class="quality-card"><span>Vendite senza articolo</span><strong>' + fmt(info.unmatchedArticles || 0) + '</strong></div>' +
      '<div class="quality-card"><span>Codici duplicati</span><strong>' + fmt(duplicates) + '</strong></div>' +
      '<div class="quality-card"><span>Referenze senza vendite</span><strong>' + fmt(noSales) + '</strong></div>' +
      '</div>' +
      '<p><strong>Periodo considerato:</strong> 6 mesi con data finale ' + fmtDate(info.end) + '.</p>' +
      '<p><strong>Referenze con assegnato zero in tutti i cluster:</strong> ' + fmt(zeroAll) + '.</p>';
    if (names.length) html += '<div class="message warn"><strong>Punti vendita non riconosciuti:</strong> ' + escapeHtml(names.join(", ")) + (info.unmappedStores > names.length ? "…" : "") + "</div>";
    if (!(info.invalidDates || info.invalidQty || info.unmappedStores || info.unmatchedArticles || duplicates)) html += '<div class="message info">Nessuna anomalia bloccante rilevata.</div>';
    html += "</div>";
    $("qualityContent").innerHTML = html;
  }

  function exportWorkbook() {
    if (!state.proposal.length) return;
    var wb = XLSX.utils.book_new();
    var summary = E.proposalSummary(state.proposal);
    var scopeRows = [
      ["Parametro", "Valore"],
      ["Reparto", state.scope.reparto],
      ["Gruppo", state.scope.gruppo],
      ["Famiglia / sottofamiglia", state.scope.famiglia],
      ["Filtro", "Breve = N"],
      ["Livello cluster usato", state.mappedStores.level_used || ""],
      ["Punti vendita mappati", state.mappedStores.length],
      ["Referenze analizzate", summary.references],
      ["Inserimenti Basso", summary.insert],
      ["Aumenti Basso", summary.increase],
      ["Riduzioni Basso", summary.reduce],
      ["Eliminazioni Basso", summary.remove],
      ["Pezzi Basso attuali", summary.current],
      ["Pezzi Basso proposti", summary.proposed],
      ["Spazio Basso attuale", summary.currentSpace],
      ["Spazio Basso proposto", summary.proposedSpace]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scopeRows), "Sintesi");

    var proposalRows = state.proposal.map(function (r) {
      return {
        ID: r.article_id,
        SKU: r.sku,
        Descrizione: r.description,
        Marca: r.brand,
        GAlto: r.GAlto,
        GMedio: r.GMedio,
        GBasso_attuale: r.GBasso,
        Vendita_mensile_Alto: r.monthly_per_store_Alto,
        Vendita_mensile_Medio: r.monthly_per_store_Medio,
        Vendita_mensile_Basso: r.monthly_per_store_Basso,
        Domanda_stimata_Basso: r.estimated_monthly_Basso,
        Penetrazione_Basso: r.penetration_Basso,
        Punteggio_generale: r.score_generale,
        GBasso_proposto: r.GBasso_proposto,
        Delta_GBasso: r.delta_GBasso,
        Azione_Basso: r.azione_Basso,
        Motivazione: r.motivazione,
        Spazio_attuale: r.spazio_Basso_attuale,
        Spazio_proposto: r.spazio_Basso_proposto
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(proposalRows), "Proposta_Basso");

    ["Inserire", "Aumentare", "Ridurre", "Eliminare"].forEach(function (action) {
      var subset = proposalRows.filter(function (r) { return r.Azione_Basso === action; });
      if (subset.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subset), action.substring(0, 31));
    });

    var safeName = (state.scope.famiglia || "assortimento").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    XLSX.writeFile(wb, "proposta_assortimento_" + safeName + ".xlsx", { compression: true });
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (x) { x.classList.remove("active"); });
        button.classList.add("active");
        $(button.dataset.tab).classList.add("active");
      });
    });
  }

  function init() {
    if (!window.XLSX || !E) {
      setStatus("Libreria Excel non disponibile", "error");
      message("Non è stato possibile caricare la libreria Excel. Controlla la connessione Internet e ricarica la pagina.", "error");
      return;
    }

    $("assortmentFile").addEventListener("change", function (event) { readUserFile(event.target.files[0], "assortment"); });
    $("salesFile").addEventListener("change", function (event) { readUserFile(event.target.files[0], "sales"); });
    $("scopeReparto").addEventListener("change", function () { state.scope.gruppo = ""; state.scope.famiglia = ""; refreshScopeSelectors("reparto"); });
    $("scopeGruppo").addEventListener("change", function () { state.scope.famiglia = ""; refreshScopeSelectors("gruppo"); });
    $("scopeFamiglia").addEventListener("change", function () { state.scope.famiglia = this.value; });
    $("analyzeButton").addEventListener("click", analyze);
    $("exportButton").addEventListener("click", exportWorkbook);
    $("proposalSearch").addEventListener("input", renderProposalTable);
    $("actionFilter").addEventListener("change", renderProposalTable);
    initTabs();
    loadFixedCluster();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
