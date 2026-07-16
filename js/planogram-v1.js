(function (global) {
  "use strict";

  function normalizeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function extractOilGrade(description) {
    var text = normalizeText(description).replace(/[,;]/g, " ");
    var match = text.match(/(?:^|[^A-Z0-9])(\d{1,2})\s*W\s*[-/]?\s*(\d{2})(?:[^0-9]|$)/);
    if (match) {
      var winter = Number(match[1]);
      var hot = Number(match[2]);
      return {
        recognized: true,
        label: winter + "W" + hot,
        characteristic: "W" + hot,
        winter: winter,
        hot: hot,
        sortKey: hot * 100 + winter
      };
    }

    match = text.match(/(?:^|[^A-Z0-9])W\s*[-/]?\s*(\d{2})(?:[^0-9]|$)/);
    if (match) {
      var simpleHot = Number(match[1]);
      return {
        recognized: true,
        label: "W" + simpleHot,
        characteristic: "W" + simpleHot,
        winter: 99,
        hot: simpleHot,
        sortKey: simpleHot * 100 + 99
      };
    }

    match = text.match(/(?:^|[^A-Z0-9])SAE\s*[-/]?\s*(\d{2})(?:[^0-9]|$)/);
    if (match) {
      var saeHot = Number(match[1]);
      return {
        recognized: true,
        label: "SAE " + saeHot,
        characteristic: "W" + saeHot,
        winter: 98,
        hot: saeHot,
        sortKey: saeHot * 100 + 98
      };
    }

    return {
      recognized: false,
      label: "Non riconosciuta",
      characteristic: "NON RICONOSCIUTA",
      winter: 999,
      hot: 999,
      sortKey: Number.MAX_SAFE_INTEGER
    };
  }

  function quantityForLevel(row, level) {
    if (level === "medio") return Math.max(0, Number(row.GMedio_proposto) || 0);
    if (level === "basso") return Math.max(0, Number(row.GBasso_proposto) || 0);
    return Math.max(0, Number(row.GAlto) || 0);
  }

  function prepareRows(rows, level) {
    return (rows || []).map(function (source) {
      var row = Object.assign({}, source);
      row.layout_quantity = quantityForLevel(row, level);
      row.layout_grade = extractOilGrade(row.description);
      return row;
    }).filter(function (row) {
      return row.layout_quantity > 0;
    });
  }

  function byDescription(a, b) {
    return String(a.description || "").localeCompare(String(b.description || ""), "it", { sensitivity: "base" });
  }

  function byGrade(a, b) {
    if (a.layout_grade.sortKey !== b.layout_grade.sortKey) return a.layout_grade.sortKey - b.layout_grade.sortKey;
    if (a.layout_grade.label !== b.layout_grade.label) return a.layout_grade.label.localeCompare(b.layout_grade.label, "it", { sensitivity: "base" });
    if ((a.performance_rank || 0) !== (b.performance_rank || 0)) return (a.performance_rank || 999999) - (b.performance_rank || 999999);
    return byDescription(a, b);
  }

  function groupRows(rows, mode) {
    var groups = {};
    rows.forEach(function (row) {
      var key = mode === "characteristic" ? row.layout_grade.characteristic : (row.supplier || "SENZA FORNITORE");
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    return Object.keys(groups).map(function (key) {
      var groupRowsList = groups[key];
      if (mode === "characteristic") {
        groupRowsList.sort(function (a, b) {
          var supplierOrder = String(a.supplier || "").localeCompare(String(b.supplier || ""), "it", { sensitivity: "base" });
          if (supplierOrder) return supplierOrder;
          return byGrade(a, b);
        });
      } else {
        groupRowsList.sort(byGrade);
      }

      var first = groupRowsList[0];
      return {
        key: key,
        title: mode === "characteristic" ? (first.layout_grade.recognized ? first.layout_grade.characteristic : "Gradazione non riconosciuta") : key,
        sortValue: mode === "characteristic" ? first.layout_grade.sortKey : key,
        rows: groupRowsList,
        totalQuantity: groupRowsList.reduce(function (sum, row) { return sum + row.layout_quantity; }, 0)
      };
    }).sort(function (a, b) {
      if (mode === "characteristic") {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.title.localeCompare(b.title, "it", { sensitivity: "base" });
      }
      return a.title.localeCompare(b.title, "it", { sensitivity: "base" });
    });
  }

  function buildPlanogram(rows, options) {
    options = options || {};
    var level = options.level === "medio" || options.level === "basso" ? options.level : "alto";
    var mode = options.mode === "characteristic" ? "characteristic" : "supplier";
    var prepared = prepareRows(rows, level);
    return {
      level: level,
      mode: mode,
      groups: groupRows(prepared, mode),
      totalReferences: prepared.length,
      totalQuantity: prepared.reduce(function (sum, row) { return sum + row.layout_quantity; }, 0),
      unrecognizedCount: prepared.filter(function (row) { return !row.layout_grade.recognized; }).length
    };
  }

  global.PlanogramEngineV1 = {
    extractOilGrade: extractOilGrade,
    quantityForLevel: quantityForLevel,
    prepareRows: prepareRows,
    buildPlanogram: buildPlanogram
  };
})(typeof window !== "undefined" ? window : this);
