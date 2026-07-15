(function (global) {
  "use strict";

  var CLUSTERS = ["Alto", "Medio", "Basso"];

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeId(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
    }
    return String(value).trim().replace(/\.0+$/, "");
  }

  function toNumber(value, fallback) {
    var n;
    if (fallback === undefined) fallback = 0;
    if (typeof value === "number") n = value;
    else if (value === null || value === undefined || value === "") n = NaN;
    else n = Number(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  function findColumn(columns, aliases) {
    var lookup = {};
    columns.forEach(function (c) { lookup[normalizeText(c)] = c; });
    for (var i = 0; i < aliases.length; i += 1) {
      var hit = lookup[normalizeText(aliases[i])];
      if (hit !== undefined) return hit;
    }
    return null;
  }

  var ASSORTMENT_ALIASES = {
    sku: ["SkuCodice", "SKU", "EAN", "Codice EAN"],
    id: ["Id", "Fk_Prd", "Codice articolo", "Articolo"],
    description: ["Prodotto", "Descrizione", "Descrizione articolo"],
    reparto: ["Reparto"],
    gruppo: ["Famiglia", "Gruppo"],
    famiglia: ["SttFamiglia", "Sottofamiglia", "Sotto famiglia"],
    breve: ["Breve"],
    galto: ["GAlto"],
    gmedio: ["GMedio"],
    gbasso: ["GBasso"],
    pack: ["Art_Pz", "Pezzi collo", "Pz collo", "Imballo"],
    volume: ["Volume", "Ingombro", "Cm lineari", "Spazio unitario"],
    brand: ["Brand", "Marca"]
  };

  var SALES_ALIASES = {
    article: ["Id", "Fk_Prd", "Codice articolo", "Articolo", "SKU", "SkuCodice", "EAN"],
    store: ["Punto vendita", "PuntoVendita", "PDV", "Negozio", "Store", "Descrizione PDV", "Descrizione"],
    quantity: ["Quantita", "Quantit\u00e0", "Pezzi", "Qta", "Vendite pezzi", "Qta venduta"],
    date: ["Data", "Giorno", "Mese", "Data vendita"],
    salesValue: ["Venduto", "Fatturato", "Valore vendite", "Importo"],
    margin: ["Margine", "Margine euro", "Margine \u20ac"]
  };

  var CLUSTER_ALIASES = {
    store: ["Descrizione", "Punto vendita", "PuntoVendita", "PDV", "Negozio", "Store"],
    priority: ["Priorita", "Priorit\u00e0", "Cluster"],
    type: ["Tipo", "Livello"],
    reparto: ["Reparto"],
    gruppo: ["Gruppo", "Famiglia"],
    famiglia: ["Famiglia", "Sottofamiglia", "SttFamiglia"]
  };

  function detectColumns(rows, aliases) {
    var columns = rows.length ? Object.keys(rows[0]) : [];
    var out = {};
    Object.keys(aliases).forEach(function (key) { out[key] = findColumn(columns, aliases[key]); });
    return out;
  }

  function uniqueValues(rows, column, filterFn) {
    if (!column) return [];
    var seen = {};
    rows.forEach(function (row) {
      if (filterFn && !filterFn(row)) return;
      var value = row[column] === null || row[column] === undefined ? "" : String(row[column]).trim();
      if (value) seen[value] = true;
    });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "it", { sensitivity: "base" }); });
  }

  function prepareAssortment(rows, mapping, scope) {
    var result = [];
    rows.forEach(function (row) {
      if (normalizeText(row[mapping.breve]).toUpperCase() !== "N") return;
      if (scope.reparto && normalizeText(row[mapping.reparto]) !== normalizeText(scope.reparto)) return;
      if (scope.gruppo && normalizeText(row[mapping.gruppo]) !== normalizeText(scope.gruppo)) return;
      if (scope.famiglia && normalizeText(row[mapping.famiglia]) !== normalizeText(scope.famiglia)) return;
      var pack = mapping.pack ? toNumber(row[mapping.pack], 1) : 1;
      var space = mapping.volume ? toNumber(row[mapping.volume], 1) : 1;
      result.push({
        article_id: normalizeId(row[mapping.id]),
        sku: mapping.sku ? normalizeId(row[mapping.sku]) : "",
        description: String(row[mapping.description] || "").trim(),
        brand: mapping.brand ? String(row[mapping.brand] || "").trim() : "",
        GAlto: Math.max(0, toNumber(row[mapping.galto], 0)),
        GMedio: Math.max(0, toNumber(row[mapping.gmedio], 0)),
        GBasso: Math.max(0, toNumber(row[mapping.gbasso], 0)),
        pack_size: pack > 0 ? pack : 1,
        space_unit: space > 0 ? space : 1
      });
    });
    return result;
  }

  function prepareClusterMapping(rows, mapping, scope) {
    function valid(row) {
      var p = String(row[mapping.priority] || "").trim();
      return CLUSTERS.indexOf(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()) >= 0;
    }
    var candidates = [
      { level: "Famiglia", type: "F", key: "famiglia", expected: scope.famiglia },
      { level: "Gruppo", type: "G", key: "gruppo", expected: scope.gruppo },
      { level: "Reparto", type: "R", key: "reparto", expected: scope.reparto }
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var c = candidates[i];
      if (!mapping[c.key] || !c.expected) continue;
      var selected = rows.filter(function (row) {
        return valid(row) &&
          (!mapping.type || normalizeText(row[mapping.type]) === normalizeText(c.type)) &&
          normalizeText(row[mapping[c.key]]) === normalizeText(c.expected);
      });
      if (selected.length) {
        var stores = [];
        var seen = {};
        selected.forEach(function (row) {
          var store = String(row[mapping.store] || "").trim();
          var clusterRaw = String(row[mapping.priority] || "").trim().toLowerCase();
          var cluster = clusterRaw.charAt(0).toUpperCase() + clusterRaw.slice(1);
          var key = normalizeText(store);
          if (!store || !key || seen[key] || CLUSTERS.indexOf(cluster) < 0) return;
          seen[key] = true;
          stores.push({ store: store, store_key: key, cluster: cluster });
        });
        stores.level_used = c.level;
        return stores;
      }
    }
    var empty = [];
    empty.level_used = "Non disponibile";
    return empty;
  }

  function parseDate(value, XLSXRef) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === "number" && XLSXRef && XLSXRef.SSF) {
      var d = XLSXRef.SSF.parse_date_code(value);
      if (d) return new Date(d.y, d.m - 1, d.d);
    }
    if (value === null || value === undefined || value === "") return null;
    var s = String(value).trim();
    var m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      var year = Number(m[3]);
      if (year < 100) year += 2000;
      var local = new Date(year, Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(local.getTime()) ? null : local;
    }
    var parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function monthKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function prepareSales(rows, mapping, clusterMapping, assortment, months, XLSXRef) {
    var storeLookup = {};
    clusterMapping.forEach(function (x) { storeLookup[x.store_key] = x; });
    var articleLookup = {};
    assortment.forEach(function (x, idx) {
      if (x.article_id) articleLookup[normalizeId(x.article_id)] = idx;
      if (x.sku) articleLookup[normalizeId(x.sku)] = idx;
    });
    var parsed = [];
    var invalidDates = 0;
    var invalidQty = 0;
    rows.forEach(function (row) {
      var date = parseDate(row[mapping.date], XLSXRef);
      var quantity = toNumber(row[mapping.quantity], NaN);
      if (!date) invalidDates += 1;
      if (!Number.isFinite(quantity)) invalidQty += 1;
      if (!date || !Number.isFinite(quantity)) return;
      parsed.push({
        article_key: normalizeId(row[mapping.article]),
        store: String(row[mapping.store] || "").trim(),
        store_key: normalizeText(row[mapping.store]),
        quantity: quantity,
        date: date
      });
    });
    if (!parsed.length) return { sales: [], info: { invalidDates: invalidDates, invalidQty: invalidQty, unmappedStores: 0, unmatchedArticles: 0, start: null, end: null } };
    var end = new Date(Math.max.apply(null, parsed.map(function (x) { return x.date.getTime(); })));
    var start = new Date(end.getFullYear(), end.getMonth() - months, end.getDate() + 1);
    var unmapped = {};
    var unmatchedArticles = 0;
    var usable = [];
    parsed.forEach(function (x) {
      if (x.date < start || x.date > end) return;
      var store = storeLookup[x.store_key];
      if (!store) { if (x.store) unmapped[x.store_key] = x.store; return; }
      var articleIndex = articleLookup[x.article_key];
      if (articleIndex === undefined) { unmatchedArticles += 1; return; }
      usable.push({
        articleIndex: articleIndex,
        store: store.store,
        store_key: store.store_key,
        cluster: store.cluster,
        quantity: x.quantity,
        date: x.date,
        month: monthKey(x.date)
      });
    });
    return {
      sales: usable,
      info: {
        invalidDates: invalidDates,
        invalidQty: invalidQty,
        unmappedStores: Object.keys(unmapped).length,
        unmappedStoreNames: Object.keys(unmapped).map(function (k) { return unmapped[k]; }),
        unmatchedArticles: unmatchedArticles,
        start: start,
        end: end
      }
    };
  }

  function percentileRanks(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var rankMap = {};
    var i = 0;
    while (i < sorted.length) {
      var j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[i]) j += 1;
      rankMap[sorted[i]] = ((i + 1 + j + 1) / 2) / sorted.length * 100;
      i = j + 1;
    }
    return values.map(function (v) { return rankMap[v] || 0; });
  }

  function calculateMetrics(assortment, sales, clusterMapping, months) {
    var result = assortment.map(function (x) { return Object.assign({}, x); });
    var storeCounts = { Alto: 0, Medio: 0, Basso: 0 };
    clusterMapping.forEach(function (x) { storeCounts[x.cluster] += 1; });

    CLUSTERS.forEach(function (cluster) {
      var stats = result.map(function () { return { pieces: 0, stores: {}, months: {} }; });
      sales.forEach(function (sale) {
        if (sale.cluster !== cluster) return;
        var s = stats[sale.articleIndex];
        s.pieces += sale.quantity;
        if (sale.quantity > 0) { s.stores[sale.store_key] = true; s.months[sale.month] = true; }
      });
      var nStores = Math.max(storeCounts[cluster], 1);
      result.forEach(function (row, idx) {
        var s = stats[idx];
        row["pieces_" + cluster] = s.pieces;
        row["active_stores_" + cluster] = Object.keys(s.stores).length;
        row["active_months_" + cluster] = Object.keys(s.months).length;
        row["monthly_per_store_" + cluster] = s.pieces / (months * nStores);
        row["penetration_" + cluster] = row["active_stores_" + cluster] / nStores;
        row["continuity_" + cluster] = row["active_months_" + cluster] / months;
        row["coverage_months_" + cluster] = row["monthly_per_store_" + cluster] > 0 ? row["G" + cluster] / row["monthly_per_store_" + cluster] : 0;
      });
      var ranks = percentileRanks(result.map(function (x) { return x["monthly_per_store_" + cluster]; }));
      result.forEach(function (row, idx) {
        row["velocity_pct_" + cluster] = ranks[idx];
        row["score_" + cluster] = ranks[idx] * 0.50 + row["penetration_" + cluster] * 100 * 0.25 + row["continuity_" + cluster] * 100 * 0.25;
      });
    });
    result.forEach(function (row) {
      row.score_generale = Math.max(row.score_Alto, row.score_Medio, row.score_Basso);
    });
    return { rows: result, storeCounts: storeCounts };
  }

  function median(values) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function roundQuantity(raw, pack, params) {
    var q = Math.max(params.minimumDisplay, Math.ceil(Math.max(raw, 0)));
    if (params.roundToPack && pack > 1) q = Math.ceil(q / pack) * pack;
    return q;
  }

  function actionFromValues(current, proposed) {
    if (current <= 0 && proposed > 0) return "Inserire";
    if (current > 0 && proposed <= 0) return "Eliminare";
    if (proposed > current) return "Aumentare";
    if (proposed < current) return "Ridurre";
    if (current <= 0) return "Confermare esclusione";
    return "Confermare";
  }

  function generateProposal(metrics, params) {
    var ratios = metrics.filter(function (r) { return r.GBasso > 0 && r.monthly_per_store_Medio > 0; })
      .map(function (r) { return r.monthly_per_store_Basso / r.monthly_per_store_Medio; })
      .filter(Number.isFinite);
    var ratio = median(ratios);
    if (!Number.isFinite(ratio) || ratio <= 0) ratio = 0.5;
    ratio = Math.min(1, Math.max(0.2, ratio));

    var rows = metrics.map(function (source) {
      var row = Object.assign({}, source);
      var absent = row.GBasso <= 0;
      var demand = row.monthly_per_store_Basso;
      if (absent) demand = row.monthly_per_store_Medio * ratio;
      if (absent && demand <= 0) demand = ((row.monthly_per_store_Alto + row.monthly_per_store_Medio) / 2) * 0.35;
      row.estimated_monthly_Basso = demand;
      var target = demand * params.targetMonths + params.safetyStock;
      var proposal;
      var reason;
      if (absent) {
        if (row.score_generale >= params.insertionScore && demand > 0) {
          proposal = roundQuantity(target, row.pack_size, params);
          reason = "Alta rotazione negli altri cluster; inserimento consigliato nel Basso.";
        } else {
          proposal = 0;
          reason = "Punteggio o domanda stimata insufficienti per l'inserimento.";
        }
      } else {
        var ideal = roundQuantity(target, row.pack_size, params);
        var maxUp = Math.max(row.GBasso, Math.ceil(row.GBasso * (1 + params.maxIncreasePct / 100)));
        var minDown = Math.max(params.minimumDisplay, Math.floor(row.GBasso * (1 - params.maxReductionPct / 100)));
        proposal = Math.min(Math.max(ideal, minDown), maxUp);
        if (proposal > row.GBasso) reason = "Copertura inferiore all'obiettivo sulla base delle vendite.";
        else if (proposal < row.GBasso) reason = "Copertura superiore all'obiettivo sulla base delle vendite.";
        else reason = "Assegnato coerente con la copertura obiettivo.";
      }
      row.GBasso_proposto = Math.max(0, Math.round(proposal));
      row.motivazione = reason;
      return row;
    });

    var currentSpace = rows.reduce(function (sum, r) { return sum + r.GBasso * r.space_unit; }, 0);
    var capacity = Number.isFinite(params.bassoCapacity) && params.bassoCapacity >= 0 ? params.bassoCapacity : currentSpace;
    if (params.enforceCapacity) {
      var total = rows.reduce(function (sum, r) { return sum + r.GBasso_proposto * r.space_unit; }, 0);
      var candidates = rows.slice().sort(function (a, b) {
        if (a.score_generale !== b.score_generale) return a.score_generale - b.score_generale;
        if (a.estimated_monthly_Basso !== b.estimated_monthly_Basso) return a.estimated_monthly_Basso - b.estimated_monthly_Basso;
        return b.space_unit - a.space_unit;
      });
      var guard = 0;
      while (total > capacity + 1e-9 && guard < 100000) {
        var changed = false;
        for (var i = 0; i < candidates.length && total > capacity + 1e-9; i += 1) {
          var c = candidates[i];
          if (c.GBasso_proposto <= 0) continue;
          var floor = c.score_generale < params.insertionScore ? 0 : params.minimumDisplay;
          if (c.GBasso <= 0 && c.GBasso_proposto > 0) floor = params.minimumDisplay;
          var step = params.roundToPack && c.pack_size > 1 ? c.pack_size : 1;
          var next = Math.max(floor, c.GBasso_proposto - step);
          if (next === c.GBasso_proposto) continue;
          total -= (c.GBasso_proposto - next) * c.space_unit;
          c.GBasso_proposto = next;
          c.motivazione += " Adeguato al limite di spazio del cluster Basso.";
          changed = true;
        }
        if (!changed) break;
        guard += 1;
      }
    }

    rows.forEach(function (row) {
      row.delta_GBasso = row.GBasso_proposto - row.GBasso;
      row.azione_Basso = actionFromValues(row.GBasso, row.GBasso_proposto);
      row.spazio_Basso_attuale = row.GBasso * row.space_unit;
      row.spazio_Basso_proposto = row.GBasso_proposto * row.space_unit;
      row.delta_spazio_Basso = row.spazio_Basso_proposto - row.spazio_Basso_attuale;
    });
    rows.basso_medio_ratio = ratio;
    rows.capacity = capacity;
    return rows;
  }

  function baseSummary(assortment) {
    return CLUSTERS.map(function (cluster) {
      var col = "G" + cluster;
      return {
        Cluster: cluster,
        "Referenze presenti": assortment.filter(function (r) { return r[col] > 0; }).length,
        "Referenze escluse": assortment.filter(function (r) { return r[col] <= 0; }).length,
        "Pezzi teorici": assortment.reduce(function (s, r) { return s + r[col]; }, 0),
        "Indice spazio teorico": assortment.reduce(function (s, r) { return s + r[col] * r.space_unit; }, 0)
      };
    });
  }

  function proposalSummary(rows) {
    var counts = {};
    rows.forEach(function (r) { counts[r.azione_Basso] = (counts[r.azione_Basso] || 0) + 1; });
    return {
      references: rows.length,
      insert: counts.Inserire || 0,
      increase: counts.Aumentare || 0,
      reduce: counts.Ridurre || 0,
      remove: counts.Eliminare || 0,
      current: rows.reduce(function (s, r) { return s + r.GBasso; }, 0),
      proposed: rows.reduce(function (s, r) { return s + r.GBasso_proposto; }, 0),
      currentSpace: rows.reduce(function (s, r) { return s + r.spazio_Basso_attuale; }, 0),
      proposedSpace: rows.reduce(function (s, r) { return s + r.spazio_Basso_proposto; }, 0)
    };
  }

  global.AssortmentEngine = {
    CLUSTERS: CLUSTERS,
    ASSORTMENT_ALIASES: ASSORTMENT_ALIASES,
    SALES_ALIASES: SALES_ALIASES,
    CLUSTER_ALIASES: CLUSTER_ALIASES,
    normalizeText: normalizeText,
    normalizeId: normalizeId,
    toNumber: toNumber,
    findColumn: findColumn,
    detectColumns: detectColumns,
    uniqueValues: uniqueValues,
    prepareAssortment: prepareAssortment,
    prepareClusterMapping: prepareClusterMapping,
    prepareSales: prepareSales,
    calculateMetrics: calculateMetrics,
    generateProposal: generateProposal,
    baseSummary: baseSummary,
    proposalSummary: proposalSummary,
    parseDate: parseDate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = global.AssortmentEngine;
}(typeof window !== "undefined" ? window : globalThis));
