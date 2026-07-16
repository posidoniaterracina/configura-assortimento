(function (global) {
  "use strict";

  var CLUSTERS = ["Alto", "Medio", "Basso"];
  var SALES_PERIOD_DAYS = 182.5;

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeId(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
    }
    return String(value).trim().replace(/\.0+$/, "");
  }

  function toNumber(value, fallback) {
    if (fallback === undefined) fallback = 0;
    var parsed;
    if (typeof value === "number") parsed = value;
    else if (value === null || value === undefined || value === "") parsed = NaN;
    else parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function normalizeClusterSelection(values) {
    var selected = {};
    (values || []).forEach(function (value) {
      var raw = String(value || "").trim().toLowerCase();
      var proper = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (CLUSTERS.indexOf(proper) >= 0) selected[proper] = true;
    });
    return CLUSTERS.filter(function (cluster) { return selected[cluster]; });
  }

  function prepareAssortment(rows) {
    return (rows || []).filter(function (row) {
      return String(row.Breve || "").trim().toUpperCase() === "N";
    }).map(function (row) {
      return {
        article_id: normalizeId(row.Id),
        sku: normalizeId(row.SkuCodice),
        description: String(row.Prodotto || "").trim(),
        reparto: String(row.Reparto || "").trim(),
        gruppo: String(row.Famiglia || "").trim(),
        famiglia: String(row.SttFamiglia || "").trim(),
        supplier: String(row.Fornitore || "").trim(),
        line: String(row.Linea || "").trim(),
        brand: String(row.Brand || "").trim(),
        characteristic: String(row.Caratteristica || "").trim(),
        pack_size: Math.max(1, Math.round(toNumber(row.Art_Pz, 1))),
        GAlto: Math.max(0, Math.round(toNumber(row.GAlto, 0))),
        GMedio: Math.max(0, Math.round(toNumber(row.GMedio, 0))),
        GBasso: Math.max(0, Math.round(toNumber(row.GBasso, 0)))
      };
    }).filter(function (row) { return row.article_id && row.GAlto > 0; });
  }

  function detectScope(assortment) {
    function unique(key) {
      var seen = {};
      assortment.forEach(function (row) {
        if (row[key]) seen[normalizeText(row[key])] = row[key];
      });
      return Object.keys(seen).map(function (key) { return seen[key]; });
    }
    var reparti = unique("reparto");
    var gruppi = unique("gruppo");
    var famiglie = unique("famiglia");
    return {
      reparto: reparti.length === 1 ? reparti[0] : "",
      gruppo: gruppi.length === 1 ? gruppi[0] : "",
      famiglia: famiglie.length === 1 ? famiglie[0] : "",
      multiple: reparti.length !== 1 || gruppi.length !== 1 || famiglie.length !== 1,
      counts: { reparti: reparti.length, gruppi: gruppi.length, famiglie: famiglie.length }
    };
  }

  function prepareClusterMapping(rows, scope) {
    var candidates = [
      { level: "Famiglia", type: "F", column: "Famiglia", value: scope.famiglia },
      { level: "Gruppo", type: "G", column: "Gruppo", value: scope.gruppo },
      { level: "Reparto", type: "R", column: "Reparto", value: scope.reparto }
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (!candidate.value) continue;
      var selectedRows = (rows || []).filter(function (row) {
        var rawPriority = String(row.Priorita || "").trim().toLowerCase();
        var cluster = rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1);
        return CLUSTERS.indexOf(cluster) >= 0 &&
          normalizeText(row.Tipo) === normalizeText(candidate.type) &&
          normalizeText(row[candidate.column]) === normalizeText(candidate.value);
      });

      if (selectedRows.length) {
        var seen = {};
        var stores = [];
        selectedRows.forEach(function (row) {
          var store = String(row.Descrizione || "").trim();
          var key = normalizeText(store);
          var raw = String(row.Priorita || "").trim().toLowerCase();
          var cluster = raw.charAt(0).toUpperCase() + raw.slice(1);
          if (!store || seen[key] || CLUSTERS.indexOf(cluster) < 0) return;
          seen[key] = true;
          stores.push({ store: store, store_key: key, cluster: cluster });
        });
        stores.level_used = candidate.level;
        return stores;
      }
    }

    var empty = [];
    empty.level_used = "Non trovato";
    return empty;
  }

  function gini(values) {
    var array = (values || []).map(function (value) { return Math.max(0, toNumber(value, 0)); })
      .sort(function (a, b) { return a - b; });
    var count = array.length;
    if (!count) return 0;
    var sum = array.reduce(function (total, value) { return total + value; }, 0);
    if (sum <= 0) return 0;
    var weighted = array.reduce(function (total, value, index) { return total + (index + 1) * value; }, 0);
    return clamp((2 * weighted) / (count * sum) - (count + 1) / count, 0, 1);
  }

  function coefficientVariation(values) {
    var array = (values || []).map(function (value) { return Math.max(0, toNumber(value, 0)); });
    if (!array.length) return 0;
    var mean = array.reduce(function (total, value) { return total + value; }, 0) / array.length;
    if (mean <= 0) return 0;
    var variance = array.reduce(function (total, value) { return total + Math.pow(value - mean, 2); }, 0) / array.length;
    return Math.sqrt(variance) / mean;
  }

  function determineWeights(mode, manualReferenceWeight, giniValue) {
    var referenceWeight;
    if (mode === "manual") referenceWeight = clamp(toNumber(manualReferenceWeight, 50) / 100, 0, 1);
    else referenceWeight = clamp(0.20 + 0.70 * clamp(giniValue, 0, 1), 0.20, 0.90);
    return { mode: mode === "manual" ? "manual" : "auto", referenceWeight: referenceWeight, quantityWeight: 1 - referenceWeight };
  }

  function classifyConcentration(giniValue) {
    if (giniValue < 0.25) return "omogenea";
    if (giniValue < 0.50) return "moderatamente concentrata";
    if (giniValue < 0.70) return "concentrata";
    return "molto concentrata";
  }

  function calculatePerformance(assortment, salesRows, storeMapping, selectedClusters) {
    var selectedList = normalizeClusterSelection(selectedClusters);
    var selectedLookup = {};
    selectedList.forEach(function (cluster) { selectedLookup[cluster] = true; });

    var storeLookup = {};
    storeMapping.forEach(function (store) { storeLookup[store.store_key] = store; });

    var articleLookup = {};
    assortment.forEach(function (row, index) {
      articleLookup[row.article_id] = index;
      if (row.sku) articleLookup[row.sku] = index;
    });

    var sales = assortment.map(function () { return 0; });
    var storesWithSales = assortment.map(function () { return {}; });
    var quality = { inputRows: salesRows.length, usedRows: 0, ignoredOnlineOrTotals: 0, storesNotMapped: {}, articlesNotMatched: 0, invalidSales: 0 };

    salesRows.forEach(function (row) {
      var article = normalizeId(row.Fk_Prd);
      var storeName = String(row.Negozio || "").trim();
      var storeKey = normalizeText(storeName);
      if (!article || !storeName || storeKey === normalizeText("VendOnLine")) {
        quality.ignoredOnlineOrTotals += 1;
        return;
      }
      var store = storeLookup[storeKey];
      if (!store) {
        quality.storesNotMapped[storeKey] = storeName;
        return;
      }
      if (!selectedLookup[store.cluster]) return;
      var articleIndex = articleLookup[article];
      if (articleIndex === undefined) {
        quality.articlesNotMatched += 1;
        return;
      }
      var quantity = toNumber(row.Vnd, NaN);
      if (!Number.isFinite(quantity)) {
        quality.invalidSales += 1;
        return;
      }
      sales[articleIndex] += Math.max(0, quantity);
      if (quantity > 0) storesWithSales[articleIndex][store.store_key] = true;
      quality.usedRows += 1;
    });

    var selectedStoreCount = storeMapping.filter(function (store) { return selectedLookup[store.cluster]; }).length;
    var rows = assortment.map(function (source, index) {
      var row = Object.assign({}, source);
      row.sales_selected = sales[index];
      row.sales_per_store = selectedStoreCount ? sales[index] / selectedStoreCount : 0;
      row.sales_per_store_day = selectedStoreCount ? sales[index] / selectedStoreCount / SALES_PERIOD_DAYS : 0;
      row.active_stores = Object.keys(storesWithSales[index]).length;
      return row;
    });

    rows.sort(function (a, b) {
      if (b.sales_per_store_day !== a.sales_per_store_day) return b.sales_per_store_day - a.sales_per_store_day;
      if (b.sales_selected !== a.sales_selected) return b.sales_selected - a.sales_selected;
      if (b.active_stores !== a.active_stores) return b.active_stores - a.active_stores;
      if (b.GAlto !== a.GAlto) return b.GAlto - a.GAlto;
      return a.description.localeCompare(b.description, "it", { sensitivity: "base" });
    });

    rows.forEach(function (row, index) {
      row.performance_rank = index + 1;
      row.performance_pct = rows.length ? ((rows.length - index) / rows.length) * 100 : 0;
    });

    var distribution = rows.map(function (row) { return row.sales_per_store_day; });
    quality.storesNotMappedNames = Object.keys(quality.storesNotMapped).map(function (key) { return quality.storesNotMapped[key]; });
    quality.selectedStoreCount = selectedStoreCount;
    return {
      rows: rows,
      quality: quality,
      metrics: {
        gini: gini(distribution),
        cv: coefficientVariation(distribution),
        periodDays: SALES_PERIOD_DAYS,
        selectedStoreCount: selectedStoreCount,
        selectedClusters: selectedList,
        totalSales: rows.reduce(function (total, row) { return total + row.sales_selected; }, 0)
      }
    };
  }

  function divisors(number) {
    var result = [];
    for (var i = 1; i <= Math.sqrt(number); i += 1) {
      if (number % i === 0) {
        result.push(i);
        if (i !== number / i) result.push(number / i);
      }
    }
    return result.sort(function (a, b) { return a - b; });
  }

  function quantityLadder(pack, maxQuantity) {
    var maximum = Math.max(0, Math.floor(maxQuantity));
    var packageSize = Math.max(1, Math.round(pack || 1));
    var set = { 0: true };
    if (packageSize <= 1) {
      for (var value = 1; value <= maximum; value += 1) set[value] = true;
    } else {
      divisors(packageSize).forEach(function (value) { if (value <= maximum) set[value] = true; });
      for (var multiple = packageSize; multiple <= maximum; multiple += packageSize) set[multiple] = true;
    }
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function indexAtOrAbove(ladder, rawValue) {
    for (var i = 0; i < ladder.length; i += 1) if (ladder[i] >= rawValue) return i;
    return ladder.length - 1;
  }

  function indexAtOrBelow(ladder, rawValue) {
    var index = 0;
    for (var i = 0; i < ladder.length; i += 1) {
      if (ladder[i] <= rawValue) index = i;
      else break;
    }
    return index;
  }

  function action(current, proposed) {
    if (current <= 0 && proposed > 0) return "Inserire";
    if (current > 0 && proposed <= 0) return "Eliminare";
    if (proposed < current) return "Ridurre";
    if (proposed > current) return "Aumentare";
    return proposed > 0 ? "Confermare" : "Escludere";
  }

  function reduceToCapacity(candidates, capacity) {
    var total = candidates.reduce(function (sum, item) { return sum + item.proposed; }, 0);
    var guard = 0;
    while (total > capacity && guard < 200000) {
      var choice = null;
      candidates.forEach(function (item) {
        if (item.proposed <= 0 || item.index <= 0) return;
        var previous = item.ladder[item.index - 1];
        var saving = item.proposed - previous;
        if (saving <= 0) return;
        if (!choice || item.rank > choice.rank || (item.rank === choice.rank && saving < choice.saving)) {
          choice = { item: item, rank: item.rank, saving: saving };
        }
      });
      if (!choice) break;
      choice.item.index -= 1;
      choice.item.proposed = choice.item.ladder[choice.item.index];
      total -= choice.saving;
      guard += 1;
    }
    return total;
  }

  function buildClusterProposal(rankedRows, ratio, weights, stockDays, clusterName) {
    var safeRatio = clamp(ratio, 0, 1);
    var highRows = rankedRows.filter(function (row) { return row.GAlto > 0; });
    var highTotal = highRows.reduce(function (sum, row) { return sum + row.GAlto; }, 0);
    var capacity = Math.max(0, Math.round(highTotal * safeRatio));
    var referenceShare = safeRatio <= 0 ? 0 : Math.pow(safeRatio, weights.referenceWeight);
    var quantityShare = safeRatio <= 0 ? 0 : Math.pow(safeRatio, weights.quantityWeight);
    var targetReferences = safeRatio <= 0 ? 0 : Math.max(1, Math.round(highRows.length * referenceShare));
    var retained = highRows.slice(0, targetReferences);

    var candidates = retained.map(function (row) {
      var ladder = quantityLadder(row.pack_size, row.GAlto);
      var positive = ladder.filter(function (value) { return value > 0; });
      var minimumPositive = positive.length ? positive[0] : 0;
      var desiredRaw = row.sales_per_store_day * stockDays;
      var desired = desiredRaw > 0 ? desiredRaw : minimumPositive;
      var desiredIndex = indexAtOrAbove(ladder, desired);
      var capIndex = indexAtOrBelow(ladder, row.GAlto * quantityShare);
      if (capIndex === 0 && quantityShare > 0 && minimumPositive > 0) capIndex = ladder.indexOf(minimumPositive);
      var index = Math.min(desiredIndex, capIndex);
      return { id: row.article_id, rank: row.performance_rank, dailyDemand: row.sales_per_store_day, desiredRaw: desiredRaw, ladder: ladder, index: index, proposed: ladder[index] || 0 };
    });

    var proposedUnits = reduceToCapacity(candidates, capacity);
    var values = {};
    var desiredValues = {};
    candidates.forEach(function (item) { values[item.id] = item.proposed; desiredValues[item.id] = item.desiredRaw; });
    var proposedReferences = candidates.filter(function (item) { return item.proposed > 0; }).length;
    var dailyDemand = candidates.reduce(function (sum, item) { return sum + (item.proposed > 0 ? item.dailyDemand : 0); }, 0);

    return {
      cluster: clusterName,
      ratio: safeRatio,
      referenceShare: referenceShare,
      quantityShare: quantityShare,
      targetReferences: targetReferences,
      proposedReferences: proposedReferences,
      quantityCapacity: capacity,
      proposedUnits: proposedUnits,
      utilization: capacity > 0 ? proposedUnits / capacity : 0,
      stockDaysTarget: stockDays,
      achievedDays: dailyDemand > 0 ? proposedUnits / dailyDemand : null,
      values: values,
      desiredValues: desiredValues
    };
  }

  function recalculateProposal(proposal, rankedRows) {
    proposal.proposedUnits = Object.keys(proposal.values).reduce(function (sum, id) { return sum + (proposal.values[id] || 0); }, 0);
    proposal.proposedReferences = Object.keys(proposal.values).filter(function (id) { return (proposal.values[id] || 0) > 0; }).length;
    proposal.utilization = proposal.quantityCapacity > 0 ? proposal.proposedUnits / proposal.quantityCapacity : 0;
    var dailyDemand = rankedRows.reduce(function (sum, row) { return sum + ((proposal.values[row.article_id] || 0) > 0 ? row.sales_per_store_day : 0); }, 0);
    proposal.achievedDays = dailyDemand > 0 ? proposal.proposedUnits / dailyDemand : null;
  }

  function buildProposals(rankedRows, meters, options, metrics) {
    var weights = determineWeights(options.cutMode, options.manualReferenceWeight, metrics.gini);
    var medium = buildClusterProposal(rankedRows, meters.medio / meters.alto, weights, options.stockDaysMedio, "Medio");
    var low = buildClusterProposal(rankedRows, meters.basso / meters.alto, weights, options.stockDaysBasso, "Basso");

    Object.keys(low.values).forEach(function (id) { low.values[id] = Math.min(low.values[id] || 0, medium.values[id] || 0); });
    recalculateProposal(low, rankedRows);

    var rows = rankedRows.map(function (source) {
      var row = Object.assign({}, source);
      row.GMedio_desiderato = medium.desiredValues[row.article_id] || 0;
      row.GBasso_desiderato = low.desiredValues[row.article_id] || 0;
      row.GMedio_proposto = medium.values[row.article_id] || 0;
      row.GBasso_proposto = low.values[row.article_id] || 0;
      row.giorni_Medio_raggiunti = row.sales_per_store_day > 0 ? row.GMedio_proposto / row.sales_per_store_day : null;
      row.giorni_Basso_raggiunti = row.sales_per_store_day > 0 ? row.GBasso_proposto / row.sales_per_store_day : null;
      row.azione_Medio = action(row.GMedio, row.GMedio_proposto);
      row.azione_Basso = action(row.GBasso, row.GBasso_proposto);
      return row;
    });

    return { rows: rows, medium: medium, low: low, weights: weights, concentration: classifyConcentration(metrics.gini), metrics: metrics };
  }

  function supplierSummary(rows) {
    var groups = {};
    rows.forEach(function (row) {
      var key = row.supplier || "SENZA FORNITORE";
      if (!groups[key]) groups[key] = { Fornitore: key, Vendite: 0, Ref_Alto: 0, Ref_Medio_Attuali: 0, Ref_Medio_Proposte: 0, Ref_Basso_Attuali: 0, Ref_Basso_Proposte: 0, Qta_Alto: 0, Qta_Medio_Attuale: 0, Qta_Medio_Proposta: 0, Qta_Basso_Attuale: 0, Qta_Basso_Proposta: 0, _dailyMedio: 0, _dailyBasso: 0 };
      var group = groups[key];
      group.Vendite += row.sales_selected;
      if (row.GAlto > 0) group.Ref_Alto += 1;
      if (row.GMedio > 0) group.Ref_Medio_Attuali += 1;
      if (row.GMedio_proposto > 0) { group.Ref_Medio_Proposte += 1; group._dailyMedio += row.sales_per_store_day; }
      if (row.GBasso > 0) group.Ref_Basso_Attuali += 1;
      if (row.GBasso_proposto > 0) { group.Ref_Basso_Proposte += 1; group._dailyBasso += row.sales_per_store_day; }
      group.Qta_Alto += row.GAlto;
      group.Qta_Medio_Attuale += row.GMedio;
      group.Qta_Medio_Proposta += row.GMedio_proposto;
      group.Qta_Basso_Attuale += row.GBasso;
      group.Qta_Basso_Proposta += row.GBasso_proposto;
    });

    return Object.keys(groups).map(function (key) {
      var group = groups[key];
      group.Giorni_Scorta_Medio = group._dailyMedio > 0 ? group.Qta_Medio_Proposta / group._dailyMedio : null;
      group.Giorni_Scorta_Basso = group._dailyBasso > 0 ? group.Qta_Basso_Proposta / group._dailyBasso : null;
      delete group._dailyMedio;
      delete group._dailyBasso;
      return group;
    }).sort(function (a, b) { return b.Vendite !== a.Vendite ? b.Vendite - a.Vendite : a.Fornitore.localeCompare(b.Fornitore, "it", { sensitivity: "base" }); });
  }

  global.AssortmentEngineV3 = {
    CLUSTERS: CLUSTERS,
    SALES_PERIOD_DAYS: SALES_PERIOD_DAYS,
    normalizeText: normalizeText,
    normalizeId: normalizeId,
    normalizeClusterSelection: normalizeClusterSelection,
    toNumber: toNumber,
    prepareAssortment: prepareAssortment,
    detectScope: detectScope,
    prepareClusterMapping: prepareClusterMapping,
    calculatePerformance: calculatePerformance,
    determineWeights: determineWeights,
    classifyConcentration: classifyConcentration,
    quantityLadder: quantityLadder,
    buildProposals: buildProposals,
    supplierSummary: supplierSummary,
    gini: gini,
    coefficientVariation: coefficientVariation
  };
})(window);
