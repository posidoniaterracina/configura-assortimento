const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/planogram-v1.js','utf8'),context);
const P=context.window.PlanogramEngineV1;

assert.deepStrictEqual(JSON.parse(JSON.stringify(P.extractOilGrade('Olio motore 5W-40 4L'))),{
  recognized:true,label:'5W40',characteristic:'W40',winter:5,hot:40,sortKey:4005
});
assert.strictEqual(P.extractOilGrade('Lubrificante W45').characteristic,'W45');
assert.strictEqual(P.extractOilGrade('Olio SAE 50').characteristic,'W50');
assert.strictEqual(P.extractOilGrade('Olio trasmissione').recognized,false);

const rows=[
  {article_id:'1',description:'Motul 10W50',supplier:'MOTUL',GAlto:4,GMedio_proposto:2,GBasso_proposto:0,performance_rank:2},
  {article_id:'2',description:'Arexons 5W40',supplier:'AREXONS',GAlto:6,GMedio_proposto:4,GBasso_proposto:2,performance_rank:1},
  {article_id:'3',description:'Arexons W45',supplier:'AREXONS',GAlto:3,GMedio_proposto:0,GBasso_proposto:0,performance_rank:3},
  {article_id:'4',description:'Lubex 15W40',supplier:'LUBEX',GAlto:5,GMedio_proposto:3,GBasso_proposto:1,performance_rank:4}
];

const supplier=P.buildPlanogram(rows,{level:'alto',mode:'supplier'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(supplier.groups.map(g=>g.title))),['AREXONS','LUBEX','MOTUL']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(supplier.groups[0].rows.map(r=>r.article_id))),['2','3']);
assert.strictEqual(supplier.totalReferences,4);

const characteristic=P.buildPlanogram(rows,{level:'medio',mode:'characteristic'});
assert.deepStrictEqual(JSON.parse(JSON.stringify(characteristic.groups.map(g=>g.title))),['W40','W50']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(characteristic.groups[0].rows.map(r=>r.supplier))),['AREXONS','LUBEX']);
assert.strictEqual(characteristic.totalReferences,3);
console.log('OK - planogramma v1');
