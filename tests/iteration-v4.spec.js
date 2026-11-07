'use strict';
const {test,expect}=require(process.env.LIFE_PLAYWRIGHT_TEST_MODULE||'@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const M=require('../js/utils'),E=require('../js/export');
const ART=process.env.LIFE_ARTIFACTS_DIR?path.resolve(process.env.LIFE_ARTIFACTS_DIR):path.resolve(__dirname,'../artifacts/local-v2/browser');
const PAGE='/index.html';
const a=partial=>({id:'sleep',name:'睡眠',timeAmount:'8',frequency:'daily',durationYears:50,group:'daily',templateKey:'sleep',color:'#b86728',...partial});
const d=(activities=[a()],step=3,settings={S:30,L:80})=>({...M.emptyDraft(),settings,activities,step});
async function seed(page,values){await page.addInitScript(values=>{if(!localStorage.getItem('__v4Seed')){Object.entries(values).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.setItem('__v4Seed','1');}},values);}
async function raw(page){return page.evaluate(()=>Object.fromEntries(['lifeCalculator_v3_draft','lifeCalculator_v3_confirmed','lifeCalculator_v3_rawBackup'].map(k=>[k,localStorage.getItem(k)])));}
async function shot(page,name){fs.mkdirSync(path.join(ART,'screenshots'),{recursive:true});await page.screenshot({path:path.join(ART,'screenshots',name+'.png'),fullPage:true});}
async function capture(page,name){
 await page.evaluate(()=>document.fonts.ready);const event=page.waitForEvent('download');await page.locator('#export-png').click();const dl=await event;
 const file=path.join(ART,'png',name+'.png');fs.mkdirSync(path.dirname(file),{recursive:true});await dl.saveAs(file);const bytes=fs.readFileSync(file);
 expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBeGreaterThan(900);expect(bytes.length).toBeGreaterThan(10000);
 const check=await page.evaluate(async b64=>{
  const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
  const snapshot=JSON.parse(localStorage.getItem('lifeCalculator_v3_confirmed')),last=LifeExport.lastExport,built=LifeExport.buildExportCanvas(snapshot,{quoteIndex:last.quoteIndex});
  const expected=built.canvas.getContext('2d').getImageData(0,0,built.canvas.width,built.canvas.height).data;let pixelDiff=0;
  for(let i=0;i<Math.max(pixels.length,expected.length);i++)if(pixels[i]!==expected[i])pixelDiff++;
  const quietIndex=((built.qr.y+1)*image.width+built.qr.x+1)*4;
  return {quote:last.quote,quoteIndex:last.quoteIndex,pixelDiff,width:image.width,height:image.height,expectedHeight:built.canvas.height,rows:built.rowBounds,qr:built.qr,quietPixel:[...pixels.slice(quietIndex,quietIndex+4)],lines:built.lines,scope:snapshot.scope,snapshotSignature:built.snapshotSignature,signatureMatches:built.snapshotSignature===JSON.stringify(snapshot),painted:built.plan.paintedHours,budget:built.summary.budget.H};
 },bytes.toString('base64'));
 expect(check.pixelDiff).toBe(0);expect(check.height).toBe(check.expectedHeight);expect(check.signatureMatches).toBe(true);expect(check.qr.url).toBe(E.SHARE_URL);expect(check.quietPixel).toEqual([255,255,255,255]);
 expect(check.qr.quietModules).toBeGreaterThanOrEqual(4);expect(check.qr.moduleSize).toBeGreaterThanOrEqual(6);expect(check.qr.y+check.qr.size).toBeLessThan(check.height);expect(check.painted).toBeLessThanOrEqual(check.budget+1e-6);
 for(const row of check.rows)expect(row.bottom).toBeLessThan(check.qr.y);
 fs.writeFileSync(file.replace('.png','-inspection.json'),JSON.stringify(check,null,2));return check;
}
test.beforeEach(async({page})=>{page.v4Errors=[];page.on('pageerror',e=>page.v4Errors.push(String(e)));});
test.afterEach(async({page})=>expect(page.v4Errors).toEqual([]));

test('v4: 实际填写16日常+4探索，20色唯一稳定；重复生成，完整PNG及底部',async({page})=>{
 await page.goto(PAGE);await page.locator('#open-planner').click();await page.locator('#setting-S').fill('30');await page.locator('#setting-L').fill('80');await page.locator('#wizard-next').click();
 for(const input of await page.locator('#daily-rows input[data-field=timeAmount]').all())await input.fill('1');await shot(page,'v4-20-activities-p2');
 await page.locator('#wizard-next').click();
 for(let i=0;i<4;i++){
  if(i)await page.locator('[data-add=explore]').click();
  await page.locator('#explore-rows input[data-field=name]').last().fill('探索完整名称第'+(i+1)+'项');await page.locator('#explore-rows input[data-field=timeAmount]').last().fill('1');
 }
 await shot(page,'v4-20-activities-p3');await page.locator('#wizard-commit').click();
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeCalculator_v3_confirmed')));expect(first.activities).toHaveLength(20);expect(new Set(first.activities.map(a=>a.color)).size).toBe(20);
 const map=acts=>Object.fromEntries(acts.map(a=>[a.id,a.color]).sort());
 await page.locator('#edit-report').click();await page.locator('#wizard-back').click();await page.locator('#wizard-next').click();await page.locator('#wizard-commit').click();
 const second=await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeCalculator_v3_confirmed')));expect(map(second.activities)).toEqual(map(first.activities));expect(second.activities.map(a=>a.id)).toEqual(first.activities.map(a=>a.id));
 await shot(page,'v4-20-activities-report');const png=await capture(page,'v4-20-activities');expect(png.rows).toHaveLength(20);
 for(const act of first.activities)expect(png.lines.join(' ')).toContain(act.name+' · 耗费约');expect(png.lines.join(' ')).not.toMatch(/小时|8736|728|×/);
});

test('v4: 21次真实导出轮换20句；正常两连续PNG；原报告/草稿/备份逐字不动',async({page})=>{
 const draft=d([a(),a({id:'reading',name:'阅读',timeAmount:'2',group:'explore',templateKey:null,color:'#803e75'})]);
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(draft)),[M.KEY_BACKUP]:'first backup raw'});await page.goto(PAGE);const before=await raw(page),quotes=[];
 for(let i=0;i<21;i++){
  // Respect Chromium LocalFrame::ShouldThrottleDownload (10 per 1s burst).
  // Trace: first20 finished in5.5s; requests11..21 spanned931ms, so21 was dropped.
  // Keep all21 actual downloads and storage/pixel assertions; no browser protection is disabled.
  if(i>0&&i%10===0)await page.waitForTimeout(1100);
  const png=await capture(page,'v4-normal-quote-'+String(i+1).padStart(2,'0'));expect(png.quoteIndex).toBe(i%20);quotes.push(png.quote);expect(await raw(page)).toEqual(before);
 }
 expect(new Set(quotes.slice(0,20)).size).toBe(20);expect(quotes[20]).toBe(quotes[0]);for(let i=1;i<quotes.length;i++)expect(quotes[i]).not.toBe(quotes[i-1]);
 await shot(page,'v4-normal-report');fs.writeFileSync(path.join(ART,'quote-cycle.json'),JSON.stringify(quotes,null,2));
});

test('v4: 轮换写入故障不污染confirmed/草稿/备份，连续PNG仍不同',async({page})=>{
 const diagnostic=process.env.LIFE_DIAG_QUOTE_FAILURE==='1',events=[],states=[],pendingResponses=[];
 const record=(type,data)=>events.push({at:Date.now(),type,...data});
 if(diagnostic){
  page.on('console',message=>record('console',{level:message.type(),text:message.text().slice(0,1600)}));
  page.on('pageerror',error=>record('pageerror',{message:String(error)}));
  page.on('requestfailed',request=>record('requestfailed',{url:request.url(),failure:request.failure()}));
  page.on('download',download=>record('download',{scheme:download.url().split(':')[0],filename:download.suggestedFilename()}));
  page.on('response',response=>{
   const url=new URL(response.url());if(url.hostname==='127.0.0.1'&&/\.js$/.test(url.pathname)){
    pendingResponses.push(response.body().then(body=>record('script-response',{url:response.url(),status:response.status(),sha256:require('node:crypto').createHash('sha256').update(body).digest('hex')})).catch(error=>record('script-body-failure',{url:response.url(),message:String(error)})));
   }
  });
 }
 const state=async label=>{if(diagnostic)states.push({label,at:Date.now(),...await page.evaluate(()=>{
  const button=document.querySelector('#export-png'),box=button.getBoundingClientRect(),style=getComputedStyle(button),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
  return {readyState:document.readyState,alerts:document.querySelector('#alerts').textContent,confirmedHidden:document.querySelector('#confirmed-report').hidden,wizardOpen:document.querySelector('#wizard').open,button:{disabled:button.disabled,display:style.display,visibility:style.visibility,rect:{x:box.x,y:box.y,width:box.width,height:box.height},hitTag:hit&&hit.tagName},globals:{model:!!window.LifeModel,wizard:!!window.LifeWizard,export:!!window.LifeExport,qr:typeof window.qrcode},lastExport:window.LifeExport&&window.LifeExport.lastExport,quoteFaultHits:window.__quoteFaultHits||0,quoteIndex:localStorage.getItem('lifeCalculator_png_quote_index')};
 })});};
 try{
  const draft=d();await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(draft)),[M.KEY_BACKUP]:'raw backup'});
  await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lifeCalculator_png_quote_index'){window.__quoteFaultHits=(window.__quoteFaultHits||0)+1;throw Error('quote write failure');}return set.call(this,k,v);};});
  await page.goto(PAGE);const before=await raw(page);await state('before-export-1');
  const one=await capture(page,'v4-quote-storage-failure-1');await state('after-export-1');
  const two=await capture(page,'v4-quote-storage-failure-2');await state('after-export-2');
  expect(one.quote).not.toBe(two.quote);expect(await raw(page)).toEqual(before);
 }finally{
  if(diagnostic){await Promise.allSettled(pendingResponses);fs.mkdirSync(path.join(ART,'diagnostics'),{recursive:true});fs.writeFileSync(path.join(ART,'diagnostics/quote-write-fault.json'),JSON.stringify({events,states,note:'Diagnostic listeners only; injected failure, native click, two actual downloads and all assertions retained.'},null,2));}
 }
});

test('v4: 简洁PNG仍含超配/超期/明确排除范围，完整活动名称与警示',async({page})=>{
 const draft=d([a({timeAmount:24,durationYears:54}),a({id:'other',name:'探索',group:'explore',templateKey:null}),a({id:'broken',name:'缺少数据的旧项',timeAmount:null,excludedByUser:true})]);
 const snap=M.snapshotFromDraft(draft);await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(snap)});await page.goto(PAGE);const png=await capture(page,'v4-warnings-and-exclusion');
 expect(png.lines.join(' ')).toContain('超出阶段预算约');expect(png.lines.join(' ')).toContain('待修正');expect(png.lines.join(' ')).toContain('缺少数据的旧项 · 用户明确排除，不计入统计');expect(png.scope).toEqual(snap.scope);
 expect(png.lines.join(' ')).toContain('统计范围：2 项计入，1 项由用户确认排除。');expect(png.lines.join(' ')).not.toMatch(/小时|8736|728|×/);
});

test('v4: 本地QR资源故障时不生成错误分享图、不推进轮换或改报告',async({page})=>{
 const draft=d();await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(draft)),[M.KEY_BACKUP]:'raw backup'});await page.goto(PAGE);const before=await raw(page);
 await page.evaluate(()=>{window.qrcode=null;});await page.locator('#export-png').click();await expect(page.locator('#alerts')).toContainText('PNG 没有生成');expect(await raw(page)).toEqual(before);expect(await page.evaluate(()=>localStorage.getItem('lifeCalculator_png_quote_index'))).toBeNull();
});

async function plan54(page){
 await page.goto(PAGE);await page.locator('#open-planner').click();await page.locator('#setting-S').fill('26');await page.locator('#setting-L').fill('80');await page.locator('#wizard-next').click();await page.locator('[data-row=sleep] input[data-field=timeAmount]').fill('8');
}
async function addReading(page){await page.locator('#wizard-next').click();await page.locator('#explore-rows input[data-field=name]').fill('阅读');await page.locator('#explore-rows input[data-field=timeAmount]').fill('2');await page.locator('#explore-rows select').selectOption('daily');}
async function returnP1(page){await page.locator('#edit-report').click();await page.locator('#wizard-back').click();await page.locator('#wizard-back').click();}

test('v4: 真实26/80默认54→生成→改30/80默认50；未生成PNG预算/活动与旧confirmed不变',async({page})=>{
 await seed(page,{lifeCalculator_activities:'[]',lifeCalculator_visited:'true'});await plan54(page);await addReading(page);await page.locator('#wizard-commit').click();
 const before=await raw(page),first=JSON.parse(before[M.KEY_CONFIRMED]);expect(first.activities.map(a=>a.durationYears)).toEqual([54,54]);expect(first.activities.every(a=>a.durationMode==='stage')).toBe(true);
 const initialPNG=await capture(page,'v4-default54-before');await returnP1(page);await page.locator('#setting-S').fill('30');await page.locator('#wizard-next').click();await page.locator('#wizard-next').click();
 await expect(page.locator('#explore-value')).toHaveText('29.167');await page.locator('#wizard-close').click();const after=await raw(page),draft=JSON.parse(after[M.KEY_DRAFT]);
 expect(draft.activities.map(a=>a.durationYears)).toEqual([50,50]);expect(draft.activities.map(a=>a.id)).toEqual(first.activities.map(a=>a.id));expect(after[M.KEY_CONFIRMED]).toBe(before[M.KEY_CONFIRMED]);expect(after[M.KEY_BACKUP]).toBe(before[M.KEY_BACKUP]);
 const heldPNG=await capture(page,'v4-default54-unsubmitted');expect(heldPNG.snapshotSignature).toBe(initialPNG.snapshotSignature);expect(heldPNG.rows).toEqual(initialPNG.rows);expect(heldPNG.budget).toBe(initialPNG.budget);expect(heldPNG.painted).toBe(initialPNG.painted);
 await page.locator('#edit-report').click();await page.locator('#wizard-commit').click();await page.locator('#edit-report').click();await page.locator('#wizard-commit').click();
 const final=JSON.parse((await raw(page))[M.KEY_CONFIRMED]);expect(final.activities).toHaveLength(2);expect(final.activities.map(a=>a.durationYears)).toEqual([50,50]);expect(final.activities.map(a=>a.id)).toEqual(first.activities.map(a=>a.id));await capture(page,'v4-default50-confirmed');
});

test('v4: 手填10年保持；手填54缩预算保原值待修正，不裁剪，不改旧报告',async({page})=>{
 await plan54(page);await page.locator('[data-row=sleep] [data-more]').click();await page.getByLabel('持续年数').fill('10');await page.locator('[data-save-editor]').click();
 await page.locator('[data-row=meals] input[data-field=timeAmount]').fill('1');await page.locator('[data-row=meals] [data-more]').click();await page.getByLabel('持续年数').fill('54');await page.locator('[data-save-editor]').click();
 await addReading(page);await page.locator('#wizard-commit').click();const before=await raw(page);await returnP1(page);await page.locator('#setting-S').fill('30');await page.locator('#wizard-next').click();
 await expect(page.locator('[data-row=meals]')).toContainText('保留原 54 年');await expect(page.locator('[data-row=meals]')).toContainText('待修正');await shot(page,'v4-manual-preserved-p2');await page.locator('#wizard-next').click();await page.locator('#wizard-close').click();
 const after=await raw(page),draft=JSON.parse(after[M.KEY_DRAFT]);expect(draft.activities.map(a=>[a.durationYears,a.durationMode])).toEqual([[10,'manual'],[54,'manual'],[50,'stage']]);expect(after[M.KEY_CONFIRMED]).toBe(before[M.KEY_CONFIRMED]);
});

const compatSource=()=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'fixtures/compat-final/assets1-source-fixture.json'),'utf8'));
async function compatP1(page){
 await page.locator('#edit-report').click();
 while(await page.locator('#wizard-progress').textContent()!=='1/3')await page.locator('#wizard-back').click();
}
test('compat-final: 实际assets1来源7h×54与旧手填10，无改动不转换；54→50→60同ID，旧报告/PNG/备份保全',async({page})=>{
 const fixture=compatSource();await seed(page,fixture.storage);await page.goto(PAGE);
 const before=await raw(page),ids=fixture.confirmed.activities.map(a=>a.id);await shot(page,'compat-before-assets1-report');const initialPNG=await capture(page,'compat-before-assets1-normal');
 await compatP1(page);await page.locator('#setting-S').fill('26.0');await page.locator('#setting-L').fill('80');await page.locator('#wizard-close').click();await page.reload();
 let saved=JSON.parse((await raw(page))[M.KEY_DRAFT]);expect(saved.activities.map(a=>a.durationYears)).toEqual([54,10]);expect(saved.activities.every(a=>a.durationMode===undefined)).toBe(true);
 await compatP1(page);const preChange=(await raw(page))[M.KEY_DRAFT];await page.locator('#setting-S').fill('30');await page.locator('#wizard-next').click();await shot(page,'compat-after50-p2');await page.locator('#wizard-next').click();await shot(page,'compat-after50-p3');await page.locator('#wizard-close').click();
 let after=await raw(page);saved=JSON.parse(after[M.KEY_DRAFT]);expect(saved.activities.map(a=>[a.durationYears,a.durationMode])).toEqual([[50,'stage'],[50,'stage']]);expect(saved.activities.map(a=>a.id)).toEqual(ids);expect(saved.durationCompatibilityOriginalRaw).toBe(preChange);expect(after[M.KEY_CONFIRMED]).toBe(before[M.KEY_CONFIRMED]);expect(after[M.KEY_BACKUP]).toBe(before[M.KEY_BACKUP]);
 const heldPNG=await capture(page,'compat-unsubmitted-old-confirmed');expect(heldPNG.snapshotSignature).toBe(initialPNG.snapshotSignature);expect(heldPNG.rows).toEqual(initialPNG.rows);expect(heldPNG.painted).toBe(initialPNG.painted);expect(heldPNG.budget).toBe(initialPNG.budget);
 await page.reload();saved=JSON.parse((await raw(page))[M.KEY_DRAFT]);expect(saved.activities.map(a=>a.durationMode)).toEqual(['stage','stage']);
 await compatP1(page);await page.locator('#setting-S').fill('20');await page.locator('#wizard-next').click();await page.locator('#wizard-next').click();
 saved=JSON.parse((await raw(page))[M.KEY_DRAFT]);expect(saved.activities.map(a=>a.durationYears)).toEqual([60,60]);expect(saved.durationCompatibilityOriginalRaw).toBe(preChange);expect((await raw(page))[M.KEY_CONFIRMED]).toBe(before[M.KEY_CONFIRMED]);
 await page.locator('#wizard-commit').click();await page.locator('#edit-report').click();await page.locator('#wizard-commit').click();
 const final=JSON.parse((await raw(page))[M.KEY_CONFIRMED]);expect(final.activities).toHaveLength(2);expect(final.activities.map(a=>a.id)).toEqual(ids);expect(final.activities.map(a=>[a.durationYears,a.durationMode])).toEqual([[60,'stage'],[60,'stage']]);expect(M.reportLines(final).summary.budget.D).toBe(60);
 expect((await raw(page))[M.KEY_BACKUP]).toBe(before[M.KEY_BACKUP]);for(const key of ['lifeCalculator_activities','lifeCalculator_visited'])expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(fixture.storage[key]);
 await shot(page,'compat-after60-confirmed-report');const png=await capture(page,'compat-final-normal-after');expect(png.budget).toBe(60*8736);expect(png.lines.join(' ')).toContain('20—80岁');expect(png.lines.join(' ')).toContain('睡眠 · 耗费约 17.5 年');
});

test('compat-final: 新stage和旧无来源跟随，新manual10与stage后来改manual均保护，刷新不丢来源',async({page})=>{
 const fixture=compatSource(),draft=M.clone(fixture.draft);draft.step=1;
 draft.activities.push(a({id:'known-stage',name:'新全阶段',durationYears:54,durationMode:'stage',templateKey:null,timeAmount:'1',group:'explore'}),a({id:'known-manual',name:'新手填10年',durationYears:10,durationMode:'manual',templateKey:null,timeAmount:'1',group:'explore'}));
 const snap=M.snapshotFromDraft(draft);await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(snap),[M.KEY_BACKUP]:'original backup raw'});await page.goto(PAGE);const before=await raw(page);await compatP1(page);await page.locator('#setting-S').fill('30');await page.locator('#wizard-next').click();
 await page.locator('[data-row=sleep] [data-more]').click();await page.getByLabel('持续年数').fill('10');await page.locator('[data-save-editor]').click();await page.locator('#wizard-back').click();await page.locator('#setting-S').fill('20');await page.locator('#wizard-next').click();await page.locator('#wizard-next').click();await page.locator('#wizard-close').click();await page.reload();
 const saved=JSON.parse((await raw(page))[M.KEY_DRAFT]);expect(saved.activities.map(a=>[a.durationYears,a.durationMode])).toEqual([[10,'manual'],[60,'stage'],[60,'stage'],[10,'manual']]);expect((await raw(page))[M.KEY_CONFIRMED]).toBe(before[M.KEY_CONFIRMED]);expect((await raw(page))[M.KEY_BACKUP]).toBe(before[M.KEY_BACKUP]);
 await compatP1(page);await page.locator('#setting-S').fill('10');await page.locator('#wizard-next').click();await page.locator('#wizard-next').click();await page.locator('#wizard-commit').click();
 const final=JSON.parse((await raw(page))[M.KEY_CONFIRMED]);expect(final.activities.map(a=>[a.durationYears,a.durationMode])).toEqual([[10,'manual'],[70,'stage'],[70,'stage'],[10,'manual']]);expect(final.activities.map(a=>a.id)).toEqual(draft.activities.map(a=>a.id));
 await shot(page,'compat-manual-protection-confirmed');await capture(page,'compat-manual-protection-normal');
});
