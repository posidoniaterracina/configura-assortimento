const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/planogram-v3.js','utf8'),context);
const P=context.window.PlanogramEngineV3;

assert.strictEqual(P.parseCharacteristic('5W-40').label,'5W40');
assert.strictEqual(P.parseCharacteristic('15W40').primary,40);
assert.strictEqual(P.parseCharacteristic('80W90').secondary,80);
assert.strictEqual(P.parseCharacteristic('CATENA').label,'CATENA');
assert.strictEqual(P.parseCharacteristic('').recognized,false);

const rows=[
  {article_id:'1',description:'Motul A',supplier:'MOTUL',line:'PREMIUM',brand:'MOTUL',attribute_1:'Moto',characteristic:'10W50',GAlto:4,GMedio_proposto:2,GBasso_proposto:0,performance_rank:2},
  {article_id:'2',description:'Arexons A',supplier:'AREXONS',line:'AUTO',brand:'SELENIA',attribute_1:'Auto',characteristic:'5W40',GAlto:6,GMedio_proposto:4,GBasso_proposto:2,performance_rank:1},
  {article_id:'3',description:'Arexons B',supplier:'AREXONS',line:'MOTO',brand:'AREXONS',attribute_1:'Moto',characteristic:'15W40',GAlto:3,GMedio_proposto:1,GBasso_proposto:0,performance_rank:3},
  {article_id:'4',description:'Lubex A',supplier:'LUBEX',line:'AUTO',brand:'TOTAL',attribute_1:'Auto',characteristic:'5W30',GAlto:5,GMedio_proposto:3,GBasso_proposto:1,performance_rank:4}
];
const supplier=P.buildPlanogram(rows,{level:'alto',commercialField:'supplier',orientation:'commercial'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(supplier.groups.map(g=>g.title))),['AREXONS','LUBEX','MOTUL']);
const attribute=P.buildPlanogram(rows,{level:'medio',commercialField:'attribute_1',orientation:'commercial',fieldLabels:{attribute_1:'Tipologia'}});
assert.strictEqual(attribute.commercialLabel,'Tipologia');
assert.deepStrictEqual(JSON.parse(JSON.stringify(attribute.groups.map(g=>g.title))),['Auto','Moto']);
console.log('OK - planogramma v3 con attributi arricchiti');
