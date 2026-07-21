(function (global) {
  "use strict";

  function normalizeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function toNumber(value, fallback) {
    if (fallback === undefined) fallback = 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    var source = String(value === null || value === undefined ? "" : value).trim();
    if (!source) return fallback;
    source = source.replace(/\s/g, "");
    if (source.indexOf(",") >= 0 && source.indexOf(".") >= 0) source = source.replace(/\./g, "").replace(",", ".");
    else source = source.replace(",", ".");
    var parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseRules(text) {
    return String(text || "").split(/\r?\n/).map(function (line, index) {
      var clean = line.trim();
      if (!clean || clean.charAt(0) === "#") return null;
      var separator = clean.indexOf("=");
      if (separator < 0) separator = clean.indexOf(":");
      var cluster = separator >= 0 ? clean.slice(0, separator).trim() : clean;
      var words = separator >= 0 ? clean.slice(separator + 1) : clean;
      var alternatives = words.split(/[;,|]/).map(function (word) { return normalizeText(word); }).filter(Boolean);
      if (!cluster || !alternatives.length) return null;
      return { cluster: cluster, alternatives: alternatives, priority: index + 1 };
    }).filter(Boolean);
  }

  function containsKeyword(normalizedDescription, normalizedKeyword) {
    if (!normalizedKeyword) return false;
    var padded = " " + normalizedDescription + " ";
    return padded.indexOf(" " + normalizedKeyword + " ") >= 0 || normalizedDescription.indexOf(normalizedKeyword) >= 0;
  }

  function classify(description, rules) {
    var normalized = normalizeText(description);
    var matches = [];
    (rules || []).forEach(function (rule) {
      var hit = rule.alternatives.some(function (keyword) { return containsKeyword(normalized, keyword); });
      if (hit) matches.push(rule);
    });
    if (!matches.length) return { value: "NON CLASSIFICATO", matched: false, conflict: false, rule: "" };
    return { value: matches[0].cluster, matched: true, conflict: matches.length > 1, rule: matches[0].cluster, allMatches: matches.map(function (item) { return item.cluster; }) };
  }

  function lookupRawRows(rawRows) {
    var lookup = {};
    (rawRows || []).forEach(function (row) {
      [row.Id, row.SkuCodice].forEach(function (value) {
        var key = String(value === null || value === undefined ? "" : value).trim().replace(/\.0+$/, "");
        if (key && !lookup[key]) lookup[key] = row;
      });
    });
    return lookup;
  }

  function normalizeVatRate(value, fallbackRate) {
    var fallback = Number.isFinite(Number(fallbackRate)) ? Number(fallbackRate) : 22;
    var source = String(value === null || value === undefined ? "" : value).trim().replace("%", "");
    if (!source) return Math.max(0, fallback);
    var parsed = toNumber(source, fallback);
    if (parsed > 0 && parsed <= 1) parsed *= 100;
    return Math.max(0, parsed);
  }

  function enrichAssortment(rows, rawRows, options) {
    options = options || {};
    var lookup = lookupRawRows(rawRows);
    var attributeConfigs = options.attributeConfigs || [];
    var saleColumn = options.salePriceColumn || "";
    var costColumn = options.costColumn || "";
    var vatColumn = options.vatColumn || "";
    var defaultVatRate = normalizeVatRate(options.defaultVatRate, 22);
    return (rows || []).map(function (source) {
      var row = Object.assign({}, source);
      var raw = lookup[row.article_id] || lookup[row.sku] || {};
      row.sale_price_gross = Math.max(0, toNumber(raw[saleColumn], 0));
      row.vat_rate = normalizeVatRate(vatColumn ? raw[vatColumn] : "", defaultVatRate);
      row.sale_price_net = row.sale_price_gross > 0 ? row.sale_price_gross / (1 + row.vat_rate / 100) : 0;
      row.sale_price = row.sale_price_net;
      row.purchase_cost = Math.max(0, toNumber(raw[costColumn], 0));
      row.margin_unit = row.sale_price_net - row.purchase_cost;
      row.margin_pct = row.sale_price_net > 0 ? (row.margin_unit / row.sale_price_net) * 100 : null;
      row.margin_source_sale = saleColumn;
      row.margin_source_cost = costColumn;
      row.margin_source_vat = vatColumn;
      row.attribute_conflicts = [];
      for (var i = 0; i < 3; i += 1) {
        var config = attributeConfigs[i] || {};
        var key = "attribute_" + (i + 1);
        var result = config.enabled ? classify(row.description, config.rules || []) : { value: "", matched: false, conflict: false, rule: "" };
        row[key] = result.value;
        row[key + "_name"] = config.name || ("Attributo " + (i + 1));
        row[key + "_matched"] = result.matched;
        row[key + "_rule"] = result.rule;
        if (result.conflict) row.attribute_conflicts.push((config.name || key) + ": " + result.allMatches.join(" / "));
      }
      return row;
    });
  }

  function aggregateClusters(rows, config, index) {
    var key = "attribute_" + (index + 1);
    var groups = {};
    (rows || []).forEach(function (row) {
      var value = String(row[key] || "NON CLASSIFICATO").trim() || "NON CLASSIFICATO";
      if (!groups[value]) groups[value] = { value: value, sales: 0, marginTotal: 0, references: 0 };
      groups[value].sales += Math.max(0, Number(row.sales_selected) || 0);
      groups[value].marginTotal += (Number(row.margin_unit) || 0) * Math.max(0, Number(row.sales_selected) || 0);
      groups[value].references += 1;
    });
    var list = Object.keys(groups).map(function (value) { return groups[value]; });
    var mode = config.representationMode || "all";
    var metric = mode.indexOf("margin") >= 0 ? "marginTotal" : "sales";
    list.sort(function (a, b) {
      if (b[metric] !== a[metric]) return b[metric] - a[metric];
      return a.value.localeCompare(b.value, "it", { sensitivity: "base", numeric: true });
    });
    var eligible = list.filter(function (item) { return item.value !== "NON CLASSIFICATO"; });
    if (!eligible.length) eligible = list.slice();
    var requested = Math.max(1, Number(config.representationValue) || 100);
    var take;
    if (mode === "all") take = eligible.length;
    else if (mode.indexOf("_n") >= 0) take = Math.min(eligible.length, Math.round(requested));
    else take = Math.min(eligible.length, Math.max(1, Math.ceil(eligible.length * Math.min(100, requested) / 100)));
    var selected = {};
    eligible.slice(0, take).forEach(function (item) { selected[item.value] = true; });
    return { key: key, name: config.name || ("Attributo " + (index + 1)), mode: mode, requested: requested, selected: selected, clusters: list };
  }

  function applyPriorityRanking(rows, attributeConfigs) {
    var configs = attributeConfigs || [];
    var analyses = [];
    configs.forEach(function (config, index) {
      if (config && config.enabled) analyses.push(aggregateClusters(rows, config, index));
    });
    rows.forEach(function (row) {
      row.margin_total = (Number(row.margin_unit) || 0) * Math.max(0, Number(row.sales_selected) || 0);
      row.attribute_priority_score = 0;
      row.attribute_priority_reasons = [];
      analyses.forEach(function (analysis, analysisIndex) {
        var value = String(row[analysis.key] || "NON CLASSIFICATO");
        if (analysis.selected[value]) {
          var points = Math.max(1, analyses.length - analysisIndex) * 1000;
          row.attribute_priority_score += points;
          row.attribute_priority_reasons.push(analysis.name + ": " + value);
        }
      });
    });
    rows.sort(function (a, b) {
      if (b.attribute_priority_score !== a.attribute_priority_score) return b.attribute_priority_score - a.attribute_priority_score;
      if (b.sales_per_store_day !== a.sales_per_store_day) return b.sales_per_store_day - a.sales_per_store_day;
      if (b.margin_total !== a.margin_total) return b.margin_total - a.margin_total;
      if (b.sales_selected !== a.sales_selected) return b.sales_selected - a.sales_selected;
      return String(a.description || "").localeCompare(String(b.description || ""), "it", { sensitivity: "base", numeric: true });
    });
    rows.forEach(function (row, index) {
      row.performance_rank = index + 1;
      row.performance_pct = rows.length ? ((rows.length - index) / rows.length) * 100 : 0;
    });
    return { rows: rows, analyses: analyses };
  }

  function minimumPositiveQuantity(engine, row, maximum) {
    var ladder = engine.quantityLadder(row.pack_size, maximum === undefined ? row.GAlto : maximum).filter(function (value) { return value > 0; });
    return ladder.length ? ladder[0] : 0;
  }

  function proposedField(level) { return level === "basso" ? "GBasso_proposto" : "GMedio_proposto"; }

  function ensureRepresentationForLevel(engine, rows, proposal, analyses, level, maximumField) {
    var field = proposedField(level);
    var warnings = [];
    analyses.forEach(function (analysis) {
      Object.keys(analysis.selected).forEach(function (clusterValue) {
        var matching = rows.filter(function (row) { return String(row[analysis.key] || "NON CLASSIFICATO") === clusterValue; });
        if (!matching.length) return;
        var alreadyPresent = matching.some(function (row) { return (Number(row[field]) || 0) > 0; });
        if (alreadyPresent) return;
        var candidate = matching[0];
        var maximum = maximumField ? Math.max(0, Number(candidate[maximumField]) || 0) : Math.max(0, Number(candidate.GAlto) || 0);
        var minimum = minimumPositiveQuantity(engine, candidate, maximum);
        if (minimum <= 0) {
          warnings.push(analysis.name + " / " + clusterValue + " non inseribile nel livello " + level + ".");
          return;
        }
        candidate[field] = minimum;
        proposal.values[candidate.article_id] = minimum;
        candidate["forced_" + level] = true;
        candidate["forced_" + level + "_reason"] = analysis.name + ": " + clusterValue;
      });
    });
    proposal.proposedUnits = rows.reduce(function (sum, row) { return sum + (Number(row[field]) || 0); }, 0);
    proposal.proposedReferences = rows.filter(function (row) { return (Number(row[field]) || 0) > 0; }).length;
    proposal.utilization = proposal.quantityCapacity > 0 ? proposal.proposedUnits / proposal.quantityCapacity : 0;
    var dailyDemand = rows.reduce(function (sum, row) { return sum + ((Number(row[field]) || 0) > 0 ? (Number(row.sales_per_store_day) || 0) : 0); }, 0);
    proposal.achievedDays = dailyDemand > 0 ? proposal.proposedUnits / dailyDemand : null;
    if (proposal.proposedUnits > proposal.quantityCapacity) warnings.push("La rappresentatività obbligatoria porta il livello " + level + " oltre la capacità di " + (proposal.proposedUnits - proposal.quantityCapacity) + " pezzi.");
    return warnings;
  }

  function enforceRepresentation(engine, results, analyses) {
    if (!results || !analyses || !analyses.length) return { results: results, warnings: [] };
    var warnings = [];
    warnings = warnings.concat(ensureRepresentationForLevel(engine, results.rows, results.medium, analyses, "medio", "GAlto"));
    results.rows.forEach(function (row) {
      if ((Number(row.GBasso_proposto) || 0) > (Number(row.GMedio_proposto) || 0)) {
        row.GBasso_proposto = row.GMedio_proposto;
        results.low.values[row.article_id] = row.GBasso_proposto;
      }
    });
    warnings = warnings.concat(ensureRepresentationForLevel(engine, results.rows, results.low, analyses, "basso", "GMedio_proposto"));
    results.rows.forEach(function (row) {
      row.azione_Medio = actionLabel(row.GMedio, row.GMedio_proposto);
      row.azione_Basso = actionLabel(row.GBasso, row.GBasso_proposto);
      row.giorni_Medio_raggiunti = row.sales_per_store_day > 0 ? row.GMedio_proposto / row.sales_per_store_day : null;
      row.giorni_Basso_raggiunti = row.sales_per_store_day > 0 ? row.GBasso_proposto / row.sales_per_store_day : null;
    });
    return { results: results, warnings: warnings };
  }

  function actionLabel(current, proposed) {
    current = Number(current) || 0; proposed = Number(proposed) || 0;
    if (current <= 0 && proposed > 0) return "Inserire";
    if (current > 0 && proposed <= 0) return "Eliminare";
    if (proposed < current) return "Ridurre";
    if (proposed > current) return "Aumentare";
    return proposed > 0 ? "Confermare" : "Escludere";
  }

  global.AssortmentEnrichmentV1 = {
    normalizeText: normalizeText,
    parseRules: parseRules,
    classify: classify,
    enrichAssortment: enrichAssortment,
    applyPriorityRanking: applyPriorityRanking,
    aggregateClusters: aggregateClusters,
    enforceRepresentation: enforceRepresentation,
    toNumber: toNumber,
    normalizeVatRate: normalizeVatRate
  };
})(typeof window !== "undefined" ? window : this);
