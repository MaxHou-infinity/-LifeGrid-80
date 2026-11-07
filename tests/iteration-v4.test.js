'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../js/utils');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../js/export');
const activity=partial=>({id:'a',name:'阅读',timeAmount:'2',frequency:'daily',durationYears:50,group:'explore',color:M.COLORS[0],...partial});
const report=acts=>M.snapshotFromDraft({...M.emptyDraft(),settings:{S:30,L:80},activities:acts});
function freshExport(){const context={LifeModel:M};context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/export.js'),'utf8'),context);return context.LifeExport;}

test('v4: 20色唯一，保留身份，重排与反复草稿修复颜色稳定，状态色不混入',()=>{
 const original=Array.from({length:20},(_,i)=>activity({id:'id-'+i,color:['#20364b','#b86728','#536376','#0b1927','#d9965d','#c2d0d2'][i%6]}));
 const before=JSON.stringify(original),a=M.clone(original),b=M.clone(original).reverse();M.ensureActivityColors(a);M.ensureActivityColors(b);
 const map=xs=>Object.fromEntries(xs.map(a=>[a.id,a.color]).sort());assert.deepEqual(map(a),map(b));
 assert.equal(new Set(a.map(a=>a.color)).size,20);assert.deepEqual(a.map(a=>a.id),original.map(a=>a.id));
 const stable=JSON.stringify(map(a));for(let i=0;i<3;i++)M.ensureActivityColors(a);assert.equal(JSON.stringify(map(a)),stable);assert.equal(JSON.stringify(original),before);
 for(const color of ['#16859a','#dde2e7','#e8edf1','#d9d2c5','#c5d0db'])assert.ok(!a.some(a=>a.color===color));
});
test('v4: 新增20项不短循环；移除后新增仍不复制现有颜色',()=>{
 const acts=[];for(let i=0;i<20;i++){const id='new-'+i;acts.push(activity({id,color:M.nextActivityColor(acts,id)}));}
 assert.equal(new Set(acts.map(a=>a.color)).size,20);acts.splice(3,1);acts.push(activity({id:'extra',color:M.nextActivityColor(acts,'extra')}));assert.equal(new Set(acts.map(a=>a.color)).size,20);
});
test('v4: PNG只用未取整小时换简洁年数，不回写原报告，20项无截字',()=>{
 const acts=Array.from({length:20},(_,i)=>activity({id:'item-'+i,name:'完整活动名称第'+i+'项',timeAmount:'1.4',frequency:'weekly',durationYears:10}));
 const snapshot=report(acts),raw=JSON.stringify(snapshot),c=E.content(snapshot);
 assert.equal(c.details.length,20);for(let i=0;i<20;i++)assert.equal(c.details[i].text,acts[i].name+' · 耗费约 0.083 年');
 assert.ok(Math.abs(c.summary.T-20*(1.4*52*10))<1e-8);assert.equal(JSON.stringify(snapshot),raw);
 assert.doesNotMatch(c.lines.join(' '),/小时|8736|728|52周|公式|×/);assert.equal(c.lines.filter(x=>x.includes('等效时间')).length,1);
});
test('v4: PNG短警示保留超额、超期待修正、明确排除及统计范围；不可算阻断',()=>{
 const snap=report([activity({id:'large',timeAmount:24,durationYears:54}),activity({id:'other',timeAmount:8}),activity({id:'bad',name:'缺字段',timeAmount:null,excludedByUser:true})]);
 const c=E.content(snap);assert.match(c.balance,/超出阶段预算约/);assert.match(c.warnings.join(' '),/保留 54 年.*待修正/);
 assert.match(c.details[2].text,/缺字段.*用户明确排除，不计入统计/);assert.match(c.scope,/2 项计入，1 项由用户确认排除/);
 const broken=report([activity({timeAmount:null})]);assert.throws(()=>E.content(broken),/not calculable/);
});
test('v4: 20句不同，第21次回第1；轮换键独立且不改confirmed/草稿/首次备份',()=>{
 const X=freshExport(),snap=JSON.stringify(report([activity()]));const box=M.createMemoryStorage({[M.KEY_CONFIRMED]:snap,[M.KEY_DRAFT]:'draft raw',[M.KEY_BACKUP]:'backup raw'});
 const original=box.dump(),seen=[];assert.equal(new Set(X.QUOTES).size,20);
 for(let i=0;i<21;i++){const index=X.peekQuoteIndex(box);seen.push(X.QUOTES[index]);X.advanceQuoteIndex(box,index);}
 assert.equal(new Set(seen.slice(0,20)).size,20);assert.equal(seen[20],seen[0]);for(let i=1;i<21;i++)assert.notEqual(seen[i],seen[i-1]);
 for(const [key,value]of Object.entries(original))assert.equal(box.getItem(key),value);assert.equal(Object.keys(box.dump()).length,Object.keys(original).length+1);
});
test('v4: 轮换存储读取/写入/回读失败继续内存轮换，报告及草稿原文不变',()=>{
 for(const mode of ['get','set','readback']){
  const X=freshExport(),box=M.createMemoryStorage({[M.KEY_CONFIRMED]:'confirmed raw',[M.KEY_DRAFT]:'draft raw',[M.KEY_BACKUP]:'backup raw'}),get=box.getItem,set=box.setItem;let armed=false;
  box.getItem=key=>{if(key===X.QUOTE_KEY&&(mode==='get'||(mode==='readback'&&armed))){armed=false;throw Error('rotation read failure');}return get(key);};
  box.setItem=(key,value)=>{if(key===X.QUOTE_KEY&&mode==='set')throw Error('rotation write failure');set(key,value);if(key===X.QUOTE_KEY)armed=true;};
  const first=X.peekQuoteIndex(box);X.advanceQuoteIndex(box,first);const second=X.peekQuoteIndex(box);assert.notEqual(first,second);X.advanceQuoteIndex(box,second);
  assert.equal(get(M.KEY_CONFIRMED),'confirmed raw');assert.equal(get(M.KEY_DRAFT),'draft raw');assert.equal(get(M.KEY_BACKUP),'backup raw');
 }
});
test('v4: 本地固定版本QR库只编码固定公开URL；原版权头完整',()=>{
 const qr=require('../vendor/qrcode-generator-2.0.4.js')(0,'M');qr.addData(E.SHARE_URL,'Byte');qr.make();assert.equal(E.SHARE_URL,'https://maxhou.cn/static/life-calculator/index.html');assert.ok(qr.getModuleCount()>=29);
 assert.ok(fs.readFileSync(path.join(__dirname,'../vendor/qrcode-generator-LICENSE.txt'),'utf8').includes('Copyright (c) 2009 Kazuhiko Arase'));
});

function productionHarness(seed={}){
 const source=fs.readFileSync(path.join(__dirname,'ui-contract.test.js'),'utf8').split('const sleep=')[0];
 return new Function('require','__dirname',source+'\nreturn harness;')(require,__dirname)(seed);
}
function initial54(){
 const h=productionHarness();h.click('open-planner');h.setting('S','26');h.setting('L','80');h.click('wizard-next');
 h.input(h.row('sleep','daily',{timeAmount:'8',frequency:'daily'}),'timeAmount','8');return h;
}
function explore(h){h.click('wizard-next');const row=h.row('empty-explore','explore',{name:'阅读',timeAmount:'',frequency:'weekly'});h.input(row,'name','阅读');h.input(row,'timeAmount','2');h.input(row,'frequency','daily');}
test('v4: 新建默认54→确认→改30/80联动日常/探索50；未生成旧confirmed与PNG内容不变',()=>{
 const h=initial54();explore(h);h.click('wizard-commit');const raw=h.storage.getItem(M.KEY_CONFIRMED),old=JSON.parse(raw),oldPNG=E.content(old);
 assert.deepEqual(old.activities.map(a=>a.durationYears),[54,54]);assert.ok(old.activities.every(a=>a.durationMode==='stage'));
 h.click('edit-report');h.click('wizard-back');h.click('wizard-back');h.setting('S','30');h.setting('L','80');h.fire('wizard','cancel');
 const next=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.deepEqual(next.activities.map(a=>a.durationYears),[50,50]);assert.equal(h.storage.getItem(M.KEY_CONFIRMED),raw);assert.deepEqual(E.content(JSON.parse(h.storage.getItem(M.KEY_CONFIRMED))),oldPNG);
 assert.deepEqual(next.activities.map(a=>a.id),old.activities.map(a=>a.id));
 h.click('edit-report');h.click('wizard-next');h.click('wizard-next');h.click('wizard-commit');h.click('edit-report');h.click('wizard-commit');
 const confirmed=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(confirmed.activities.length,2);assert.deepEqual(confirmed.activities.map(a=>a.id),old.activities.map(a=>a.id));assert.deepEqual(confirmed.activities.map(a=>a.durationYears),[50,50]);
});
test('v4: 明确手填10年不联动；明确手填54缩预算保54并警示，不裁剪',()=>{
 const h=initial54();h.action({more:'sleep'});h.fire('wizard-body','input',{dataset:{editorField:'durationYears'},value:'10'});h.action({saveEditor:'sleep'});
 h.input(h.row('meals','daily',{timeAmount:'1',frequency:'daily'}),'timeAmount','1');h.action({more:'meals'});h.fire('wizard-body','input',{dataset:{editorField:'durationYears'},value:'54'});h.action({saveEditor:'meals'});
 explore(h);h.click('wizard-commit');const old=h.storage.getItem(M.KEY_CONFIRMED);h.click('edit-report');h.click('wizard-back');h.click('wizard-back');h.setting('S','30');h.click('wizard-next');
 assert.match(h.get('wizard-body').innerHTML,/保留原 54 年.*待修正/);h.fire('wizard','cancel');const saved=JSON.parse(h.storage.getItem(M.KEY_DRAFT));
 assert.deepEqual(saved.activities.map(a=>[a.durationYears,a.durationMode]),[[10,'manual'],[54,'manual'],[50,'stage']]);assert.equal(h.storage.getItem(M.KEY_CONFIRMED),old);
});
test('v4: 历史来源仍不可推断；授权统一覆盖无需推断，原始两种操作JSON相同',()=>{
 const proof=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/duration-provenance-proof.json'),'utf8'));
 assert.deepEqual(proof.defaultActivity,proof.explicitManualActivity);assert.equal(proof.defaultActivity.durationYears,54);assert.equal(proof.defaultActivity.durationMode,undefined);
});

const compatFixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/compat-final/assets1-source-fixture.json'),'utf8'));
function editStageStart(h){h.click('edit-report');h.click('wizard-back');h.click('wizard-back');}
test('compat-final: 实际assets1无来源7h×54和旧手填10全部50→60，confirmed/首备份/旧PNG保全，生成ID不复制',()=>{
 const fixture=compatFixture();let h=productionHarness(fixture.storage);const old=JSON.parse(fixture.storage[M.KEY_CONFIRMED]),png=E.content(old),ids=old.activities.map(a=>a.id);
 editStageStart(h);const beforeChange=h.storage.getItem(M.KEY_DRAFT);h.setting('S','30');h.fire('wizard','cancel');
 let draft=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.deepEqual(draft.activities.map(a=>[a.durationYears,a.durationMode]),[[50,'stage'],[50,'stage']]);assert.deepEqual(draft.activities.map(a=>a.id),ids);assert.equal(draft.durationCompatibilityOriginalRaw,beforeChange);
 assert.equal(h.storage.getItem(M.KEY_CONFIRMED),fixture.storage[M.KEY_CONFIRMED]);assert.equal(h.storage.getItem(M.KEY_BACKUP),fixture.storage[M.KEY_BACKUP]);assert.deepEqual(E.content(JSON.parse(h.storage.getItem(M.KEY_CONFIRMED))),png);
 for(const key of ['lifeCalculator_activities','lifeCalculator_visited'])assert.equal(h.storage.getItem(key),fixture.storage[key]);
 h.click('edit-report');h.setting('S','20');h.fire('wizard','cancel');draft=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.deepEqual(draft.activities.map(a=>a.durationYears),[60,60]);assert.equal(draft.durationCompatibilityOriginalRaw,beforeChange);
 h=productionHarness(h.storage.dump());h.click('edit-report');h.click('wizard-next');h.click('wizard-next');h.click('wizard-commit');h.click('edit-report');h.click('wizard-commit');
 const report=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.deepEqual(report.activities.map(a=>a.durationYears),[60,60]);assert.deepEqual(report.activities.map(a=>a.id),ids);assert.equal(report.activities.length,2);assert.equal(report.basis,'selected-stage-v3');assert.equal(M.reportLines(report).summary.budget.D,60);assert.equal(h.storage.getItem(M.KEY_BACKUP),fixture.storage[M.KEY_BACKUP]);
});
test('compat-final: 只打开/刷新/同值S-L及临时无效后恢复原值不转换旧项',()=>{
 const fixture=compatFixture();let h=productionHarness(fixture.storage);
 editStageStart(h);h.setting('S','26.0');h.setting('L','80');h.setting('S','');h.setting('S','26');h.fire('wizard','cancel');
 h=productionHarness(h.storage.dump());h.click('edit-report');h.fire('wizard','cancel');const d=JSON.parse(h.storage.getItem(M.KEY_DRAFT));
 assert.deepEqual(d.activities.map(a=>a.durationYears),[54,10]);assert.ok(d.activities.every(a=>a.durationMode===undefined));assert.equal(d.durationCompatibilityOriginalRaw,undefined);
 assert.equal(h.storage.getItem(M.KEY_CONFIRMED),fixture.storage[M.KEY_CONFIRMED]);assert.equal(h.storage.getItem(M.KEY_BACKUP),fixture.storage[M.KEY_BACKUP]);
});
test('compat-final: 新stage跟随、新manual10及后来stage转manual保护；刷新恢复模式继续联动',()=>{
 const fixture=compatFixture(),d=M.clone(fixture.draft);d.step=1;d.activities.push(activity({id:'known-stage',name:'已知全阶段',durationYears:54,durationMode:'stage'}),activity({id:'known-manual',name:'已知手填',durationYears:10,durationMode:'manual'}));
 let h=productionHarness({[M.KEY_DRAFT]:JSON.stringify(d),[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(d)),[M.KEY_BACKUP]:'raw first backup'});h.click('edit-report');h.setting('S','30');h.click('wizard-next');
 h.action({more:'sleep'});h.fire('wizard-body','input',{dataset:{editorField:'durationYears'},value:'10'});h.action({saveEditor:'sleep'});h.click('wizard-back');h.setting('S','20');h.fire('wizard','cancel');
 let saved=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.deepEqual(saved.activities.map(a=>[a.durationYears,a.durationMode]),[[10,'manual'],[60,'stage'],[60,'stage'],[10,'manual']]);
 h=productionHarness(h.storage.dump());h.click('edit-report');h.setting('S','10');h.fire('wizard','cancel');saved=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.deepEqual(saved.activities.map(a=>[a.durationYears,a.durationMode]),[[10,'manual'],[70,'stage'],[70,'stage'],[10,'manual']]);assert.equal(h.storage.getItem(M.KEY_BACKUP),'raw first backup');
});
test('compat-final: 原V2报告继续原A口径与原串，改阶段只转换草稿，生成才切V3',()=>{
 const acts=compatFixture().confirmed.activities,old={schemaVersion:2,kind:'confirmed',settings:{S:26,A:35,L:80},activities:acts};
 const raw=JSON.stringify(old,null,2),draftRaw=JSON.stringify({...old,kind:'draft',step:1});const h=productionHarness({lifeCalculator_v2_confirmed:raw,lifeCalculator_v2_draft:draftRaw});
 const backup=h.storage.getItem(M.KEY_BACKUP),png=E.content(old);assert.match(png.lines.join(' '),/当前年龄 35 岁/);h.click('edit-report');h.setting('S','30');h.fire('wizard','cancel');
 assert.equal(h.storage.getItem('lifeCalculator_v2_confirmed'),raw);assert.equal(h.storage.getItem('lifeCalculator_v2_draft'),draftRaw);assert.equal(h.storage.getItem(M.KEY_CONFIRMED),null);assert.equal(h.storage.getItem(M.KEY_BACKUP),backup);assert.deepEqual(E.content(old),png);
 const saved=JSON.parse(h.storage.getItem(M.KEY_DRAFT));assert.equal(saved.settings.A,35);assert.deepEqual(saved.activities.map(a=>a.durationYears),[50,50]);h.click('edit-report');h.click('wizard-next');h.click('wizard-next');h.click('wizard-commit');const next=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(next.schemaVersion,3);assert.equal(M.reportLines(next).summary.budget.D,50);assert.equal(h.storage.getItem('lifeCalculator_v2_confirmed'),raw);
});
