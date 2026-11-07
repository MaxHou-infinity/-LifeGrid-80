'use strict';
const { test, expect } = require(process.env.LIFE_PLAYWRIGHT_TEST_MODULE || '@playwright/test');
const M = require('../js/utils');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const ART = process.env.LIFE_ARTIFACTS_DIR ? path.resolve(process.env.LIFE_ARTIFACTS_DIR) : path.resolve(__dirname, '../artifacts/local-v2/browser');
const PAGE = process.env.LIFE_TEST_NO_SERVER ? pathToFileURL(path.resolve(__dirname,'../index.html')).href : '/index.html';
const draft = (activities=[],settings={S:30,L:80},step=3) => Object.assign(M.emptyDraft(),{settings,activities,step});
const activity = partial => Object.assign({id:'sleep',name:'睡眠',timeAmount:8,frequency:'daily',durationYears:50,group:'daily',templateKey:'sleep',color:'#b86728'},partial);
async function seed(page,values,fault) {
    await page.addInitScript(({values,fault})=>{
        const get=Storage.prototype.getItem, set=Storage.prototype.setItem;
        if (!get.call(localStorage,'__isolatedTestSeed')) {
            for(const [k,v] of Object.entries(values))set.call(localStorage,k,v);
            set.call(localStorage,'__isolatedTestSeed','1');
        }
        if(fault) {
            let armed=false;
            Storage.prototype.setItem=function(k,v){
                if(k===fault.key && fault.mode==='write')throw Error('injected write error');
                set.call(this,k,v);if(k===fault.key)armed=true;
            };
            Storage.prototype.getItem=function(k){
                if(k===fault.key&&armed){armed=false;if(fault.mode==='throw')throw Error('injected readback error');return 'readback-mismatch';}
                return get.call(this,k);
            };
        }
    },{values,fault});
}
async function start(page) { await page.goto(PAGE);await page.locator('#open-planner').click(); }
async function stage(page,S=30,L=80){await page.locator('#setting-S').fill(String(S));await page.locator('#setting-L').fill(String(L));await page.locator('#wizard-next').click();}
async function noReport(page) {await expect(page.locator('#confirmed-report')).toBeHidden();await expect(page.locator('#wizard-body canvas')).toHaveCount(0);}
async function screenshot(page,name){fs.mkdirSync(path.join(ART,'screenshots'),{recursive:true});await page.screenshot({path:path.join(ART,'screenshots',name+'.png'),fullPage:true});}
async function read(page,key){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function assertUnits(page) {
    const measurements=await page.locator('#wizard-body .unit').evaluateAll(elements=>elements.map(el=>{
        const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()];
        const style=getComputedStyle(el),box=el.getBoundingClientRect();
        const select=el.nextElementSibling;
        return {text:el.textContent,lines:rects.length,nowrap:style.whiteSpace,width:box.width,textWidth:range.getBoundingClientRect().width,frequency:select.value,period:select.selectedOptions[0].textContent};
    }));
    expect(measurements.length).toBeGreaterThan(0);
    for(const item of measurements){expect(item.text).toBe('小时/');expect(item.lines).toBe(1);expect(item.nowrap).toBe('nowrap');expect(item.width+.5).toBeGreaterThanOrEqual(item.textWidth);expect(item.period).toBe({daily:'天',weekly:'周',monthly:'月',yearly:'年'}[item.frequency]);}
    const controls=await page.locator('#wizard-body .compact-fields').evaluateAll(rows=>rows.flatMap(row=>{
        const input=row.querySelector('input[data-field=timeAmount]'),select=row.querySelector('select[data-field=frequency]'),unit=row.querySelector('.unit');
        if(!input||!select||!unit)return [];
        const ctx=document.createElement('canvas').getContext('2d'),a=getComputedStyle(input),b=getComputedStyle(select);
        ctx.font=`${a.fontWeight} ${a.fontSize} ${a.fontFamily}`;const numberWidth=ctx.measureText(input.value).width;
        ctx.font=`${b.fontWeight} ${b.fontSize} ${b.fontFamily}`;const periodWidth=ctx.measureText(select.selectedOptions[0].textContent).width;
        const ir=input.getBoundingClientRect(),ur=unit.getBoundingClientRect(),sr=select.getBoundingClientRect(),more=row.querySelector('.more-slot').getBoundingClientRect();
        return [{numberFits:numberWidth<=input.clientWidth-parseFloat(a.paddingLeft)-parseFloat(a.paddingRight)+.5,periodFits:periodWidth<=select.clientWidth-parseFloat(b.paddingLeft)-parseFloat(b.paddingRight)-16+.5,noOverlap:ir.right<=ur.left+.5&&ur.right<=sr.left+.5&&sr.right<=more.left+.5}];
    }));
    for(const control of controls){expect(control.numberFits).toBe(true);expect(control.periodFits).toBe(true);expect(control.noOverlap).toBe(true);}
    const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth-innerWidth,dialog:document.getElementById('wizard').scrollWidth-document.getElementById('wizard').clientWidth,body:document.getElementById('wizard-body').scrollWidth-document.getElementById('wizard-body').clientWidth}));
    for(const amount of Object.values(overflow))expect(amount).toBeLessThanOrEqual(1);
}
async function assertFooter(page) {
    const boxes=await page.locator('.wizard-foot .btn:visible').evaluateAll(buttons=>buttons.map(button=>{
        const b=button.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
        return {width:b.width,height:b.height,top:b.top,bottom:b.bottom,inView:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight,reachable:hit===button||button.contains(hit)};
    }));
    expect(boxes.length).toBeGreaterThan(0);for(const b of boxes){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.inView).toBe(true);expect(b.reachable).toBe(true);}
}
async function savePNG(page,name) {
    await page.evaluate(()=>document.fonts.ready);
    const downloadEvent=page.waitForEvent('download');await page.locator('#export-png').click();const download=await downloadEvent;
    fs.mkdirSync(path.join(ART,'png'),{recursive:true});const target=path.join(ART,'png',name+'.png');await download.saveAs(target);
    const bytes=fs.readFileSync(target);expect(bytes.length).toBeGreaterThan(10000);
    expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBeGreaterThan(900);
    // Decode the entire exported image in the browser; check bottom legend and all row bounds, not just a data prefix.
    const result=await page.evaluate(async b64=>{
        const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);
        const px=c.getImageData(0,0,canvas.width,canvas.height).data;
        let inkBottom=0;for(let y=image.height-160;y<image.height-15;y++)for(let x=50;x<600;x++){const i=(y*image.width+x)*4;if(px[i]<100 && px[i+1]<160)inkBottom++;}
        const snapshot=JSON.parse(localStorage.getItem('lifeCalculator_v3_confirmed'));const built=LifeExport.buildExportCanvas(snapshot,{quoteIndex:LifeExport.lastExport.quoteIndex});
        const expected=built.canvas.getContext('2d').getImageData(0,0,built.canvas.width,built.canvas.height).data;
        let pixelDiff=0;for(let i=0;i<px.length;i++)if(px[i]!==expected[i])pixelDiff++;
        return {width:image.width,height:image.height,expectedHeight:built.canvas.height,pixelDiff,inkBottom,painted:built.plan.paintedHours,available:built.summary.budget.H,scope:snapshot.scope,lines:built.lines,coreLines:built.lines.filter(line=>line!==built.quote),quote:built.quote,activityHours:Object.fromEntries(snapshot.activities.filter(a=>!a.excludedByUser).map(a=>[a.id,LifeModel.demandHours(a)])),snapshotSignature:built.snapshotSignature};
    },bytes.toString('base64'));
    expect(result.pixelDiff).toBe(0);expect(result.height).toBe(result.expectedHeight);expect(result.inkBottom).toBeGreaterThan(20);expect(result.painted).toBeLessThanOrEqual(result.available+1e-6);
    fs.writeFileSync(path.join(ART,'png',name+'-inspection.json'),JSON.stringify(result,null,2));return result;
}
test.beforeEach(async({page})=>{page.errors=[];page.on('pageerror',e=>page.errors.push(String(e)));});
test.afterEach(async({page})=>{expect(page.errors).toEqual([]);});

for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}],['mobile-360',{width:360,height:844}]]) {
 test(`${device}: 正常三页、背景隐藏、P3月份到年数、截图及完整PNG`,async({page})=>{
    await page.setViewportSize(viewport);await start(page);await noReport(page);
    await expect(page.locator('#wizard-body input')).toHaveCount(2);await expect(page.locator('.field-error')).toHaveCount(0);
    await screenshot(page,device+'-p1');await stage(page);await noReport(page);
    await expect(page.locator('#daily-rows>.compact-row')).toHaveCount(16);
    await expect(page.locator('#wizard-body details')).toHaveCount(0);await expect(page.locator('[data-setting]')).toHaveCount(0);
    expect(await page.locator('#daily-rows input[data-field=timeAmount]').evaluateAll(xs=>xs.every(x=>x.value===''))).toBe(true);
    await page.locator('[data-row=sleep] input[data-field=timeAmount]').fill('8');await assertUnits(page);await screenshot(page,device+'-p2');await page.locator('#wizard-next').click();await noReport(page);
    await expect(page.locator('#daily-value')).toHaveText('400');await expect(page.locator('#explore-value')).toHaveText('33.333');
    await page.locator('#explore-rows input[data-field=name]').fill('阅读');await page.locator('#explore-rows input[data-field=timeAmount]').fill('2');await page.locator('#explore-rows select').selectOption('daily');
    await expect(page.locator('#daily-value')).toHaveText('400');await expect(page.locator('#explore-value')).toHaveText('29.167');
    await expect(page.locator('#wizard-progress')).toHaveText('3/3');await expect(page.locator('#wizard-next')).toBeHidden();await assertUnits(page);await screenshot(page,device+'-p3');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.locator('#wizard-commit').click();await expect(page.locator('#wizard')).toBeHidden();await expect(page.locator('#report-body')).toContainText('29.167');
    await screenshot(page,device+'-report');const result=await savePNG(page,device+'-confirmed');expect(result.lines.join(' ')).toContain('29.167');
 });
}

test('稳定ID、4160小时、分类与返回三次、重复生成不复制',async({page})=>{
 const a=activity({id:'reading-stable',name:'阅读',timeAmount:4,frequency:'weekly',durationYears:20,templateKey:null});
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft([a],{S:30,L:80},2))});await start(page);
 await page.locator('[data-activity-id=reading-stable] [data-more]').click();await page.getByLabel('活动分类').selectOption('explore');await page.locator('[data-save-editor]').click();
 for(let i=0;i<3;i++){await page.locator('#wizard-back').click();await page.locator('#wizard-next').click();}
 await expect(page.locator('#wizard [data-activity-id=reading-stable]')).toHaveCount(1);
 await page.locator('#wizard-commit').click();const first=await read(page,M.KEY_CONFIRMED);
 await page.locator('#edit-report').click();await noReport(page);await page.locator('#wizard-commit').click();const second=await read(page,M.KEY_CONFIRMED);
 expect(second.activities).toHaveLength(1);expect(second.activities[0].id).toBe(first.activities[0].id);expect(M.demandHours(second.activities[0])).toBe(4160);
});

test('非legacy既有明确manual30年项缩到20年仍保原值与需求，编辑取消和新年限验证',async({page})=>{
 const a=activity({durationYears:30,durationMode:'manual',legacy:false});
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft([a],{S:20,L:60},1))});await start(page);await stage(page,20,40);
 await expect(page.locator('[data-row=sleep]')).toContainText('保留原 30 年');
 await page.locator('[data-row=sleep] [data-more]').click();await page.getByLabel('持续年数').fill('25');await page.locator('[data-save-editor]').click();await expect(page.locator('.field-error')).toContainText('不能超过');
 await page.locator('[data-cancel-editor]').click();await page.locator('#wizard-next').click();await page.locator('#wizard-commit').click();
 const report=await read(page,M.KEY_CONFIRMED);expect(report.activities[0].durationYears).toBe(30);expect(M.demandHours(report.activities[0])).toBe(8*364*30);
 await expect(page.locator('#report-body')).toContainText('待修正');await savePNG(page,'over-horizon');
});

test('报告8h/草稿7h：ESC退出刷新、PNG与报告读8h，重开读7h',async({page})=>{
 const d=draft([activity()]);const confirmed=M.snapshotFromDraft(d);await seed(page,{[M.KEY_DRAFT]:JSON.stringify(d),[M.KEY_CONFIRMED]:JSON.stringify(confirmed)});
 await page.goto(PAGE);await page.locator('#activity-list [data-draft-edit]').click();await page.locator('[data-row=sleep] input[data-field=timeAmount]').fill('7');await page.keyboard.press('Escape');await page.reload();
 await expect(page.locator('#report-notes')).toContainText('145600');const png=await savePNG(page,'confirmed8-draft7');expect(png.activityHours.sleep).toBe(145600);expect(png.lines.join(' ')).toContain('耗费约 16.667 年');expect(png.lines.join(' ')).not.toContain('耗费约 14.583 年');
 expect(Number((await read(page,M.KEY_DRAFT)).activities[0].timeAmount)).toBe(7);expect(Number((await read(page,M.KEY_CONFIRMED)).activities[0].timeAmount)).toBe(8);
 await page.locator('#edit-report').click();await noReport(page);await expect(page.locator('[data-row=sleep] input[data-field=timeAmount]')).toHaveValue('7');
});

test('V2报告保持旧口径，迁入第二页刷新与首次备份保持不变',async({page})=>{
 const old={schemaVersion:2,kind:'confirmed',settings:{S:20,A:30,L:80},activities:[activity({durationYears:40,templateKey:null})]};
 const raw=JSON.stringify(old);await seed(page,{lifeCalculator_v2_confirmed:raw});await page.goto(PAGE);
 await expect(page.locator('#report-body')).toContainText('自然余生 50 年');const backup=await page.evaluate(k=>localStorage.getItem(k),M.KEY_BACKUP);
 await page.locator('#edit-report').click();await page.locator('#wizard-next').click();await page.keyboard.press('Escape');await page.reload();
 expect((await read(page,M.KEY_DRAFT)).step).toBe(2);expect(await page.evaluate(k=>localStorage.getItem(k),M.KEY_BACKUP)).toBe(backup);expect(await page.evaluate(()=>localStorage.getItem('lifeCalculator_v2_confirmed'))).toBe(raw);
 await expect(page.locator('#report-body')).toContainText('自然余生 50 年');await page.locator('#edit-report').click();await page.locator('#wizard-next').click();await expect(page.locator('#basis-notice')).toContainText('选定阶段');await page.locator('#wizard-commit').click();
 await expect(page.locator('#report-body')).not.toContainText('自然余生');expect((await read(page,M.KEY_CONFIRMED)).settings.A).toBe(30);
});

for(const mode of ['write','mismatch','throw'])test(`提交${mode}失败：旧报告、备份及内存草稿保持`,async({page})=>{
 const d=draft([activity({timeAmount:7})]), old=M.snapshotFromDraft(draft([activity()]));const raw=JSON.stringify(old),backup='immutable-backup';
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(d),[M.KEY_CONFIRMED]:raw,[M.KEY_BACKUP]:backup},{key:M.KEY_CONFIRMED,mode});await page.goto(PAGE);await page.locator('#edit-report').click();await page.locator('#wizard-commit').click();
 await expect(page.locator('#wizard-alert')).toContainText('没有提交成功');expect(await page.evaluate(k=>localStorage.getItem(k),M.KEY_CONFIRMED)).toBe(raw);expect(await page.evaluate(k=>localStorage.getItem(k),M.KEY_BACKUP)).toBe(backup);
 await page.keyboard.press('Escape');await expect(page.locator('#report-notes')).toContainText('145600');expect(Number((await read(page,M.KEY_DRAFT)).activities[0].timeAmount)).toBe(7);
});

test('备份失败不转换；草稿失败明确不承诺刷新恢复',async({browser})=>{
 for(const key of [M.KEY_BACKUP,M.KEY_DRAFT]) {
    const context=await browser.newContext();const page=await context.newPage();await seed(page,{lifeCalculator_activities:'[]'},{key,mode:'write'});await page.goto(PAGE);
    await expect(page.locator('#alerts')).toContainText(key===M.KEY_BACKUP?'原始备份失败':'草稿没有写入本机');expect(await page.evaluate(k=>localStorage.getItem(k),M.KEY_DRAFT)).toBeNull();
    expect(await page.evaluate(()=>localStorage.getItem('lifeCalculator_activities'))).toBe('[]');await context.close();
 }
});

test('不可计算项目阻断；显式排除决定、统计范围及PNG保留',async({page})=>{
 const a=activity({id:'broken',name:'残缺项',timeAmount:null,templateKey:null});await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft([activity(),a]))});await start(page);
 await page.locator('#wizard-commit').click();await expect(page.locator('#wizard-alert')).toContainText('不会被当成 0');expect(await read(page,M.KEY_CONFIRMED)).toBeNull();
 await page.locator('#wizard-back').click();await page.locator('[data-activity-id=broken] [data-more]').click();page.once('dialog',d=>d.accept());await page.locator('[data-exclude]').click();await page.locator('#wizard-next').click();await page.locator('#wizard-commit').click();
 const r=await read(page,M.KEY_CONFIRMED);expect(r.scope.excludedIds).toEqual(['broken']);expect(r.scope.countedIds).toEqual(['sleep']);
 expect(r.activities.find(item=>item.id==='broken').excludedByUser).toBe(true);expect(r.activities.find(item=>item.id==='broken').timeAmount).toBeNull();
 const png=await savePNG(page,'explicit-exclusion');expect(png.lines.join(' ')).toContain('用户确认排除');expect(png.scope).toEqual(r.scope);
 const raw=await page.evaluate(key=>localStorage.getItem(key),M.KEY_CONFIRMED);await page.reload();
 expect(await page.evaluate(key=>localStorage.getItem(key),M.KEY_CONFIRMED)).toBe(raw);
 const refreshed=await read(page,M.KEY_CONFIRMED);expect(refreshed.scope).toEqual(r.scope);expect(refreshed.activities.find(item=>item.id==='broken').excludedByUser).toBe(true);
 await expect(page.locator('#report-notes')).toContainText('统计范围：1 项计入，1 项由用户确认排除。');
 const second=await savePNG(page,'explicit-exclusion-after-refresh');expect(second.scope).toEqual(r.scope);expect(second.coreLines).toEqual(png.coreLines);expect(second.snapshotSignature).toEqual(png.snapshotSignature);expect(second.quote).not.toEqual(png.quote);
 expect(second.lines.join(' ')).toContain('统计范围：1 项计入，1 项由用户确认排除。');expect(second.lines.join(' ')).toContain('残缺项 · 用户明确排除，不计入统计');
});

test('日常超配以月突出、探索超配以年突出；生成警示并保全范围',async({page})=>{
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft([activity({timeAmount:24}),activity({id:'extra',name:'探索',timeAmount:4,group:'explore',templateKey:null})]))});await start(page);
 await expect(page.locator('#daily-value')).toHaveText('0');await expect(page.locator('#explore-label')).toHaveText('超出这一阶段');await expect(page.locator('#explore-value')).toHaveText('8.333');
 await page.locator('#wizard-back').click();await page.locator('[data-add=daily]').click();await page.locator('#daily-rows input[data-field=name]').fill('额外日常');await page.locator('#daily-rows>.compact-row').last().locator('input[data-field=timeAmount]').fill('1');await page.locator('#wizard-next').click();
 await expect(page.locator('#daily-label')).toHaveText('已超出这一阶段');await expect(page.locator('#daily-value')).toHaveText('25');await page.locator('#wizard-commit').click();await expect(page.locator('#report-body')).toContainText('超出这一阶段');await savePNG(page,'over-allocation');
});

test('小数边界多分段、鼠标真实点击、网格缩放和内外滚动命中（非真实触摸/菜单缩放）',async({page})=>{
 const a=[activity({id:'one',name:'甲',timeAmount:26,frequency:'yearly',durationYears:1,templateKey:null}),activity({id:'two',name:'乙',timeAmount:26,frequency:'yearly',durationYears:1,templateKey:null})];
 const d=draft(a,{S:30.1,L:31});await seed(page,{[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(d))});await page.goto(PAGE);
 async function click(fraction,id){
    await page.locator('#grid-scroll').evaluate(el=>{el.scrollTop=30*14-40;});await page.locator('#grid-scroll').scrollIntoViewIfNeeded();
    const pos=await page.locator('#life-grid').evaluate((c,f)=>{const r=c.getBoundingClientRect(),stride=c.width/52;return {x:r.left+(5*stride+(stride-2)*f)*r.width/c.width,y:r.top+(30*stride+4)*r.height/c.height};},fraction);
    await page.mouse.click(pos.x,pos.y);await expect(page.locator('#life-grid')).toHaveAttribute('data-hit',new RegExp('30:5:'+id));await expect(page.locator('#cell-popover')).toContainText('甲');await expect(page.locator('#cell-popover')).toContainText('乙');await page.locator('#close-popover').click();
 }
 await click(.25,'one');await click(.45,'two');await click(.1,'outside');await page.locator('#zoom-in').click();await expect(page.locator('#zoom-level')).toHaveText('125%');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

for(const width of [360,390])test(`RC ${width}px: 长表、单位、焦点与底部动作真实布局`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const extras=Array.from({length:12},(_,i)=>activity({id:'explore-'+i,name:'探索项目 '+(i+1),timeAmount:1,frequency:'weekly',group:'explore',templateKey:null}));
 const long=activity({id:'long-name',name:'LongActivityNameWithoutSpacesForOverflowCheck',timeAmount:1,frequency:'weekly',templateKey:null});
 await seed(page,{[M.KEY_DRAFT]:JSON.stringify(draft([activity(),long,...extras],{S:30,L:80},2))});await start(page);await assertUnits(page);await assertFooter(page);
 expect(await page.locator('#wizard').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await page.locator('#wizard').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 expect(await page.locator('#wizard').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(1);
 const margin=page.locator('[data-row=margin]');await margin.locator('input[data-field=timeAmount]').fill('0.5');await margin.locator('select[data-field=frequency]').selectOption('weekly');
 await page.locator('[data-add=daily]').click();const custom=page.locator('#daily-rows>.compact-row').last();
 await custom.locator('input[data-field=name]').fill('末尾其他日常');await custom.locator('input[data-field=timeAmount]').fill('1.5');await custom.locator('select[data-field=frequency]').selectOption('monthly');
 await assertUnits(page);
 const last=page.locator('#daily-rows input[data-field=timeAmount]').last();await last.scrollIntoViewIfNeeded();await last.focus();await page.keyboard.press('Tab');
 const focus=await page.evaluate(()=>{const el=document.activeElement,b=el.getBoundingClientRect(),s=getComputedStyle(el),footer=document.querySelector('.wizard-foot').getBoundingClientRect();return {outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),fontSize:parseFloat(s.fontSize),height:b.height,aboveFooter:b.bottom<=footer.top+1};});
 expect(focus.outline).not.toBe('none');expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);expect(focus.fontSize).toBeGreaterThanOrEqual(16);expect(focus.height).toBeGreaterThanOrEqual(44);expect(focus.aboveFooter).toBe(true);
 await assertFooter(page);await screenshot(page,`mobile-${width}-long-p2`);await page.locator('#wizard-next').click();
 const saved=await read(page,M.KEY_DRAFT),savedMargin=saved.activities.find(item=>item.templateKey==='margin'),savedOther=saved.activities.filter(item=>item.name==='末尾其他日常');
 expect(savedMargin.timeAmount).toBe('0.5');expect(savedMargin.frequency).toBe('weekly');expect(savedOther).toHaveLength(1);expect(savedOther[0].timeAmount).toBe('1.5');expect(savedOther[0].frequency).toBe('monthly');
 expect(M.demandHours(savedMargin)).toBe(1300);expect(M.demandHours(savedOther[0])).toBe(900);await expect(page.locator('#daily-value')).toHaveText('393.407');
 await page.locator('#wizard-back').click();await page.locator('#wizard-back').click();await page.locator('#wizard-next').click();
 await expect(page.locator('[data-row=margin] input[data-field=timeAmount]')).toHaveValue('0.5');await expect(page.locator('[data-row=margin] select')).toHaveValue('weekly');
 const restored=page.locator(`#daily-rows [data-activity-id="${savedOther[0].id}"]`);await expect(restored).toHaveCount(1);await expect(restored.locator('input[data-field=name]')).toHaveValue('末尾其他日常');await expect(restored.locator('input[data-field=timeAmount]')).toHaveValue('1.5');await expect(restored.locator('select')).toHaveValue('monthly');
 await page.locator('#wizard-next').click();const again=await read(page,M.KEY_DRAFT);expect(again.activities).toHaveLength(saved.activities.length);expect(again.activities.find(item=>item.templateKey==='margin').id).toBe(savedMargin.id);expect(again.activities.filter(item=>item.id===savedOther[0].id)).toHaveLength(1);
 await expect(page.locator('#daily-value')).toHaveText('393.407');await assertUnits(page);await assertFooter(page);
 await page.locator('#explore-rows input[data-field=timeAmount]').last().scrollIntoViewIfNeeded();await assertFooter(page);await assertUnits(page);await screenshot(page,`mobile-${width}-long-p3`);
 await page.locator('#wizard-commit').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 await screenshot(page,`mobile-${width}-long-report`);
});

test('RC: app或依赖脚本加载失败保持入口不可提交且不改本机原文',async({browser})=>{
 for(const file of ['app','utils']) {
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));const raw='[]';await seed(page,{lifeCalculator_activities:raw});
  await page.route(`**/js/${file}.js*`,route=>route.abort());await page.goto(PAGE);
  await expect(page.locator('#alerts')).toContainText('刷新重试');await expect(page.locator('#open-planner')).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('lifeCalculator_activities'))).toBe(raw);expect(await read(page,M.KEY_DRAFT)).toBeNull();expect(errors).toEqual([]);await context.close();
 }
});

test('RC: 重复ID迁入后只删除选定项，原文与其它项仍保留',async({page})=>{
 const old=JSON.stringify([activity({id:'dup',name:'甲',templateKey:null}),activity({id:'dup',name:'乙',templateKey:null})]);
 await seed(page,{lifeCalculator_activities:old});await start(page);await stage(page);
 const rows=page.locator('#daily-rows [data-activity-id]');await expect(rows).toHaveCount(2);
 const ids=await rows.evaluateAll(xs=>xs.map(x=>x.dataset.activityId));expect(new Set(ids).size).toBe(2);
 await rows.first().locator('[data-more]').click();page.once('dialog',dialog=>dialog.accept());await page.locator('[data-remove]').click();await expect(rows).toHaveCount(1);
 await expect(rows.first().locator('input[data-field=name]')).toHaveValue('乙');await page.locator('#wizard-next').click();await page.locator('#wizard-commit').click();
 expect((await read(page,M.KEY_CONFIRMED)).activities).toHaveLength(1);expect(await page.evaluate(()=>localStorage.getItem('lifeCalculator_activities'))).toBe(old);
});

test('RC: 结构损坏草稿不会覆盖，仍显示并导出原已确认快照',async({page})=>{
 const old=M.snapshotFromDraft(draft([activity()]));const raw=JSON.stringify({...draft(),activities:null});
 await seed(page,{[M.KEY_DRAFT]:raw,[M.KEY_CONFIRMED]:JSON.stringify(old)});await page.goto(PAGE);await expect(page.locator('#alerts')).toContainText('结构损坏');
 await expect(page.locator('#report-body')).toContainText('33.333');await savePNG(page,'malformed-draft-confirmed');
 await page.locator('#edit-report').click();await page.keyboard.press('Escape');expect(await page.evaluate(k=>localStorage.getItem(k),M.KEY_DRAFT)).toBe(raw);
});
