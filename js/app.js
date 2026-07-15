(function () {
  "use strict";

  var E = window.AssortmentEngine;
  var state = {
    clusterRows: [],
    clusterMapping: null,
    clusterReady: false,
    assortmentRows: [],
    assortmentMapping: null,
    assortmentFileName: "",
    salesRows: [],
    salesMapping: null,
    salesFileName: "",
    scope: { reparto: "", gruppo: "", famiglia: "" },
    assortmentInfo: null,
    clusterData: null,
    salesInfo: null,
    metricRows: [],
    scenario: null
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
    if (digits === undefined) digits = 0;
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(Number(value) || 0);
  }

  function pct(value, digits) {
    if (digits === undefined) digits = 1;
    return fmt((Number(value) || 0) * 100, digits) + "%";
  }

  function dateText(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "n.d.";
    return new Intl.DateTimeFormat("it-IT").format(value);
  }

  function clearMessages() {
    $("globalMessages").innerHTML = "";
  }

  function message(text, type) {
    var item = document.createElement("div");
    item.className = "message " + (type || "info");
    item.textContent = text;
    $("globalMessages").appendChild(item);
  }

  function setFileStatus(id, text, ok) {
    var node = $(id);
    node.textContent = text;
    node.className = "file-status " + (ok ? "ok" : "error");
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("Impossibile leggere il file.")); };
      reader.readAsArrayBuffer(file);
    });
  }

  function rowsFromWorkbook(buffer, preferredSheet, aliases, requiredKeys) {
    var workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    var names = workbook.SheetNames.slice();
    if (preferredSheet && names.indexOf(preferredSheet) >= 0) {
      names = [preferredSheet].concat(names.filter(function (name) { return name !== preferredSheet; }));
    }

    for (var i = 0; i < names.length; i += 1) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[names[i]], { defval: null, raw: true });
      if (!rows.length) continue;
      var mapping = E.detectColumns(rows, aliases);
      if (!E.requiredMissing(mapping, requiredKeys).length) {
        return { rows: rows, mapping: mapping, sheetName: names[i] };
      }
    }
    throw new Error("Nessun foglio contiene tutte le colonne richieste: " + requiredKeys.join(", ") + ".");
  }

  async function loadClusterConfig() {
    try {
      var response = await fetch("data/config/Cluster.xlsx?v=" + Date.now());
      if (!response.ok) throw new Error("HTTP " + response.status);
      var result = rowsFromWorkbook(
        await response.arrayBuffer(),
        null,
        E.CLUSTER_ALIASES,
        ["store", "priority", "reparto"]
      );
      state.clusterRows = result.rows;
      state.clusterMapping = result.mapping;
      state.clusterReady = true;
      $("clusterStatus").textContent = "Cluster pronti";
      $("clusterStatus").className = "status-pill ready";
      updateAnalyzeButton();
    } catch (error) {
      console.error(error);
      $("clusterStatus").textContent = "Errore Cluster.xlsx";
      $("clusterStatus").className = "status-pill error";
      message("Impossibile caricare data/config/Cluster.xlsx: " + error.message, "error");
    }
  }

  async function handleAssortment(file) {
    clearMessages();
    try {
      var result = rowsFromWorkbook(
        await readFile(file),
        null,
        E.ASSORTMENT_ALIASES,
        ["id", "description", "reparto", "gruppo", "famiglia", "breve", "galto", "gmedio", "gbasso"]
      );
      state.assortmentRows = result.rows;
      state.assortmentMapping = result.mapping;
      state.assortmentFileName = file.name;
      setFileStatus("assortmentStatus", file.name + " · foglio " + result.sheetName, true);
      buildScopeSelectors();
      $("scopeSection").classList.remove("hidden");
      $("spaceSection").classList.remove("hidden");
      updateAnalyzeButton();
    } catch (error) {
      state.assortmentRows = [];
      state.assortmentMapping = null;
      setFileStatus("assortmentStatus", error.message, false);
      message("File assortimento non valido: " + error.message, "error");
      updateAnalyzeButton();
    }
  }

  async function handleSales(file) {
    clearMessages();
    try {
      var result = rowsFromWorkbook(
        await readFile(file),
        "Q_TempPV",
        E.SALES_ALIASES,
        ["article", "store", "quantity", "date"]
      );
      state.salesRows = result.rows;
      state.salesMapping = result.mapping;
      state.salesFileName = file.name;
      setFileStatus("salesStatus", file.name + " · foglio " + result.sheetName, true);
      updateAnalyzeButton();
    } catch (error) {
      state.salesRows = [];
      state.salesMapping = null;
      setFileStatus("salesStatus", error.message, false);
      message("File vendite non valido: " + error.message, "error");
      updateAnalyzeButton();
    }
  }

  function optionList(select, values, current) {
    select.innerHTML = "";
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (values.indexOf(current) >= 0) select.value = current;
    else if (values.length) select.value = values[0];
  }

  function isBreveN(row) {
    return E.normalizeText(row[state.assortmentMapping.breve]) === "n";
  }

  function buildScopeSelectors() {
    if (!state.assortmentRows.length) return;
    var repartoColumn = state.assortmentMapping.reparto;
    var gruppoColumn = state.assortmentMapping.gruppo;
    var famigliaColumn = state.assortmentMapping.famiglia;

    var reparti = E.uniqueValues(state.assortmentRows, repartoColumn, isBreveN);
    optionList($("scopeReparto"), reparti, state.scope.reparto);
    state.scope.reparto = $("scopeReparto").value;

    var gruppi = E.uniqueValues(state.assortmentRows, gruppoColumn, function (row) {
      return isBreveN(row) && E.normalizeText(row[repartoColumn]) === E.normalizeText(state.scope.reparto);
    });
    optionList($("scopeGruppo"), gruppi, state.scope.gruppo);
    state.scope.gruppo = $("scopeGruppo").value;

    var famiglie = E.uniqueValues(state.assortmentRows, famigliaColumn, function (row) {
      return isBreveN(row) &&
        E.normalizeText(row[repartoColumn]) === E.normalizeText(state.scope.reparto) &&
        E.normalizeText(row[gruppoColumn]) === E.normalizeText(state.scope.gruppo);
    });
    optionList($("scopeFamiglia"), famiglie, state.scope.famiglia);
    state.scope.famiglia = $("scopeFamiglia").value;
    updateScopeNote();
  }

  function updateGroupSelector() {
    state.scope.reparto = $("scopeReparto").value;
    var gruppi = E.uniqueValues(state.assortmentRows, state.assortmentMapping.gruppo, function (row) {
      return isBreveN(row) &&
        E.normalizeText(row[state.assortmentMapping.reparto]) === E.normalizeText(state.scope.reparto);
    });
    optionList($("scopeGruppo"), gruppi, "");
    state.scope.gruppo = $("scopeGruppo").value;
    updateFamilySelector();
  }

  function updateFamilySelector() {
    state.scope.gruppo = $("scopeGruppo").value;
    var famiglie = E.uniqueValues(state.assortmentRows, state.assortmentMapping.famiglia, function (row) {
      return isBreveN(row) &&
        E.normalizeText(row[state.assortmentMapping.reparto]) === E.normalizeText(state.scope.reparto) &&
        E.normalizeText(row[state.assortmentMapping.gruppo]) === E.normalizeText(state.scope.gruppo);
    });
    optionList($("scopeFamiglia"), famiglie, "");
    state.scope.famiglia = $("scopeFamiglia").value;
    updateScopeNote();
  }

  function updateScopeNote() {
    state.scope.reparto = $("scopeReparto").value;
    state.scope.gruppo = $("scopeGruppo").value;
    state.scope.famiglia = $("scopeFamiglia").value;
    $("scopeNote").textContent = [state.scope.reparto, state.scope.gruppo, state.scope.famiglia].filter(Boolean).join(" › ");
  }

  function readMeters() {
    return {
      Alto: Number($("metersAlto").value),
      Medio: Number($("metersMedio").value),
      Basso: Number($("metersBasso").value)
    };
  }

  function updateRatios() {
    var meters = readMeters();
    var medium = meters.Alto > 0 && meters.Medio >= 0 ? meters.Medio / meters.Alto : 0;
    var low = meters.Alto > 0 && meters.Basso >= 0 ? meters.Basso / meters.Alto : 0;
    $("ratioAlto").textContent = meters.Alto > 0 ? "100%" : "—";
    $("ratioMedio").textContent = meters.Alto > 0 ? pct(medium, 1) : "—";
    $("ratioBasso").textContent = meters.Alto > 0 ? pct(low, 1) : "—";
    updateAnalyzeButton();
  }

  function updateAnalyzeButton() {
    var meters = readMeters();
    var validMeters = meters.Alto > 0 && meters.Medio >= 0 && meters.Basso >= 0 && meters.Medio <= meters.Alto && meters.Basso <= meters.Medio;
    $("analyzeButton").disabled = !(
      state.clusterReady &&
      state.assortmentRows.length &&
      state.salesRows.length &&
      validMeters
    );
  }

  function parameters() {
    return {
      coverageMonths: Math.max(0, Number($("coverageMonths").value) || 0),
      safetyStock: Math.max(0, Number($("safetyStock").value) || 0),
      minDisplay: Math.max(1, Math.round(Number($("minimumDisplay").value) || 1)),
      coreThreshold: Math.min(100, Math.max(0, Math.round(Number($("coreThreshold").value) || 75))),
      roundToPack: $("roundToPack").checked
    };
  }

  function validateInputs() {
    var errors = [];
    var meters = readMeters();
    if (!state.assortmentRows.length) errors.push("Carica il file assortimento.");
    if (!state.salesRows.length) errors.push("Carica il file vendite.");
    if (!state.clusterReady) errors.push("La mappatura cluster non è disponibile.");
    if (!state.scope.famiglia) errors.push("Seleziona la sottofamiglia.");
    if (!(meters.Alto > 0)) errors.push("Inserisci i metri del cluster Alto.");
    if (!(meters.Medio >= 0)) errors.push("Inserisci i metri del cluster Medio.");
    if (!(meters.Basso >= 0)) errors.push("Inserisci i metri del cluster Basso.");
    if (meters.Medio > meters.Alto) errors.push("Il cluster Medio non può avere più metri dell'Alto.");
    if (meters.Basso > meters.Medio) errors.push("Il cluster Basso non può avere più metri del Medio.");
    return errors;
  }

  function analyze() {
    clearMessages();
    updateScopeNote();
    var errors = validateInputs();
    if (errors.length) {
      errors.forEach(function (error) { message(error, "error"); });
      return;
    }

    try {
      var assortmentPrepared = E.prepareAssortment(state.assortmentRows, state.assortmentMapping, state.scope);
      state.assortmentInfo = assortmentPrepared.info;
      if (!assortmentPrepared.rows.length) throw new Error("Nessuna referenza rimane dopo il filtro Breve = N.");

      state.clusterData = E.prepareClusterMapping(state.clusterRows, state.clusterMapping, state.scope);
      if (!state.clusterData.stores.length) throw new Error("Nessun punto vendita trovato per la clusterizzazione selezionata.");

      var salesPrepared = E.prepareSales(
        state.salesRows,
        state.salesMapping,
        state.clusterData,
        assortmentPrepared.rows,
        6,
        XLSX
      );
      state.salesInfo = salesPrepared.info;

      var metrics = E.calculateMetrics(
        assortmentPrepared.rows,
        salesPrepared.sales,
        state.clusterData,
        6
      );
      state.metricRows = metrics.rows;
      state.scenario = E.buildScenario(state.metricRows, readMeters(), parameters());

      renderResults();
      $("welcome").classList.add("hidden");
      $("results").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      message(error.message || "Errore durante l'elaborazione.", "error");
    }
  }

  function kpi(label, value, note) {
    return '<article class="kpi"><span class="kpi-label">' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong><small>' + escapeHtml(note || "") + '</small></article>';
  }

  function renderResults() {
    var summary = state.scenario.summary;
    var rows = state.scenario.rows;
    var changesMedio = rows.filter(function (row) { return row.deltaMedio !== 0; }).length;
    var changesBasso = rows.filter(function (row) { return row.deltaBasso !== 0; }).length;
    var coreInBasso = rows.filter(function (row) { return row.core && row.proposedBasso > 0; }).length;
    var coreTotal = rows.filter(function (row) { return row.core; }).length;

    $("scopeBanner").innerHTML =
      "<strong>Perimetro:</strong> " + escapeHtml([state.scope.reparto, state.scope.gruppo, state.scope.famiglia].join(" › ")) +
      " &nbsp;·&nbsp; <strong>Filtro:</strong> Breve = N" +
      " &nbsp;·&nbsp; <strong>Cluster usato:</strong> " + escapeHtml(state.clusterData.levelUsed) +
      " &nbsp;·&nbsp; <strong>PV:</strong> " + fmt(state.clusterData.counts.Totale);

    $("kpis").innerHTML = [
      kpi("Referenze analizzate", fmt(rows.length), "Assortimento Alto = 100"),
      kpi("Modifiche Medio", fmt(changesMedio), pct(summary.Medio.ratio) + " dello spazio Alto"),
      kpi("Modifiche Basso", fmt(changesBasso), pct(summary.Basso.ratio) + " dello spazio Alto"),
      kpi("Core presenti nel Basso", fmt(coreInBasso) + "/" + fmt(coreTotal), "Classe A o score ≥ soglia")
    ].join("");

    renderSpaceTable();
    renderSpaceBars();
    renderProposalTable();
    renderQuality();
  }

  function renderSpaceTable() {
    var summary = state.scenario.summary;
    var clusters = ["Alto", "Medio", "Basso"];
    var html = '<div class="table-wrap"><table class="summary-table"><thead><tr>' +
      '<th>Cluster</th><th>Metri disponibili</th><th>% su Alto</th><th>Referenze attuali</th><th>Referenze proposte</th>' +
      '<th>Metri equivalenti attuali</th><th>Metri equivalenti proposti</th><th>Copertura vendite rete</th></tr></thead><tbody>';
    clusters.forEach(function (cluster) {
      var item = summary[cluster];
      html += '<tr><th>' + cluster + '</th>' +
        '<td>' + fmt(item.meters, 2) + ' m</td>' +
        '<td>' + pct(item.ratio) + '</td>' +
        '<td>' + fmt(item.currentReferences) + '</td>' +
        '<td>' + fmt(item.proposedReferences) + '</td>' +
        '<td>' + fmt(item.currentMetersEquivalent, 2) + ' m</td>' +
        '<td><strong>' + fmt(item.proposedMetersEquivalent, 2) + ' m</strong></td>' +
        '<td>' + pct(item.salesCoverage) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="note">Conversione utilizzata: <strong>' + fmt(summary.unitsPerMeter, 2) +
      ' unità di assegnato per metro</strong>, calcolata ponendo il GAlto complessivo pari ai metri Alto inseriti.</p>';
    $("spaceSummary").innerHTML = html;
  }

  function renderSpaceBars() {
    var summary = state.scenario.summary;
    var html = "";
    ["Alto", "Medio", "Basso"].forEach(function (cluster) {
      var item = summary[cluster];
      var proposedPct = item.meters > 0 ? Math.min(100, item.proposedMetersEquivalent / item.meters * 100) : 0;
      var currentPct = item.meters > 0 ? Math.min(150, item.currentMetersEquivalent / item.meters * 100) : 0;
      html += '<div class="space-bar-row"><div class="bar-label"><strong>' + cluster + '</strong><span>' +
        fmt(item.proposedMetersEquivalent, 2) + ' / ' + fmt(item.meters, 2) + ' m</span></div>' +
        '<div class="bar-track"><div class="bar-current" style="width:' + currentPct + '%" title="Attuale"></div>' +
        '<div class="bar-proposed" style="width:' + proposedPct + '%" title="Proposto"></div></div>' +
        '<small>Grigio: attuale · Verde: proposto</small></div>';
    });
    $("spaceBars").innerHTML = html;
  }

  function actionClass(action) {
    return "action-" + E.normalizeText(action);
  }

  function proposalRowsFiltered() {
    var search = E.normalizeText($("proposalSearch").value);
    var action = $("actionFilter").value;
    return state.scenario.rows.filter(function (row) {
      var haystack = E.normalizeText([row.article_id, row.sku, row.description, row.brand].join(" "));
      var matchesSearch = !search || haystack.indexOf(search) >= 0;
      var matchesAction = !action || row.actionMedio === action || row.actionBasso === action;
      return matchesSearch && matchesAction;
    }).sort(function (a, b) {
      if (b.sales6mTotal !== a.sales6mTotal) return b.sales6mTotal - a.sales6mTotal;
      return b.scoreBasso - a.scoreBasso;
    });
  }

  function renderProposalTable() {
    if (!state.scenario) return;
    var actions = ["Inserire", "Aumentare", "Confermare", "Ridurre", "Eliminare"];
    if (!$("actionFilter").dataset.ready) {
      actions.forEach(function (action) {
        var option = document.createElement("option");
        option.value = action;
        option.textContent = action;
        $("actionFilter").appendChild(option);
      });
      $("actionFilter").dataset.ready = "1";
    }

    var rows = proposalRowsFiltered();
    $("proposalCaption").textContent = rows.length + " referenze visualizzate. Le proposte rispettano Medio ≤ Alto e Basso ≤ Medio.";
    var html = '<thead><tr>' +
      '<th>ID</th><th>Prodotto</th><th>ABC</th><th>Vendite 6m</th>' +
      '<th>Score M</th><th>GMedio</th><th>Proposta M</th><th>Azione M</th>' +
      '<th>Score B</th><th>GBasso</th><th>Proposta B</th><th>Azione B</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>' +
        '<td class="mono">' + escapeHtml(row.article_id) + '</td>' +
        '<td><strong>' + escapeHtml(row.description) + '</strong>' + (row.brand ? '<small>' + escapeHtml(row.brand) + '</small>' : '') + '</td>' +
        '<td><span class="abc abc-' + row.abc.toLowerCase() + '">' + row.abc + '</span></td>' +
        '<td>' + fmt(row.sales6mTotal) + '<small>' + fmt(row.monthlyPerStoreNetwork, 2) + '/mese/PV</small></td>' +
        '<td>' + fmt(row.scoreMedio) + '</td>' +
        '<td>' + fmt(row.GMedio) + '</td>' +
        '<td><strong>' + fmt(row.proposedMedio) + '</strong></td>' +
        '<td><span class="action ' + actionClass(row.actionMedio) + '">' + row.actionMedio + '</span></td>' +
        '<td>' + fmt(row.scoreBasso) + '</td>' +
        '<td>' + fmt(row.GBasso) + '</td>' +
        '<td><strong>' + fmt(row.proposedBasso) + '</strong></td>' +
        '<td><span class="action ' + actionClass(row.actionBasso) + '">' + row.actionBasso + '</span></td>' +
        '</tr>';
    });
    html += '</tbody>';
    $("proposalTable").innerHTML = html;
  }

  function qualityItem(label, value, status) {
    return '<div class="quality-item ' + (status || "") + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function renderQuality() {
    var a = state.assortmentInfo;
    var s = state.salesInfo;
    var c = state.clusterData;
    var html = '<div class="quality-grid">' +
      qualityItem("Righe assortimento lette", fmt(a.sourceRows), "ok") +
      qualityItem("Escluse perché Breve ≠ N", fmt(a.excludedBreve), "") +
      qualityItem("ID duplicati esclusi", fmt(a.duplicates), a.duplicates ? "warn" : "ok") +
      qualityItem("Righe vendite lette", fmt(s.sourceRows), "ok") +
      qualityItem("PV non mappati", fmt(s.unmatchedStores), s.unmatchedStores ? "warn" : "ok") +
      qualityItem("Codici vendite fuori perimetro / Breve ≠ N", fmt(s.unmatchedArticles), "") +
      qualityItem("Righe ignorate / online / totali", fmt(s.ignoredRows), "") +
      qualityItem("Periodo dichiarato", dateText(s.start) + " – " + dateText(s.end), "") +
      qualityItem("PV Alto", fmt(c.counts.Alto), "ok") +
      qualityItem("PV Medio", fmt(c.counts.Medio), "ok") +
      qualityItem("PV Basso", fmt(c.counts.Basso), "ok") +
      qualityItem("Livello cluster utilizzato", c.levelUsed, "ok") +
      '</div>';

    if (s.unmatchedStoreNames && s.unmatchedStoreNames.length) {
      html += '<div class="warning-box"><strong>Punti vendita non riconosciuti:</strong> ' + escapeHtml(s.unmatchedStoreNames.join(", ")) + '</div>';
    }
    if (s.unmatchedArticleIds && s.unmatchedArticleIds.length) {
      html += '<div class="warning-box"><strong>Primi codici vendite esclusi dal perimetro o non presenti nell’assortimento:</strong> ' +
        escapeHtml(s.unmatchedArticleIds.slice(0, 20).join(", ")) + (s.unmatchedArticleIds.length > 20 ? "…" : "") + '</div>';
    }
    $("qualityContent").innerHTML = html;
  }

  function safeExcelText(value) {
    var text = String(value === null || value === undefined ? "" : value);
    return /^[=+\-@]/.test(text) ? "'" + text : text;
  }

  function exportExcel() {
    if (!state.scenario) return;
    var summary = state.scenario.summary;
    var summaryRows = [
      ["Bilanciamento assortimento"],
      ["Reparto", state.scope.reparto],
      ["Gruppo", state.scope.gruppo],
      ["Sottofamiglia", state.scope.famiglia],
      ["Filtro", "Breve = N"],
      [],
      ["Cluster", "Metri disponibili", "% su Alto", "Referenze attuali", "Referenze proposte", "Metri equivalenti attuali", "Metri equivalenti proposti", "Copertura vendite rete"]
    ];
    ["Alto", "Medio", "Basso"].forEach(function (cluster) {
      var item = summary[cluster];
      summaryRows.push([
        cluster,
        item.meters,
        item.ratio,
        item.currentReferences,
        item.proposedReferences,
        item.currentMetersEquivalent,
        item.proposedMetersEquivalent,
        item.salesCoverage
      ]);
    });
    summaryRows.push([]);
    summaryRows.push(["Unità di assegnato per metro", summary.unitsPerMeter]);

    var proposal = state.scenario.rows.map(function (row) {
      return {
        Id: safeExcelText(row.article_id),
        SKU: safeExcelText(row.sku),
        Prodotto: safeExcelText(row.description),
        Brand: safeExcelText(row.brand),
        Classe_ABC: row.abc,
        Vendite_6_mesi: row.sales6mTotal,
        Vendita_mensile_media_PV: row.monthlyPerStoreNetwork,
        Score_Medio: row.scoreMedio,
        GAlto: row.GAlto,
        GMedio_attuale: row.GMedio,
        GMedio_proposto: row.proposedMedio,
        Delta_Medio: row.deltaMedio,
        Azione_Medio: row.actionMedio,
        Score_Basso: row.scoreBasso,
        GBasso_attuale: row.GBasso,
        GBasso_proposto: row.proposedBasso,
        Delta_Basso: row.deltaBasso,
        Azione_Basso: row.actionBasso,
        Vendite_Alto_6m: row.salesAlto,
        Vendite_Medio_6m: row.salesMedio,
        Vendite_Basso_6m: row.salesBasso,
        Penetrazione_rete: row.penetrationNetwork
      };
    });

    var mediumRows = proposal.filter(function (row) { return row.GMedio_proposto > 0; });
    var lowRows = proposal.filter(function (row) { return row.GBasso_proposto > 0; });
    var qualityRows = [
      ["Indicatore", "Valore"],
      ["Righe assortimento", state.assortmentInfo.sourceRows],
      ["Righe escluse Breve", state.assortmentInfo.excludedBreve],
      ["Duplicati assortimento", state.assortmentInfo.duplicates],
      ["Righe vendite", state.salesInfo.sourceRows],
      ["PV non mappati", state.salesInfo.unmatchedStores],
      ["Articoli non abbinati", state.salesInfo.unmatchedArticles],
      ["Righe vendite ignorate", state.salesInfo.ignoredRows],
      ["Cluster Alto", state.clusterData.counts.Alto],
      ["Cluster Medio", state.clusterData.counts.Medio],
      ["Cluster Basso", state.clusterData.counts.Basso]
    ];

    var workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Sintesi");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(proposal), "Proposta_completa");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mediumRows), "Assortimento_Medio");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lowRows), "Assortimento_Basso");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(qualityRows), "Qualita_dati");

    var filename = "Bilanciamento_" + (state.scope.famiglia || "assortimento").replace(/[^a-z0-9]+/gi, "_") + ".xlsx";
    XLSX.writeFile(workbook, filename);
  }

  function setTab(tabId) {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === tabId);
    });
  }

  function bindEvents() {
    $("assortmentFile").addEventListener("change", function (event) {
      if (event.target.files[0]) handleAssortment(event.target.files[0]);
    });
    $("salesFile").addEventListener("change", function (event) {
      if (event.target.files[0]) handleSales(event.target.files[0]);
    });
    $("scopeReparto").addEventListener("change", updateGroupSelector);
    $("scopeGruppo").addEventListener("change", updateFamilySelector);
    $("scopeFamiglia").addEventListener("change", updateScopeNote);
    ["metersAlto", "metersMedio", "metersBasso"].forEach(function (id) {
      $(id).addEventListener("input", updateRatios);
    });
    $("analyzeButton").addEventListener("click", analyze);
    $("exportButton").addEventListener("click", exportExcel);
    $("proposalSearch").addEventListener("input", renderProposalTable);
    $("actionFilter").addEventListener("change", renderProposalTable);
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () { setTab(button.dataset.tab); });
    });
  }

  bindEvents();
  updateRatios();
  loadClusterConfig();
})();
