const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/engine-v3.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/enrichment-v1.js','utf8'),context);
const E=context.window.AssortmentEngineV3,A=context.window.AssortmentEnrichmentV1;

const rules=A.parseRules('Pennello = pennello; pennelli\nPennellessa = pennellessa; plafoncino\nRullo = rullo; rulli');
assert.strictEqual(rules.length,3);
assert.strictEqual(A.classify('PENNELLO PIATTO 40 MM',rules).value,'Pennello');
assert.strictEqual(A.classify('PLAFONCINO PROFESSIONALE',rules).value,'Pennellessa');
assert.strictEqual(A.classify('RULLO MICROFIBRA',rules).value,'Rullo');
assert.strictEqual(A.classify('VASCHETTA',rules).value,'NON CLASSIFICATO');

const base=[
  {article_id:'1',sku:'A1',description:'Pennello piatto',pack_size:2,GAlto:8,GMedio:4,GBasso:2,supplier:'F1'},
  {article_id:'2',sku:'A2',description:'Rullo microfibra',pack_size:2,GAlto:8,GMedio:4,GBasso:2,supplier:'F1'},
  {article_id:'3',sku:'A3',description:'Pennellessa',pack_size:2,GAlto:8,GMedio:4,GBasso:2,supplier:'F2'}
];
const raw=[
  {Id:'1',SkuCodice:'A1',Pvp:12.2,PrzUnipam:6},
  {Id:'2',SkuCodice:'A2',Pvp:11,PrzUnipam:8,IVA:10},
  {Id:'3',SkuCodice:'A3',Pvp:24.4,PrzUnipam:10}
];
const configs=[{enabled:true,name:'Tipologia',rules,representationMode:'all',representationValue:100},{enabled:false},{enabled:false}];
const enriched=A.enrichAssortment(base,raw,{salePriceColumn:'Pvp',costColumn:'PrzUnipam',vatColumn:'',defaultVatRate:22,attributeConfigs:configs});
assert.strictEqual(enriched[0].attribute_1,'Pennello');
assert.ok(Math.abs(enriched[0].sale_price_net-10)<1e-9);
assert.strictEqual(enriched[0].vat_rate,22);
assert.ok(Math.abs(enriched[0].margin_pct-40)<1e-9);
const enrichedWithVatColumn=A.enrichAssortment(base,raw,{salePriceColumn:'Pvp',costColumn:'PrzUnipam',vatColumn:'IVA',defaultVatRate:22,attributeConfigs:configs});
assert.strictEqual(enrichedWithVatColumn[1].vat_rate,10);
assert.ok(Math.abs(enrichedWithVatColumn[1].sale_price_net-10)<1e-9);
assert.strictEqual(A.normalizeVatRate('22%',0),22);
assert.strictEqual(A.normalizeVatRate(0.1,22),10);

enriched[0].sales_selected=20;enriched[0].sales_per_store_day=2;
enriched[1].sales_selected=30;enriched[1].sales_per_store_day=3;
enriched[2].sales_selected=10;enriched[2].sales_per_store_day=1;
const ranked=A.applyPriorityRanking(enriched,configs);
assert.strictEqual(ranked.analyses.length,1);
assert.strictEqual(Object.keys(ranked.analyses[0].selected).length,3);
assert.ok(ranked.rows.every(row=>Array.isArray(row.attribute_priority_reasons)));

const results=E.buildProposals(ranked.rows,{alto:10,medio:5,basso:2},{cutMode:'manual',manualReferenceWeight:100,stockDaysMedio:30,stockDaysBasso:30},{gini:0.4,cv:0.5});
const represented=A.enforceRepresentation(E,results,ranked.analyses);
for(const value of ['Pennello','Pennellessa','Rullo']){
  assert.ok(represented.results.rows.some(row=>row.attribute_1===value&&row.GMedio_proposto>0));
}
assert.ok(represented.results.rows.every(row=>row.GBasso_proposto<=row.GMedio_proposto));
console.log('OK - arricchimento, margine e rappresentativita');
