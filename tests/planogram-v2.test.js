const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/planogram-v2.js','utf8'),context);
const P=context.window.PlanogramEngineV2;

assert.strictEqual(P.parseCharacteristic('5W-40').label,'5W40');
assert.strictEqual(P.parseCharacteristic('15W40').primary,40);
assert.strictEqual(P.parseCharacteristic('80W90').secondary,80);
assert.strictEqual(P.parseCharacteristic('CATENA').label,'CATENA');
assert.strictEqual(P.parseCharacteristic('').recognized,false);

const rows=[
  {article_id:'1',description:'Motul A',supplier:'MOTUL',line:'PREMIUM',brand:'MOTUL',characteristic:'10W50',GAlto:4,GMedio_proposto:2,GBasso_proposto:0,performance_rank:2},
  {article_id:'2',description:'Arexons A',supplier:'AREXONS',line:'AUTO',brand:'SELENIA',characteristic:'5W40',GAlto:6,GMedio_proposto:4,GBasso_proposto:2,performance_rank:1},
  {article_id:'3',description:'Arexons B',supplier:'AREXONS',line:'MOTO',brand:'AREXONS',characteristic:'15W40',GAlto:3,GMedio_proposto:1,GBasso_proposto:0,performance_rank:3},
  {article_id:'4',description:'Lubex A',supplier:'LUBEX',line:'AUTO',brand:'TOTAL',characteristic:'5W30',GAlto:5,GMedio_proposto:3,GBasso_proposto:1,performance_rank:4}
];

const supplier=P.buildPlanogram(rows,{level:'alto',commercialField:'supplier',orientation:'commercial'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(supplier.groups.map(g=>g.title))),['AREXONS','LUBEX','MOTUL']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(supplier.groups[0].rows.map(r=>r.article_id))),['2','3']);
assert.strictEqual(supplier.totalReferences,4);

const characteristicBrand=P.buildPlanogram(rows,{level:'medio',commercialField:'brand',orientation:'characteristic'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(characteristicBrand.groups.map(g=>g.title))),['5W30','5W40','15W40','10W50']);
assert.strictEqual(characteristicBrand.groups[1].rows[0].layout_commercial.value,'SELENIA');
assert.strictEqual(characteristicBrand.totalReferences,4);

const line=P.buildPlanogram(rows,{level:'alto',commercialField:'line',orientation:'commercial'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(line.groups.map(g=>g.title))),['AUTO','MOTO','PREMIUM']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(line.groups[0].rows.map(r=>r.layout_characteristic.label))),['5W30','5W40']);
console.log('OK - planogramma v2 Caratteristica + Fornitore/Linea/Brand');
