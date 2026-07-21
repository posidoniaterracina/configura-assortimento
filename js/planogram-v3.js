(function (global) {
  "use strict";

  function normalizeText(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function parseCharacteristic(value) {
    var source = normalizeText(value);
    var compact = source.replace(/\s+/g, "");
    var match;

    if (!source) {
      return { recognized: false, label: "SENZA CARATTERISTICA", key: "SENZA CARATTERISTICA", sortType: 99, primary: 9999, secondary: 9999 };
    }

    match = compact.match(/^(\d{1,2})W[-\/]?(\d{2,3})$/);
    if (match) {
      return {
        recognized: true,
        label: Number(match[1]) + "W" + Number(match[2]),
        key: Number(match[1]) + "W" + Number(match[2]),
        sortType: 0,
        primary: Number(match[2]),
        secondary: Number(match[1])
      };
    }

    match = compact.match(/^W[-\/]?(\d{2,3})$/);
    if (match) {
      return { recognized: true, label: "W" + Number(match[1]), key: "W" + Number(match[1]), sortType: 0, primary: Number(match[1]), secondary: 98 };
    }

    match = compact.match(/^SAE[-\/]?(\d{1,3})$/);
    if (match) {
      return { recognized: true, label: "SAE" + Number(match[1]), key: "SAE" + Number(match[1]), sortType: 0, primary: Number(match[1]), secondary: 99 };
    }

    match = compact.match(/^(\d+)T$/);
    if (match) {
      return { recognized: true, label: Number(match[1]) + "T", key: Number(match[1]) + "T", sortType: 1, primary: Number(match[1]), secondary: 0 };
    }

    match = compact.match(/^DOT[-\/]?(\d+(?:[.,]\d+)?)$/);
    if (match) {
      var dotValue = Number(match[1].replace(",", "."));
      return { recognized: true, label: "DOT" + String(dotValue), key: "DOT" + String(dotValue), sortType: 2, primary: dotValue, secondary: 0 };
    }

    return { recognized: true, label: source, key: source, sortType: 3, primary: 0, secondary: 0 };
  }

  function compareCharacteristic(a, b) {
    if (a.sortType !== b.sortType) return a.sortType - b.sortType;
    if (a.primary !== b.primary) return a.primary - b.primary;
    if (a.secondary !== b.secondary) return a.secondary - b.secondary;
    return a.label.localeCompare(b.label, "it", { sensitivity: "base", numeric: true });
  }

  function commercialConfig(field, fieldLabels) {
    fieldLabels = fieldLabels || {};
    if (field === "line") return { key: "line", label: "Linea", empty: "SENZA LINEA" };
    if (field === "brand") return { key: "brand", label: "Brand", empty: "SENZA BRAND" };
    if (field === "attribute_1" || field === "attribute_2" || field === "attribute_3") {
      var label = fieldLabels[field] || ("Attributo " + field.slice(-1));
      return { key: field, label: label, empty: "SENZA " + label.toUpperCase() };
    }
    return { key: "supplier", label: "Fornitore", empty: "SENZA FORNITORE" };
  }

  function quantityForLevel(row, level) {
    if (level === "medio") return Math.max(0, Number(row.GMedio_proposto) || 0);
    if (level === "basso") return Math.max(0, Number(row.GBasso_proposto) || 0);
    return Math.max(0, Number(row.GAlto) || 0);
  }

  function prepareRows(rows, level, commercialField, fieldLabels) {
    var config = commercialConfig(commercialField, fieldLabels);
    return (rows || []).map(function (source) {
      var row = Object.assign({}, source);
      var commercialRaw = String(source[config.key] || "").trim();
      row.layout_quantity = quantityForLevel(row, level);
      row.layout_characteristic = parseCharacteristic(source.characteristic);
      row.layout_commercial = {
        field: config.key,
        label: config.label,
        value: commercialRaw || config.empty,
        key: normalizeText(commercialRaw || config.empty),
        recognized: Boolean(commercialRaw)
      };
      return row;
    }).filter(function (row) {
      return row.layout_quantity > 0;
    });
  }

  function byDescription(a, b) {
    return String(a.description || "").localeCompare(String(b.description || ""), "it", { sensitivity: "base", numeric: true });
  }

  function byPerformanceThenDescription(a, b) {
    var rankA = Number(a.performance_rank) || 999999;
    var rankB = Number(b.performance_rank) || 999999;
    if (rankA !== rankB) return rankA - rankB;
    return byDescription(a, b);
  }

  function byCharacteristic(a, b) {
    var order = compareCharacteristic(a.layout_characteristic, b.layout_characteristic);
    if (order) return order;
    return byPerformanceThenDescription(a, b);
  }

  function byCommercial(a, b) {
    var order = a.layout_commercial.value.localeCompare(b.layout_commercial.value, "it", { sensitivity: "base", numeric: true });
    if (order) return order;
    return byPerformanceThenDescription(a, b);
  }

  function groupRows(rows, orientation) {
    var groups = {};
    rows.forEach(function (row) {
      var characteristicShelf = orientation === "characteristic";
      var key = characteristicShelf ? row.layout_characteristic.key : row.layout_commercial.key;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    return Object.keys(groups).map(function (key) {
      var groupRowsList = groups[key];
      var characteristicShelf = orientation === "characteristic";
      groupRowsList.sort(characteristicShelf ? byCommercial : byCharacteristic);
      var first = groupRowsList[0];
      return {
        key: key,
        title: characteristicShelf ? first.layout_characteristic.label : first.layout_commercial.value,
        characteristicSort: characteristicShelf ? first.layout_characteristic : null,
        rows: groupRowsList,
        totalQuantity: groupRowsList.reduce(function (sum, row) { return sum + row.layout_quantity; }, 0)
      };
    }).sort(function (a, b) {
      if (orientation === "characteristic") {
        var characteristicOrder = compareCharacteristic(a.characteristicSort, b.characteristicSort);
        if (characteristicOrder) return characteristicOrder;
      }
      return a.title.localeCompare(b.title, "it", { sensitivity: "base", numeric: true });
    });
  }

  function buildPlanogram(rows, options) {
    options = options || {};
    var level = options.level === "medio" || options.level === "basso" ? options.level : "alto";
    var allowedFields = ["supplier", "line", "brand", "attribute_1", "attribute_2", "attribute_3"];
    var commercialField = allowedFields.indexOf(options.commercialField) >= 0 ? options.commercialField : "supplier";
    var orientation = options.orientation === "characteristic" ? "characteristic" : "commercial";
    var config = commercialConfig(commercialField, options.fieldLabels);
    var prepared = prepareRows(rows, level, commercialField, options.fieldLabels);
    return {
      level: level,
      commercialField: commercialField,
      commercialLabel: config.label,
      orientation: orientation,
      groups: groupRows(prepared, orientation),
      totalReferences: prepared.length,
      totalQuantity: prepared.reduce(function (sum, row) { return sum + row.layout_quantity; }, 0),
      missingCharacteristicCount: prepared.filter(function (row) { return !row.layout_characteristic.recognized; }).length,
      missingCommercialCount: prepared.filter(function (row) { return !row.layout_commercial.recognized; }).length
    };
  }

  global.PlanogramEngineV3 = {
    parseCharacteristic: parseCharacteristic,
    compareCharacteristic: compareCharacteristic,
    commercialConfig: commercialConfig,
    quantityForLevel: quantityForLevel,
    prepareRows: prepareRows,
    buildPlanogram: buildPlanogram
  };
})(typeof window !== "undefined" ? window : this);
