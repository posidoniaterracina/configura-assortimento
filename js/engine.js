(function (global) {
  "use strict";

  var CLUSTERS = ["Alto", "Medio", "Basso"];

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
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
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (value === null || value === undefined || value === "") return fallback;
    var clean = String(value).trim().replace(/\s/g, "");
    if (clean.indexOf(",") >= 0 && clean.indexOf(".") >= 0) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else if (clean.indexOf(",") >= 0) {
      clean = clean.replace(",", ".");
    }
    var number = Number(clean);
    return Number.isFinite(number) ? number : fallback;
  }

  function canonicalCluster(value) {
    var key = normalizeText(value);
    if (key === "alto") return "Alto";
    if (key === "medio") return "Medio";
    if (key === "basso") return "Basso";
    return "";
  }

  function findColumn(columns, aliases) {
    var lookup = {};
    columns.forEach(function (column) {
      lookup[normalizeText(column)] = column;
    });
    for (var i = 0; i < aliases.length; i += 1) {
      var found = lookup[normalizeText(aliases[i])];
      if (found !== undefined) return found;
    }
    return null;
  }

  function detectColumns(rows, aliases) {
    var columns = rows.length ? Object.keys(rows[0]) : [];
    var mapping = {};
    Object.keys(aliases).forEach(function (key) {
      mapping[key] = findColumn(columns, aliases[key]);
    });
    return mapping;
  }

  var ASSORTMENT_ALIASES = {
    id: ["Id", "Fk_Prd", "Codice articolo", "Articolo"],
    sku: ["SkuCodice", "SKU", "EAN", "Codice EAN"],
    description: ["Prodotto", "Descrizione", "Descrizione articolo"],
    reparto: ["Reparto"],
    gruppo: ["Famiglia", "Gruppo"],
    famiglia: ["SttFamiglia", "Sottofamiglia", "Sotto famiglia"],
    breve: ["Breve"],
    galto: ["GAlto"],
    gmedio: ["GMedio"],
    gbasso: ["GBasso"],
    pack: ["Art_Pz", "Pezzi collo", "Pz collo", "Imballo"],
    space: ["SpazioUnitario", "Ingombro", "CmLineari", "Cm lineari"],
    brand: ["Brand", "Marca"]
  };

  var SALES_ALIASES = {
    article: ["Fk_Prd", "Id", "Codice articolo", "Articolo"],
    product: ["Prodotto", "Descrizione"],
    storeCode: ["Pv", "PDV", "Codice PDV"],
    store: ["Negozio", "Punto vendita", "PuntoVendita", "Store"],
    purchases: ["Acq", "Acquisti"],
    quantity: ["Vnd", "Vendite", "Quantita", "Quantità", "Pezzi"],
    finalStock: ["GFn", "Giacenza finale", "Giacenza"],
    date: ["Data", "Data fine", "Periodo"]
  };

  var CLUSTER_ALIASES = {
    store: ["Descrizione", "Negozio", "Punto vendita", "PuntoVendita", "PDV", "Store"],
    priority: ["Priorita", "Priorità", "Cluster"],
    type: ["Tipo", "Livello"],
    reparto: ["Reparto"],
    gruppo: ["Gruppo", "Famiglia"],
    famiglia: ["Famiglia", "SttFamiglia", "Sottofamiglia"]
  };

  function requiredMissing(mapping, requiredKeys) {
    return requiredKeys.filter(function (key) { return !mapping[key]; });
  }

  function uniqueValues(rows, column, filterFn) {
    if (!column) return [];
    var seen = {};
    rows.forEach(function (row) {
      if (filterFn && !filterFn(row)) return;
      var value = row[column] === null || row[column] === undefined ? "" : String(row[column]).trim();
      if (value) seen[value] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, "it", { sensitivity: "base" });
    });
  }

  function prepareAssortment(rows, mapping, scope) {
    var result = [];
    var seen = {};
    var info = {
      sourceRows: rows.length,
      excludedBreve: 0,
      excludedScope: 0,
      missingId: 0,
      duplicates: 0
    };

    rows.forEach(function (row) {
      if (normalizeText(row[mapping.breve]) !== "n") {
        info.excludedBreve += 1;
        return;
      }
      if (scope.reparto && normalizeText(row[mapping.reparto]) !== normalizeText(scope.reparto)) {
        info.excludedScope += 1;
        return;
      }
      if (scope.gruppo && normalizeText(row[mapping.gruppo]) !== normalizeText(scope.gruppo)) {
        info.excludedScope += 1;
        return;
      }
      if (scope.famiglia && normalizeText(row[mapping.famiglia]) !== normalizeText(scope.famiglia)) {
        info.excludedScope += 1;
        return;
      }

      var articleId = normalizeId(row[mapping.id]);
      if (!articleId) {
        info.missingId += 1;
        return;
      }
      if (seen[articleId]) {
        info.duplicates += 1;
        return;
      }
      seen[articleId] = true;

      var pack = mapping.pack ? Math.max(1, Math.round(toNumber(row[mapping.pack], 1))) : 1;
      var space = mapping.space ? Math.max(0.0001, toNumber(row[mapping.space], 1)) : 1;
      result.push({
        article_id: articleId,
        sku: mapping.sku ? normalizeId(row[mapping.sku]) : "",
        description: String(row[mapping.description] || "").trim(),
        brand: mapping.brand ? String(row[mapping.brand] || "").trim() : "",
        GAlto: Math.max(0, Math.round(toNumber(row[mapping.galto], 0))),
        GMedio: Math.max(0, Math.round(toNumber(row[mapping.gmedio], 0))),
        GBasso: Math.max(0, Math.round(toNumber(row[mapping.gbasso], 0))),
        pack_size: pack,
        space_unit: space
      });
    });

    return { rows: result, info: info };
  }

  function prepareClusterMapping(rows, mapping, scope) {
    var levels = [
      { name: "Famiglia", type: "F", key: "famiglia", value: scope.famiglia },
      { name: "Gruppo", type: "G", key: "gruppo", value: scope.gruppo },
      { name: "Reparto", type: "R", key: "reparto", value: scope.reparto }
    ];

    for (var i = 0; i < levels.length; i += 1) {
      var level = levels[i];
      if (!level.value || !mapping[level.key]) continue;
      var selected = rows.filter(function (row) {
        var cluster = canonicalCluster(row[mapping.priority]);
        if (!cluster) return false;
        var typeMatches = !mapping.type || normalizeText(row[mapping.type]) === normalizeText(level.type);
        var scopeMatches = normalizeText(row[mapping[level.key]]) === normalizeText(level.value);
        return typeMatches && scopeMatches;
      });

      if (selected.length) {
        var seen = {};
        var stores = [];
        selected.forEach(function (row) {
          var store = String(row[mapping.store] || "").trim();
          var key = normalizeText(store);
          var cluster = canonicalCluster(row[mapping.priority]);
          if (!store || !key || !cluster || seen[key]) return;
          seen[key] = true;
          stores.push({ store: store, store_key: key, cluster: cluster });
        });
        return {
          stores: stores,
          levelUsed: level.name,
          counts: countStores(stores)
        };
      }
    }

    return { stores: [], levelUsed: "Non disponibile", counts: countStores([]) };
  }

  function countStores(stores) {
    var counts = { Alto: 0, Medio: 0, Basso: 0, Totale: 0 };
    stores.forEach(function (store) {
      if (counts[store.cluster] !== undefined) counts[store.cluster] += 1;
      counts.Totale += 1;
    });
    return counts;
  }

  function parseDate(value, XLSXRef) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && XLSXRef && XLSXRef.SSF) {
      var parsedCode = XLSXRef.SSF.parse_date_code(value);
      if (parsedCode) return new Date(parsedCode.y, parsedCode.m - 1, parsedCode.d);
    }
    if (value === null || value === undefined || value === "") return null;
    var stringValue = String(value).trim();
    var italian = stringValue.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (italian) {
      var year = Number(italian[3]);
      if (year < 100) year += 2000;
      var localDate = new Date(year, Number(italian[2]) - 1, Number(italian[1]));
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
    var date = new Date(stringValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function prepareSales(rows, mapping, clusterData, assortment, months, XLSXRef) {
    var storeLookup = {};
    clusterData.stores.forEach(function (store) {
      storeLookup[store.store_key] = store;
    });

    var articleLookup = {};
    assortment.forEach(function (article, index) {
      articleLookup[normalizeId(article.article_id)] = index;
      if (article.sku) articleLookup[normalizeId(article.sku)] = index;
    });

    var grouped = {};
    var dates = [];
    var unmatchedStoreNames = {};
    var unmatchedArticleIds = {};
    var info = {
      sourceRows: rows.length,
      ignoredRows: 0,
      invalidQuantity: 0,
      invalidDate: 0,
      unmatchedStores: 0,
      unmatchedArticles: 0,
      start: null,
      end: null,
      months: months
    };

    rows.forEach(function (row) {
      var articleKey = normalizeId(row[mapping.article]);
      var storeName = String(row[mapping.store] || "").trim();
      var storeKey = normalizeText(storeName);

      if (!articleKey || !storeName || storeKey === normalizeText("VendOnLine") || storeKey.indexOf("totale") === 0) {
        info.ignoredRows += 1;
        return;
      }

      var quantity = toNumber(row[mapping.quantity], NaN);
      if (!Number.isFinite(quantity)) {
        info.invalidQuantity += 1;
        return;
      }

      var store = storeLookup[storeKey];
      if (!store) {
        unmatchedStoreNames[storeKey] = storeName;
        return;
      }

      var articleIndex = articleLookup[articleKey];
      if (articleIndex === undefined) {
        unmatchedArticleIds[articleKey] = true;
        return;
      }

      var date = mapping.date ? parseDate(row[mapping.date], XLSXRef) : null;
      if (date) dates.push(date);
      else if (mapping.date && row[mapping.date] !== null && row[mapping.date] !== undefined && row[mapping.date] !== "") info.invalidDate += 1;

      var groupKey = articleIndex + "|" + store.store_key;
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          articleIndex: articleIndex,
          store: store.store,
          store_key: store.store_key,
          cluster: store.cluster,
          quantity: 0,
          purchases: 0,
          finalStock: 0
        };
      }
      grouped[groupKey].quantity += quantity;
      grouped[groupKey].purchases += mapping.purchases ? toNumber(row[mapping.purchases], 0) : 0;
      grouped[groupKey].finalStock = mapping.finalStock ? toNumber(row[mapping.finalStock], grouped[groupKey].finalStock) : 0;
    });

    info.unmatchedStores = Object.keys(unmatchedStoreNames).length;
    info.unmatchedStoreNames = Object.keys(unmatchedStoreNames).map(function (key) { return unmatchedStoreNames[key]; });
    info.unmatchedArticles = Object.keys(unmatchedArticleIds).length;
    info.unmatchedArticleIds = Object.keys(unmatchedArticleIds);
    if (dates.length) {
      info.start = new Date(Math.min.apply(null, dates.map(function (date) { return date.getTime(); })));
      info.end = new Date(Math.max.apply(null, dates.map(function (date) { return date.getTime(); })));
    }

    var sales = Object.keys(grouped).map(function (key) {
      var item = grouped[key];
      item.quantity = Math.max(0, item.quantity);
      return item;
    });

    return { sales: sales, info: info };
  }

  function percentileRanks(values) {
    if (!values.length) return [];
    var indexed = values.map(function (value, index) { return { value: value, index: index }; });
    indexed.sort(function (a, b) { return a.value - b.value; });
    var ranks = new Array(values.length);
    var start = 0;
    while (start < indexed.length) {
      var end = start;
      while (end + 1 < indexed.length && indexed[end + 1].value === indexed[start].value) end += 1;
      var averagePosition = (start + end) / 2;
      var rank = indexed.length === 1 ? 1 : averagePosition / (indexed.length - 1);
      for (var i = start; i <= end; i += 1) ranks[indexed[i].index] = rank;
      start = end + 1;
    }
    return ranks;
  }

  function assignABC(rows) {
    var total = rows.reduce(function (sum, row) { return sum + row.sales6mTotal; }, 0);
    var sorted = rows.slice().sort(function (a, b) { return b.sales6mTotal - a.sales6mTotal; });
    var cumulative = 0;
    sorted.forEach(function (row) {
      cumulative += row.sales6mTotal;
      var share = total > 0 ? cumulative / total : 1;
      row.abc = share <= 0.8 ? "A" : (share <= 0.95 ? "B" : "C");
      row.cumulativeSalesShare = share;
    });
  }

  function calculateMetrics(assortment, sales, clusterData, months) {
    var counts = clusterData.counts;
    var rows = assortment.map(function (article) {
      return {
        article_id: article.article_id,
        sku: article.sku,
        description: article.description,
        brand: article.brand,
        GAlto: article.GAlto,
        GMedio: article.GMedio,
        GBasso: article.GBasso,
        pack_size: article.pack_size,
        space_unit: article.space_unit,
        salesAlto: 0,
        salesMedio: 0,
        salesBasso: 0,
        storesSellingAlto: {},
        storesSellingMedio: {},
        storesSellingBasso: {}
      };
    });

    sales.forEach(function (sale) {
      var row = rows[sale.articleIndex];
      if (!row) return;
      var salesKey = "sales" + sale.cluster;
      var storesKey = "storesSelling" + sale.cluster;
      row[salesKey] += sale.quantity;
      if (sale.quantity > 0) row[storesKey][sale.store_key] = true;
    });

    rows.forEach(function (row) {
      row.sales6mTotal = row.salesAlto + row.salesMedio + row.salesBasso;
      row.monthlyPerStoreAlto = counts.Alto > 0 ? row.salesAlto / counts.Alto / months : 0;
      row.monthlyPerStoreMedio = counts.Medio > 0 ? row.salesMedio / counts.Medio / months : 0;
      row.monthlyPerStoreBasso = counts.Basso > 0 ? row.salesBasso / counts.Basso / months : 0;
      row.monthlyPerStoreNetwork = counts.Totale > 0 ? row.sales6mTotal / counts.Totale / months : 0;
      row.penetrationAlto = counts.Alto > 0 ? Object.keys(row.storesSellingAlto).length / counts.Alto : 0;
      row.penetrationMedio = counts.Medio > 0 ? Object.keys(row.storesSellingMedio).length / counts.Medio : 0;
      row.penetrationBasso = counts.Basso > 0 ? Object.keys(row.storesSellingBasso).length / counts.Basso : 0;
      row.penetrationNetwork = counts.Totale > 0 ? (
        Object.keys(row.storesSellingAlto).length +
        Object.keys(row.storesSellingMedio).length +
        Object.keys(row.storesSellingBasso).length
      ) / counts.Totale : 0;
    });

    assignABC(rows);

    var networkRanks = percentileRanks(rows.map(function (row) { return row.monthlyPerStoreNetwork; }));
    var medioRanks = percentileRanks(rows.map(function (row) { return row.monthlyPerStoreMedio; }));
    var bassoRanks = percentileRanks(rows.map(function (row) { return row.monthlyPerStoreBasso; }));
    var penetrationRanks = percentileRanks(rows.map(function (row) { return row.penetrationNetwork; }));

    rows.forEach(function (row, index) {
      var abcBonus = row.abc === "A" ? 10 : (row.abc === "B" ? 4 : 0);
      row.scoreMedio = Math.min(100, Math.round(
        50 * networkRanks[index] +
        25 * medioRanks[index] +
        15 * penetrationRanks[index] +
        10 * row.penetrationMedio +
        abcBonus
      ));
      row.scoreBasso = Math.min(100, Math.round(
        55 * networkRanks[index] +
        20 * bassoRanks[index] +
        15 * penetrationRanks[index] +
        10 * row.penetrationBasso +
        abcBonus
      ));
      row.core = row.abc === "A" || row.scoreBasso >= 75;
    });

    return { rows: rows, storeCounts: counts };
  }

  function spaceOf(rows, field) {
    return rows.reduce(function (sum, row) {
      return sum + Math.max(0, toNumber(row[field], 0)) * row.space_unit;
    }, 0);
  }

  function referencesOf(rows, field) {
    return rows.filter(function (row) { return toNumber(row[field], 0) > 0; }).length;
  }

  function roundDownToStep(value, step) {
    if (step <= 1) return Math.max(0, Math.floor(value + 1e-9));
    return Math.max(0, Math.floor((value + 1e-9) / step) * step);
  }

  function actionLabel(current, proposed) {
    if (current <= 0 && proposed > 0) return "Inserire";
    if (current > 0 && proposed <= 0) return "Eliminare";
    if (proposed > current) return "Aumentare";
    if (proposed < current) return "Ridurre";
    return "Confermare";
  }

  function optimizeCluster(rows, options) {
    var cluster = options.cluster;
    var ratio = options.ratio;
    var capacity = options.capacity;
    var coverageMonths = options.coverageMonths;
    var safetyStock = options.safetyStock;
    var minDisplay = options.minDisplay;
    var roundToPack = options.roundToPack;
    var coreThreshold = options.coreThreshold;
    var scoreField = cluster === "Medio" ? "scoreMedio" : "scoreBasso";
    var clusterMonthlyField = cluster === "Medio" ? "monthlyPerStoreMedio" : "monthlyPerStoreBasso";
    var proposedField = "proposed" + cluster;
    var currentField = "G" + cluster;

    rows.forEach(function (row) {
      var maximum = cluster === "Medio" ? row.GAlto : Math.min(row.GAlto, row.proposedMedio || 0);
      var step = roundToPack ? Math.max(1, row.pack_size) : 1;
      var score = row[scoreField] / 100;
      var baseScaled = row.GAlto * ratio;
      var demandProxy = Math.max(row[clusterMonthlyField], row.monthlyPerStoreNetwork * ratio);
      var demandTarget = demandProxy * coverageMonths + safetyStock;
      var performanceMultiplier = 0.55 + 0.9 * score;
      var continuousTarget = Math.min(maximum, Math.max(0, 0.65 * baseScaled * performanceMultiplier + 0.35 * demandTarget));
      var initial = roundDownToStep(continuousTarget, step);
      var isCore = row.abc === "A" || row[scoreField] >= coreThreshold;
      var minimum = isCore && maximum > 0 ? Math.min(maximum, Math.max(minDisplay, step)) : 0;
      if (initial < minimum) initial = minimum;
      if (initial > maximum) initial = roundDownToStep(maximum, step);

      row["_" + cluster] = {
        maximum: maximum,
        step: step,
        desired: continuousTarget,
        minimum: minimum,
        demandTarget: demandTarget
      };
      row[proposedField] = initial;
    });

    function usedSpace() {
      return rows.reduce(function (sum, row) {
        return sum + row[proposedField] * row.space_unit;
      }, 0);
    }

    var used = usedSpace();
    var guard = 0;

    while (used > capacity + 1e-9 && guard < 100000) {
      guard += 1;
      var removable = rows.filter(function (row) {
        var meta = row["_" + cluster];
        return row[proposedField] - meta.step >= meta.minimum;
      });
      if (!removable.length) break;
      removable.sort(function (a, b) {
        var aMeta = a["_" + cluster];
        var bMeta = b["_" + cluster];
        var aNeed = Math.max(0, aMeta.demandTarget - a[proposedField]);
        var bNeed = Math.max(0, bMeta.demandTarget - b[proposedField]);
        var aValue = a[scoreField] + 12 * aNeed / (1 + aMeta.demandTarget);
        var bValue = b[scoreField] + 12 * bNeed / (1 + bMeta.demandTarget);
        return aValue - bValue;
      });
      var removeRow = removable[0];
      var removeStep = removeRow["_" + cluster].step;
      removeRow[proposedField] -= removeStep;
      used -= removeStep * removeRow.space_unit;
    }

    // Se la capacità è molto ridotta, anche i minimi Core possono non essere tutti compatibili.
    // In questo caso vengono mantenuti i Core con punteggio più alto e rimossi gli altri.
    guard = 0;
    while (used > capacity + 1e-9 && guard < 100000) {
      guard += 1;
      var emergency = rows.filter(function (row) {
        var meta = row["_" + cluster];
        return row[proposedField] - meta.step >= 0;
      });
      if (!emergency.length) break;
      emergency.sort(function (a, b) {
        if (a[scoreField] !== b[scoreField]) return a[scoreField] - b[scoreField];
        return a.sales6mTotal - b.sales6mTotal;
      });
      var emergencyRow = emergency[0];
      var emergencyStep = emergencyRow["_" + cluster].step;
      emergencyRow[proposedField] -= emergencyStep;
      used -= emergencyStep * emergencyRow.space_unit;
    }

    guard = 0;
    while (guard < 100000) {
      guard += 1;
      var addable = rows.filter(function (row) {
        var meta = row["_" + cluster];
        if (row[proposedField] + meta.step > meta.maximum + 1e-9) return false;
        return used + meta.step * row.space_unit <= capacity + 1e-9;
      });
      if (!addable.length) break;
      addable.sort(function (a, b) {
        var aMeta = a["_" + cluster];
        var bMeta = b["_" + cluster];
        var aGap = Math.max(0, aMeta.desired - a[proposedField]);
        var bGap = Math.max(0, bMeta.desired - b[proposedField]);
        var aDemandGap = Math.max(0, aMeta.demandTarget - a[proposedField]);
        var bDemandGap = Math.max(0, bMeta.demandTarget - b[proposedField]);
        var aUtility = a[scoreField] + 25 * aGap / (1 + aMeta.desired) + 15 * aDemandGap / (1 + aMeta.demandTarget);
        var bUtility = b[scoreField] + 25 * bGap / (1 + bMeta.desired) + 15 * bDemandGap / (1 + bMeta.demandTarget);
        if (bUtility !== aUtility) return bUtility - aUtility;
        return b.sales6mTotal - a.sales6mTotal;
      });
      var addRow = addable[0];
      var addStep = addRow["_" + cluster].step;
      addRow[proposedField] += addStep;
      used += addStep * addRow.space_unit;
    }

    rows.forEach(function (row) {
      row["action" + cluster] = actionLabel(row[currentField], row[proposedField]);
      delete row["_" + cluster];
    });

    return {
      capacity: capacity,
      used: used,
      utilization: capacity > 0 ? used / capacity : 0,
      references: referencesOf(rows, proposedField)
    };
  }

  function buildScenario(metricRows, meters, params) {
    if (!(meters.Alto > 0)) throw new Error("I metri del cluster Alto devono essere maggiori di zero.");
    if (!(meters.Medio >= 0) || !(meters.Basso >= 0)) throw new Error("I metri di Medio e Basso non possono essere negativi.");
    if (meters.Medio > meters.Alto) throw new Error("I metri del cluster Medio non possono superare quelli dell'Alto.");
    if (meters.Basso > meters.Medio) throw new Error("I metri del cluster Basso non possono superare quelli del Medio.");

    var rows = metricRows.map(function (row) {
      var copy = {};
      Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
      return copy;
    });

    var highSpace = spaceOf(rows, "GAlto");
    if (!(highSpace > 0)) throw new Error("L'assegnato GAlto non contiene quantità utilizzabili.");

    var unitsPerMeter = highSpace / meters.Alto;
    var ratioMedio = meters.Medio / meters.Alto;
    var ratioBasso = meters.Basso / meters.Alto;
    var capacityMedio = highSpace * ratioMedio;
    var capacityBasso = highSpace * ratioBasso;

    rows.forEach(function (row) { row.proposedAlto = row.GAlto; });

    var medio = optimizeCluster(rows, {
      cluster: "Medio",
      ratio: ratioMedio,
      capacity: capacityMedio,
      coverageMonths: params.coverageMonths,
      safetyStock: params.safetyStock,
      minDisplay: params.minDisplay,
      roundToPack: params.roundToPack,
      coreThreshold: params.coreThreshold
    });

    var basso = optimizeCluster(rows, {
      cluster: "Basso",
      ratio: ratioBasso,
      capacity: capacityBasso,
      coverageMonths: params.coverageMonths,
      safetyStock: params.safetyStock,
      minDisplay: params.minDisplay,
      roundToPack: params.roundToPack,
      coreThreshold: params.coreThreshold
    });

    var totalSales = rows.reduce(function (sum, row) { return sum + row.sales6mTotal; }, 0);
    function coverage(field) {
      var covered = rows.reduce(function (sum, row) {
        return sum + (row[field] > 0 ? row.sales6mTotal : 0);
      }, 0);
      return totalSales > 0 ? covered / totalSales : 0;
    }

    var summary = {
      Alto: {
        meters: meters.Alto,
        ratio: 1,
        targetSpace: highSpace,
        currentSpace: highSpace,
        proposedSpace: highSpace,
        currentMetersEquivalent: meters.Alto,
        proposedMetersEquivalent: meters.Alto,
        currentReferences: referencesOf(rows, "GAlto"),
        proposedReferences: referencesOf(rows, "proposedAlto"),
        salesCoverage: coverage("proposedAlto")
      },
      Medio: {
        meters: meters.Medio,
        ratio: ratioMedio,
        targetSpace: capacityMedio,
        currentSpace: spaceOf(rows, "GMedio"),
        proposedSpace: medio.used,
        currentMetersEquivalent: spaceOf(rows, "GMedio") / unitsPerMeter,
        proposedMetersEquivalent: medio.used / unitsPerMeter,
        currentReferences: referencesOf(rows, "GMedio"),
        proposedReferences: medio.references,
        salesCoverage: coverage("proposedMedio")
      },
      Basso: {
        meters: meters.Basso,
        ratio: ratioBasso,
        targetSpace: capacityBasso,
        currentSpace: spaceOf(rows, "GBasso"),
        proposedSpace: basso.used,
        currentMetersEquivalent: spaceOf(rows, "GBasso") / unitsPerMeter,
        proposedMetersEquivalent: basso.used / unitsPerMeter,
        currentReferences: referencesOf(rows, "GBasso"),
        proposedReferences: basso.references,
        salesCoverage: coverage("proposedBasso")
      },
      unitsPerMeter: unitsPerMeter,
      highSpace: highSpace
    };

    rows.forEach(function (row) {
      row.deltaMedio = row.proposedMedio - row.GMedio;
      row.deltaBasso = row.proposedBasso - row.GBasso;
      row.combinedAction = "Medio: " + row.actionMedio + " · Basso: " + row.actionBasso;
    });

    return { rows: rows, summary: summary };
  }

  function baseSummary(rows) {
    return CLUSTERS.map(function (cluster) {
      var field = "G" + cluster;
      return {
        cluster: cluster,
        references: referencesOf(rows, field),
        units: spaceOf(rows, field)
      };
    });
  }

  var API = {
    CLUSTERS: CLUSTERS,
    ASSORTMENT_ALIASES: ASSORTMENT_ALIASES,
    SALES_ALIASES: SALES_ALIASES,
    CLUSTER_ALIASES: CLUSTER_ALIASES,
    normalizeText: normalizeText,
    normalizeId: normalizeId,
    toNumber: toNumber,
    detectColumns: detectColumns,
    requiredMissing: requiredMissing,
    uniqueValues: uniqueValues,
    prepareAssortment: prepareAssortment,
    prepareClusterMapping: prepareClusterMapping,
    prepareSales: prepareSales,
    calculateMetrics: calculateMetrics,
    buildScenario: buildScenario,
    baseSummary: baseSummary,
    spaceOf: spaceOf,
    referencesOf: referencesOf
  };

  global.AssortmentEngine = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
