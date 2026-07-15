(function (global) {
  "use strict";

  var CLUSTERS = ["Alto", "Medio", "Basso"];

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
    var n;
    if (typeof value === "number") n = value;
    else if (value === null || value === undefined || value === "") n = NaN;
    else n = Number(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  function prepareAssortment(rows) {
    return rows.filter(function (row) {
      return String(row.Breve || "").trim().toUpperCase() === "N";
    }).map(function (row) {
      return {
        article_id: normalizeId(row.Id),
        sku: normalizeId(row.SkuCodice),
        description: String(row.Prodotto || "").trim(),
        reparto: String(row.Reparto || "").trim(),
        gruppo: String(row.Famiglia || "").trim(),
        famiglia: String(row.SttFamiglia || "").trim(),
        supplier: String(row.Fornitore || "SENZA FORNITORE").trim() || "SENZA FORNITORE",
        pack_size: Math.max(1, Math.round(toNumber(row.Art_Pz, 1))),
        GAlto: Math.max(0, Math.round(toNumber(row.GAlto, 0))),
        GMedio: Math.max(0, Math.round(toNumber(row.GMedio, 0))),
        GBasso: Math.max(0, Math.round(toNumber(row.GBasso, 0)))
      };
    }).filter(function (row) { return row.article_id && row.GAlto > 0; });
  }

  function detectScope(assortment) {
    function unique(key) {
      var out = {};
      assortment.forEach(function (row) { if (row[key]) out[normalizeText(row[key])] = row[key]; });
      return Object.keys(out).map(function (k) { return out[k]; });
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
      var c = candidates[i];
      if (!c.value) continue;
      var selected = rows.filter(function (row) {
        var priority = String(row.Priorita || "").trim();
        var cluster = priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
        return CLUSTERS.indexOf(cluster) >= 0 &&
          normalizeText(row.Tipo) === normalizeText(c.type) &&
          normalizeText(row[c.column]) === normalizeText(c.value);
      });
      if (selected.length) {
        var seen = {};
        var stores = [];
        selected.forEach(function (row) {
          var store = String(row.Descrizione || "").trim();
          var key = normalizeText(store);
          var raw = String(row.Priorita || "").trim().toLowerCase();
          var cluster = raw.charAt(0).toUpperCase() + raw.slice(1);
          if (!store || seen[key] || CLUSTERS.indexOf(cluster) < 0) return;
          seen[key] = true;
          stores.push({ store: store, store_key: key, cluster: cluster });
        });
        stores.level_used = c.level;
        return stores;
      }
    }
    var empty = [];
    empty.level_used = "Non trovato";
    return empty;
  }

  function calculatePerformance(assortment, salesRows, storeMapping, selectedClusters) {
    var storeLookup = {};
    storeMapping.forEach(function (s) { storeLookup[s.store_key] = s; });
    var articleLookup = {};
    assortment.forEach(function (r, i) {
      articleLookup[r.article_id] = i;
      if (r.sku) articleLookup[r.sku] = i;
    });
    var selected = {};
    selectedClusters.forEach(function (x) { selected[x] = true; });
    var sales = assortment.map(function () { return 0; });
    var storesWithSales = assortment.map(function () { return {}; });
    var quality = {
      inputRows: salesRows.length,
      usedRows: 0,
      ignoredOnlineOrTotals: 0,
      storesNotMapped: {},
      articlesNotMatched: 0,
      invalidSales: 0
    };

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
      if (!selected[store.cluster]) return;
      var index = articleLookup[article];
      if (index === undefined) {
        quality.articlesNotMatched += 1;
        return;
      }
      var qty = toNumber(row.Vnd, NaN);
      if (!Number.isFinite(qty)) {
        quality.invalidSales += 1;
        return;
      }
      sales[index] += Math.max(0, qty);
      if (qty > 0) storesWithSales[index][store.store_key] = true;
      quality.usedRows += 1;
    });

    var selectedStoreCount = storeMapping.filter(function (s) { return selected[s.cluster]; }).length;
    var rows = assortment.map(function (source, i) {
      var row = Object.assign({}, source);
      row.sales_selected = sales[i];
      row.sales_per_store = selectedStoreCount ? sales[i] / selectedStoreCount : 0;
      row.active_stores = Object.keys(storesWithSales[i]).length;
      return row;
    });

    rows.sort(function (a, b) {
      if (b.sales_selected !== a.sales_selected) return b.sales_selected - a.sales_selected;
      if (b.sales_per_store !== a.sales_per_store) return b.sales_per_store - a.sales_per_store;
      if (b.GAlto !== a.GAlto) return b.GAlto - a.GAlto;
      return a.description.localeCompare(b.description, "it", { sensitivity: "base" });
    });
    rows.forEach(function (row, index) {
      row.performance_rank = index + 1;
      row.performance_pct = rows.length ? ((rows.length - index) / rows.length) * 100 : 0;
    });
    quality.storesNotMappedNames = Object.keys(quality.storesNotMapped).map(function (k) { return quality.storesNotMapped[k]; });
    quality.selectedStoreCount = selectedStoreCount;
    return { rows: rows, quality: quality };
  }

  function divisors(n) {
    var result = [];
    for (var i = 1; i <= Math.sqrt(n); i += 1) {
      if (n % i === 0) {
        result.push(i);
        if (i !== n / i) result.push(n / i);
      }
    }
    return result.sort(function (a, b) { return a - b; });
  }

  function quantityLadder(pack, maxQty) {
    maxQty = Math.max(0, Math.floor(maxQty));
    pack = Math.max(1, Math.round(pack || 1));
    var set = { 0: true };
    if (pack <= 1) {
      for (var x = 1; x <= maxQty; x += 1) set[x] = true;
    } else {
      divisors(pack).forEach(function (x) { if (x <= maxQty) set[x] = true; });
      for (var m = pack; m <= maxQty; m += pack) set[m] = true;
    }
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function nearestIndex(ladder, raw, preferUp) {
    var best = 0;
    var bestDistance = Infinity;
    ladder.forEach(function (value, i) {
      var distance = Math.abs(value - raw);
      if (distance < bestDistance || (distance === bestDistance && ((preferUp && value > ladder[best]) || (!preferUp && value < ladder[best])))) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  function allocateQuantities(retained, targetUnits) {
    if (!retained.length || targetUnits <= 0) {
      retained.forEach(function (row) { row._proposed = 0; });
      return 0;
    }
    var maxTotal = retained.reduce(function (s, r) { return s + r.GAlto; }, 0);
    targetUnits = Math.max(0, Math.min(Math.round(targetUnits), maxTotal));
    var scale = maxTotal ? targetUnits / maxTotal : 0;

    retained.forEach(function (row, idx) {
      row._ladder = quantityLadder(row.pack_size, row.GAlto);
      var positive = row._ladder.filter(function (x) { return x > 0; });
      row._minPositive = positive.length ? positive[0] : 0;
      row._minIndex = row._minPositive > 0 ? row._ladder.indexOf(row._minPositive) : 0;
      var raw = row.GAlto * scale;
      var preferUp = idx < retained.length / 2;
      row._qIndex = nearestIndex(row._ladder, raw, preferUp);
      row._proposed = row._ladder[row._qIndex];
    });
    var minimumPositiveTotal = retained.reduce(function (s, row) { return s + row._minPositive; }, 0);
    var preservePositive = targetUnits >= minimumPositiveTotal;
    if (preservePositive) {
      retained.forEach(function (row) {
        if (row._qIndex < row._minIndex) {
          row._qIndex = row._minIndex;
          row._proposed = row._ladder[row._qIndex];
        }
      });
    }

    function total() { return retained.reduce(function (s, r) { return s + r._proposed; }, 0); }
    var current = total();
    var guard = 0;
    while (current < targetUnits && guard < 100000) {
      var best = null;
      retained.forEach(function (row) {
        if (row._qIndex >= row._ladder.length - 1) return;
        var next = row._ladder[row._qIndex + 1];
        var cost = next - row._proposed;
        if (cost <= 0) return;
        var fit = cost <= targetUnits - current ? 1 : 0;
        var candidate = { row: row, cost: cost, fit: fit, rank: row.performance_rank };
        if (!best || candidate.fit > best.fit ||
          (candidate.fit === best.fit && candidate.rank < best.rank) ||
          (candidate.fit === best.fit && candidate.rank === best.rank && candidate.cost < best.cost)) best = candidate;
      });
      if (!best) break;
      best.row._qIndex += 1;
      best.row._proposed = best.row._ladder[best.row._qIndex];
      current += best.cost;
      guard += 1;
      if (current > targetUnits && Math.abs(current - targetUnits) > Math.abs((current - best.cost) - targetUnits)) {
        best.row._qIndex -= 1;
        best.row._proposed = best.row._ladder[best.row._qIndex];
        current -= best.cost;
        break;
      }
    }

    while (current > targetUnits && guard < 200000) {
      var worst = null;
      retained.slice().reverse().forEach(function (row) {
        var floorIndex = preservePositive ? row._minIndex : 0;
        if (row._qIndex <= floorIndex) return;
        var prev = row._ladder[row._qIndex - 1];
        var saving = row._proposed - prev;
        var candidate = { row: row, saving: saving, rank: row.performance_rank };
        if (!worst || candidate.rank > worst.rank ||
          (candidate.rank === worst.rank && candidate.saving < worst.saving)) worst = candidate;
      });
      if (!worst) break;
      var before = current;
      worst.row._qIndex -= 1;
      worst.row._proposed = worst.row._ladder[worst.row._qIndex];
      current -= worst.saving;
      guard += 1;
      if (current < targetUnits && Math.abs(current - targetUnits) > Math.abs(before - targetUnits)) {
        worst.row._qIndex += 1;
        worst.row._proposed = worst.row._ladder[worst.row._qIndex];
        current = before;
        break;
      }
    }
    return current;
  }

  function normalizeHighQuantity(row) {
    var ladder = quantityLadder(row.pack_size, row.GAlto);
    var allowed = ladder.filter(function (x) { return x <= row.GAlto; });
    return allowed.length ? allowed[allowed.length - 1] : 0;
  }

  function buildClusterProposal(rankedRows, ratio, options, clusterName) {
    ratio = Math.max(0, Math.min(1, ratio));
    var highRows = rankedRows.filter(function (r) { return r.GAlto > 0; });
    var keepCount = options.resizeReferences ? Math.ceil(highRows.length * ratio) : highRows.length;
    if (ratio <= 0) keepCount = 0;
    var retainedSet = {};
    highRows.slice(0, keepCount).forEach(function (r) { retainedSet[r.article_id] = true; });
    var retained = highRows.filter(function (r) { return retainedSet[r.article_id]; });
    var targetUnits = Math.round(highRows.reduce(function (s, r) { return s + r.GAlto; }, 0) * ratio);

    if (options.resizeQuantities) allocateQuantities(retained, targetUnits);
    else retained.forEach(function (r) { r._proposed = normalizeHighQuantity(r); });

    var proposedTotal = retained.reduce(function (s, r) { return s + (r._proposed || 0); }, 0);
    var values = {};
    retained.forEach(function (r) { values[r.article_id] = r._proposed || 0; });
    return {
      cluster: clusterName,
      ratio: ratio,
      targetReferences: keepCount,
      targetUnits: options.resizeQuantities ? targetUnits : null,
      proposedReferences: retained.filter(function (r) { return (values[r.article_id] || 0) > 0; }).length,
      proposedUnits: proposedTotal,
      values: values
    };
  }

  function action(current, proposed) {
    if (current <= 0 && proposed > 0) return "Inserire";
    if (current > 0 && proposed <= 0) return "Eliminare";
    if (proposed < current) return "Ridurre";
    if (proposed > current) return "Aumentare";
    return proposed > 0 ? "Confermare" : "Escludere";
  }

  function buildProposals(rankedRows, meters, options) {
    var mediumRatio = meters.medio / meters.alto;
    var lowRatio = meters.basso / meters.alto;
    var medium = buildClusterProposal(rankedRows, mediumRatio, options, "Medio");
    var low = buildClusterProposal(rankedRows, lowRatio, options, "Basso");
    var rows = rankedRows.map(function (source) {
      var row = Object.assign({}, source);
      row.GMedio_proposto = medium.values[row.article_id] || 0;
      row.GBasso_proposto = low.values[row.article_id] || 0;
      row.azione_Medio = action(row.GMedio, row.GMedio_proposto);
      row.azione_Basso = action(row.GBasso, row.GBasso_proposto);
      return row;
    });
    return { rows: rows, medium: medium, low: low };
  }

  function supplierSummary(rows) {
    var groups = {};
    rows.forEach(function (r) {
      var key = r.supplier || "SENZA FORNITORE";
      if (!groups[key]) groups[key] = {
        Fornitore: key,
        Vendite: 0,
        Ref_Alto: 0, Ref_Medio_Attuali: 0, Ref_Medio_Proposte: 0,
        Ref_Basso_Attuali: 0, Ref_Basso_Proposte: 0,
        Qta_Alto: 0, Qta_Medio_Attuale: 0, Qta_Medio_Proposta: 0,
        Qta_Basso_Attuale: 0, Qta_Basso_Proposta: 0
      };
      var g = groups[key];
      g.Vendite += r.sales_selected;
      if (r.GAlto > 0) g.Ref_Alto += 1;
      if (r.GMedio > 0) g.Ref_Medio_Attuali += 1;
      if (r.GMedio_proposto > 0) g.Ref_Medio_Proposte += 1;
      if (r.GBasso > 0) g.Ref_Basso_Attuali += 1;
      if (r.GBasso_proposto > 0) g.Ref_Basso_Proposte += 1;
      g.Qta_Alto += r.GAlto;
      g.Qta_Medio_Attuale += r.GMedio;
      g.Qta_Medio_Proposta += r.GMedio_proposto;
      g.Qta_Basso_Attuale += r.GBasso;
      g.Qta_Basso_Proposta += r.GBasso_proposto;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      if (b.Vendite !== a.Vendite) return b.Vendite - a.Vendite;
      return a.Fornitore.localeCompare(b.Fornitore, "it", { sensitivity: "base" });
    });
  }

  global.AssortmentEngine = {
    CLUSTERS: CLUSTERS,
    normalizeText: normalizeText,
    normalizeId: normalizeId,
    toNumber: toNumber,
    prepareAssortment: prepareAssortment,
    detectScope: detectScope,
    prepareClusterMapping: prepareClusterMapping,
    calculatePerformance: calculatePerformance,
    quantityLadder: quantityLadder,
    buildProposals: buildProposals,
    supplierSummary: supplierSummary
  };
})(window);
