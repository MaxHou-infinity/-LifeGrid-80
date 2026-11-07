'use strict';
// DOM contract harness only: executes production event handlers without browser layout/rendering.
// It deliberately does not claim screenshot, touch, hit-testing or PNG image acceptance.
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const M=require('../js/utils');
function harness(seed={},omit=[]) {
    const elements=new Map(),events={};
    function element(id='') {
        return { id,innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},style:{},value:'',width:2,height:2,
            handlers:{},classList:{toggle(){}},setAttribute(){},focus(){},scrollIntoView(){},appendChild(){},
            addEventListener(event,fn){(this.handlers[event] ||= []).push(fn);},
            showModal(){this.open=true;},close(){this.open=false;},
            getContext(){return {clearRect(){},fillRect(){},strokeRect(){}};},
            querySelector(){return element();},querySelectorAll(){return [];} };
    }
    const get=id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);};
    const storage=M.createMemoryStorage(seed);
    const context={console,document:{getElementById:get,body:{style:{}},createElement:element,querySelector:()=>element(),querySelectorAll:()=>[],addEventListener:(event,fn)=>events[event]=fn},localStorage:storage,innerWidth:1440,innerHeight:1000,scrollTo(){},setTimeout(){return 1;},clearTimeout(){},confirm(){return true;}};
    context.window=context;vm.createContext(context);
    for(const file of ['legacy-model','utils','grid','export','activities','app'].filter(file=>!omit.includes(file)))vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context,{filename:file+'.js'});
    events.DOMContentLoaded();
    function fire(id,event,target={}){for(const fn of get(id).handlers[event]||[])fn({target,preventDefault(){}});}
    function click(id){fire(id,'click');}
    function action(dataset,attrs=[]){fire('wizard-body','click',{closest:()=>({dataset,hasAttribute:name=>attrs.includes(name)})});}
    function setting(key,value){fire('wizard-body','input',{dataset:{setting:key},value});}
    function row(key,group,values){const slot=element();return {dataset:{row:key,group},querySelectorAll:()=>Object.entries(values).map(([field,value])=>({dataset:{field},value})),querySelector:()=>slot};}
    function input(host,field,value){fire('wizard-body','input',{dataset:{field},value,closest:()=>host});}
    return {context,get,storage,fire,click,action,setting,row,input};
}
const sleep={id:'sleep-id',name:'睡眠',timeAmount:8,frequency:'daily',durationYears:50,group:'daily',templateKey:'sleep',color:'#b86728'};
function d(activities=[sleep],step=3){return {...M.emptyDraft(),settings:{S:30,L:80},activities:M.clone(activities),step};}

test('production renderer: 首次仅两年龄、16行展开无卡片；第三页400月/29.167年',()=>{
 const h=harness();h.click('open-planner');
 assert.equal(h.get('wizard-progress').textContent,'1/3');
 assert.equal((h.get('wizard-body').innerHTML.match(/data-setting=/g)||[]).length,2);
 assert.doesNotMatch(h.get('wizard-body').innerHTML,/field-error|setting-A/);
 h.setting('S','30');h.setting('L','80');h.click('wizard-next');
 assert.equal((h.get('wizard-body').innerHTML.match(/class="compact-row"/g)||[]).length,16);
 assert.doesNotMatch(h.get('wizard-body').innerHTML,/accordion|<details|data-setting|data-more=/);
 assert.equal(h.get('confirmed-report').hidden,true);
 h.input(h.row('sleep','daily',{timeAmount:'8',frequency:'daily'}),'timeAmount','8');h.click('wizard-next');
 assert.equal(h.get('daily-value').textContent,'400');assert.equal(h.get('explore-value').textContent,'33.333');
 const row=h.row('empty-explore','explore',{name:'阅读',timeAmount:'',frequency:'weekly'});
 h.input(row,'name','阅读');h.input(row,'timeAmount','2');h.input(row,'frequency','daily');
 assert.equal(h.get('daily-value').textContent,'400');assert.equal(h.get('explore-value').textContent,'29.167');
 assert.equal(h.get('wizard-progress').textContent,'3/3');assert.equal(h.get('wizard-next').hidden,true);
 h.click('wizard-commit');
 const saved=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(saved.activities.length,2);assert.equal(h.get('wizard').open,false);assert.equal(h.get('confirmed-report').hidden,false);
 assert.match(h.get('report-body').innerHTML,/29.167/);
});

test('生产事件处理器（VM契约）：原项编辑定位、分类、返回与生成两次不复制ID',()=>{
 const a={...sleep,id:'reading',name:'阅读',timeAmount:4,frequency:'weekly',durationYears:20,templateKey:'study'};
 const draft=d([a]);const h=harness({[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:JSON.stringify(M.snapshotFromDraft(draft))});
 h.fire('activity-list','click',{closest:()=>({dataset:{draftEdit:'reading'}})});
 assert.equal(h.get('confirmed-report').hidden,true);assert.match(h.get('wizard-body').innerHTML,/data-editor="study"/);
 h.fire('wizard-body','input',{dataset:{editorField:'group'},value:'explore'});h.action({saveEditor:'study'});
 for(let i=0;i<3;i++){h.click('wizard-back');h.click('wizard-next');}
 h.click('wizard-commit');h.click('edit-report');h.click('wizard-commit');
 const saved=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(saved.activities.length,1);assert.equal(saved.activities[0].id,'reading');assert.equal(saved.activities[0].group,'explore');assert.equal(M.demandHours(saved.activities[0]),4160);
});

test('ESC处理器仅保存草稿：确认8h，草稿7h；重新启动仍分离',()=>{
 const draft=d();const raw=JSON.stringify(M.snapshotFromDraft(draft));const h=harness({[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:raw});
 h.fire('activity-list','click',{closest:()=>({dataset:{draftEdit:'sleep-id'}})});
 // Cancel the isolated duration editor; inline time edits remain draft edits.
 h.action({},['data-cancel-editor']);
 h.input(h.row('sleep','daily',{}),'timeAmount','7');h.fire('wizard','cancel');
 assert.equal(h.storage.getItem(M.KEY_CONFIRMED),raw);assert.equal(JSON.parse(h.storage.getItem(M.KEY_DRAFT)).activities[0].timeAmount,'7');
 const restarted=harness(h.storage.dump());assert.match(restarted.get('report-notes').innerHTML,/145600/);assert.doesNotMatch(restarted.get('report-notes').innerHTML,/127400/);
});

test('生产生成按钮遇回读不一致保留原报告、内存草稿和备份',()=>{
 const draft=d([{...sleep,timeAmount:7}]),raw=JSON.stringify(M.snapshotFromDraft(d()));
 const h=harness({[M.KEY_DRAFT]:JSON.stringify(draft),[M.KEY_CONFIRMED]:raw,[M.KEY_BACKUP]:'backup'});
 const get=h.storage.getItem,set=h.storage.setItem;let armed=false;
 h.storage.setItem=(key,value)=>{set(key,value);if(key===M.KEY_CONFIRMED)armed=true;};
 h.storage.getItem=key=>{if(key===M.KEY_CONFIRMED&&armed){armed=false;return 'mismatch';}return get(key);};
 h.click('edit-report');h.click('wizard-commit');assert.match(h.get('wizard-alert').innerHTML,/没有提交成功/);assert.equal(get(M.KEY_CONFIRMED),raw);assert.equal(get(M.KEY_BACKUP),'backup');assert.equal(h.get('wizard').open,true);
 h.fire('wizard','cancel');assert.equal(JSON.parse(get(M.KEY_DRAFT)).activities[0].timeAmount,7);
});

test('日常/探索超配使用月/年，阶段缩短不改非legacy既有需求',()=>{
 const draft=d([{...sleep,timeAmount:24},{...sleep,id:'extra',name:'探索',timeAmount:4,group:'explore',templateKey:null}]);
 const h=harness({[M.KEY_DRAFT]:JSON.stringify(draft)});h.click('open-planner');
 assert.equal(h.get('daily-value').textContent,'0');assert.equal(h.get('explore-label').textContent,'超出这一阶段');assert.equal(h.get('explore-value').textContent,'8.333');
 const existing=d([{...sleep,durationYears:30,durationMode:'manual',legacy:false}],1);existing.settings={S:20,L:60};const narrow=harness({[M.KEY_DRAFT]:JSON.stringify(existing)});
 narrow.click('open-planner');narrow.setting('L','40');narrow.click('wizard-next');assert.match(narrow.get('wizard-body').innerHTML,/保留原 30 年/);narrow.click('wizard-next');narrow.click('wizard-commit');
 const report=JSON.parse(narrow.storage.getItem(M.KEY_CONFIRMED));assert.equal(report.activities[0].durationYears,30);assert.equal(M.demandHours(report.activities[0]),87360);
});

test('不可计算项时不把余额显示为完整数字，提交阻断；行内取消只撤年限编辑',()=>{
 const draft=d([{...sleep,timeAmount:null}]);const h=harness({[M.KEY_DRAFT]:JSON.stringify(draft)});h.click('open-planner');
 assert.equal(h.get('daily-value').textContent,'—');assert.equal(h.get('explore-value').textContent,'—');h.click('wizard-commit');
 assert.equal(h.storage.getItem(M.KEY_CONFIRMED),null);assert.match(h.get('wizard-alert').innerHTML,/不会被当成 0/);
 const good=harness({[M.KEY_DRAFT]:JSON.stringify(d([sleep],2))});good.click('open-planner');good.action({more:'sleep'});
 good.fire('wizard-body','input',{dataset:{editorField:'durationYears'},value:'1'});good.action({},['data-cancel-editor']);good.click('wizard-next');good.click('wizard-commit');
 assert.equal(JSON.parse(good.storage.getItem(M.KEY_CONFIRMED)).activities[0].durationYears,50);
});

test('RC: 旧项ID与模板名碰撞时新模板不修改原项，移除不会误删另一项',()=>{
 const old={...sleep,id:'sleep',templateKey:null,name:'旧项目',timeAmount:4,frequency:'weekly',durationYears:20};
 const h=harness({[M.KEY_DRAFT]:JSON.stringify(d([old],2))});h.click('open-planner');
 h.input(h.row('sleep','daily',{timeAmount:'8',frequency:'daily'}),'timeAmount','8');h.click('wizard-next');h.click('wizard-commit');
 let saved=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(saved.activities.length,2);assert.equal(saved.activities.find(a=>a.id==='sleep').timeAmount,4);
 const added=saved.activities.find(a=>a.templateKey==='sleep');assert.equal(added.timeAmount,'8');assert.notEqual(added.id,'sleep');
 h.click('edit-report');h.click('wizard-back');h.action({more:'activity:sleep'});h.action({remove:'activity:sleep'});h.click('wizard-next');h.click('wizard-commit');
 saved=JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));assert.equal(saved.activities.length,1);assert.equal(saved.activities[0].id,added.id);
});


test('RC: 依赖脚本缺失时不启动迁移或写入存储，并明确提示加载失败',()=>{
 for(const file of ['utils','grid','export','activities']) {
  const seed={lifeCalculator_activities:'[]'},h=harness(seed,[file]);
  assert.match(h.get('alerts').innerHTML,/脚本未能完整加载/);assert.deepEqual(h.storage.dump(),seed);
 }
});
