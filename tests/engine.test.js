const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname + '/../js/engine.js', 'utf8'), context);
const E = context.window.AssortmentEngine;

const assortmentRows = JSON.parse(fs.readFileSync('/tmp/assortment.json', 'utf8'));
const salesRows = JSON.parse(fs.readFileSync('/tmp/sales.json', 'utf8'));
const clusterRows = JSON.parse(fs.readFileSync('/tmp/clusters.json', 'utf8'));

const assortment = E.prepareAssortment(assortmentRows);
assert.strictEqual(assortment.length, 66, 'Il filtro Breve=N deve produrre 66 referenze');

const scope = E.detectScope(assortment);
assert.strictEqual(scope.multiple, false, 'Il file deve contenere una sola sottofamiglia');
assert.strictEqual(scope.famiglia, 'Olio Lubrificante');

const mapping = E.prepareClusterMapping(clusterRows, scope);
assert.strictEqual(mapping.length, 20, 'Devono essere mappati 20 punti vendita');
const counts = mapping.reduce((acc, row) => {
  acc[row.cluster] = (acc[row.cluster] || 0) + 1;
  return acc;
}, {});
assert.deepStrictEqual(JSON.parse(JSON.stringify(counts)), { Alto: 4, Medio: 11, Basso: 5 });

const all = E.calculatePerformance(assortment, salesRows, mapping, ['Alto', 'Medio', 'Basso']);
const high = E.calculatePerformance(assortment, salesRows, mapping, ['Alto']);
assert.strictEqual(all.metrics.selectedStoreCount, 20);
assert.strictEqual(high.metrics.selectedStoreCount, 4);
assert.ok(all.metrics.totalSales > high.metrics.totalSales, 'La selezione cluster deve cambiare le vendite considerate');

const meters = { alto: 10, medio: 6, basso: 3 };
const highTotal = assortment.reduce((sum, row) => sum + row.GAlto, 0);

const quantityOnly = E.buildProposals(all.rows, meters, {
  cutMode: 'manual', manualReferenceWeight: 0, stockDaysMedio: 30, stockDaysBasso: 30
}, all.metrics);
const referencesOnly = E.buildProposals(all.rows, meters, {
  cutMode: 'manual', manualReferenceWeight: 100, stockDaysMedio: 30, stockDaysBasso: 30
}, all.metrics);
const automatic = E.buildProposals(all.rows, meters, {
  cutMode: 'auto', manualReferenceWeight: 50, stockDaysMedio: 30, stockDaysBasso: 30
}, all.metrics);

assert.strictEqual(quantityOnly.medium.targetReferences, 66, 'Con peso referenze 0% il Medio deve tentare di mantenere tutte le referenze');
assert.strictEqual(referencesOnly.medium.targetReferences, Math.round(66 * 0.6), 'Con peso referenze 100% il Medio deve mantenere il top 60%');
assert.notStrictEqual(quantityOnly.medium.targetReferences, referencesOnly.medium.targetReferences, 'Il bilanciamento deve cambiare il numero di referenze');
assert.strictEqual(quantityOnly.medium.quantityCapacity, Math.round(highTotal * 0.6));
assert.strictEqual(quantityOnly.low.quantityCapacity, Math.round(highTotal * 0.3));
assert.ok(automatic.weights.referenceWeight >= 0.2 && automatic.weights.referenceWeight <= 0.9);

for (const row of automatic.rows) {
  assert.ok(row.GBasso_proposto <= row.GMedio_proposto, 'Basso non può superare Medio');
  assert.ok(row.GMedio_proposto <= row.GAlto, 'Medio non può superare Alto');
  assert.ok(E.quantityLadder(row.pack_size, row.GAlto).includes(row.GMedio_proposto), 'GMedio deve rispettare Art_Pz');
  assert.ok(E.quantityLadder(row.pack_size, row.GAlto).includes(row.GBasso_proposto), 'GBasso deve rispettare Art_Pz');
}

assert.deepStrictEqual(Array.from(E.normalizeClusterSelection(['basso', 'Alto', 'foo'])), ['Alto', 'Basso']);
console.log('OK - test motore superati');
