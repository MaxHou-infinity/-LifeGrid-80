'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../js/utils.js');

function legacyActivities() {
    return JSON.stringify([
        { id: 'sleep', name: '睡眠', timeAmount: 8, frequency: 'daily', durationYears: 40, color: '#123456', note: '保留' },
        { id: 'broken', name: '缺小时', frequency: 'weekly', durationYears: 10, color: '#654321' }
    ]);
}

function settingsForReport() {
    return { S: 20, A: 30, L: 80 };
}

test('首次备份保存原始字符串且重试不覆盖，旧键原样留下', function () {
    const storage = Life.createMemoryStorage({
        lifeCalculator_activities: legacyActivities(),
        lifeCalculator_zoomLevel: '125',
        lifeCalculator_visited: 'true'
    });
    const first = Life.bootStorage(storage, '2026-11-07T00:00:00.000Z');
    assert.equal(first.migrationStatus, 'migrated');
    assert.equal(first.draftPersisted, true);
    assert.equal(first.draft.settings.A, null);
    assert.equal(first.draft.settings.L, 80);
    assert.equal(first.draft.activities[0].preserved.note, '保留');
    assert.equal(Life.demandHours(first.draft.activities[0]), 116480);
    assert.equal(first.draft.activities[1].timeAmount, null);
    const backup = storage.getItem(Life.KEY_BACKUP);
    storage.setItem('lifeCalculator_activities', '[]');
    const second = Life.bootStorage(storage, '2026-11-08T00:00:00.000Z');
    assert.equal(storage.getItem(Life.KEY_BACKUP), backup);
    assert.equal(second.migrationStatus, 'not-needed');
    assert.equal(storage.getItem('lifeCalculator_zoomLevel'), '125');
    assert.equal(storage.getItem('lifeCalculator_visited'), 'true');
    assert.equal(second.draft.step, 1);
    second.draft.step = 2;
    second.draft.settings.S = 20;
    second.draft.settings.A = 30;
    const saved = Life.saveDraft(storage, second.draft);
    assert.equal(saved.ok, true);
    const reloaded = Life.bootStorage(storage, '2026-11-09T00:00:00.000Z');
    assert.equal(reloaded.draft.step, 2);
    assert.equal(reloaded.draft.settings.A, 30);
    assert.equal(storage.getItem(Life.KEY_BACKUP), backup);
});

test('年龄键缺失不猜 0；显式年龄和损坏年龄分别保留', function () {
    const missing = Life.migrateLegacy({ lifeCalculator_activities: '[]' });
    assert.equal(missing.draft.settings.A, null);
    const known = Life.migrateLegacy({ lifeCalculator_currentAge: '30', lifeCalculator_activities: '[]' });
    assert.equal(known.draft.settings.A, 30);
    const broken = Life.migrateLegacy({ lifeCalculator_currentAge: '三十', lifeCalculator_activities: '[]' });
    assert.equal(broken.draft.settings.A, '三十');
    assert.equal(Life.validateSettings(broken.draft.settings).ok, false);
});

test('损坏的旧活动原文进入草稿并阻断报告，确认排除后才可生成', function () {
    const raw = '{"not":"an array"}';
    const migrated = Life.migrateLegacy({ lifeCalculator_activities: raw });
    assert.equal(migrated.draft.damagedLegacyRaw, raw);
    migrated.draft.settings = settingsForReport();
    const blocked = Life.summarize(migrated.draft.settings, migrated.draft.activities, migrated.draft);
    assert.ok(blocked.blockers.some(function (item) { return item.code === 'legacy-damage'; }));
    const storage = Life.createMemoryStorage({});
    const denied = Life.commitReport(storage, migrated.draft, '2026-11-07T00:00:00.000Z');
    assert.equal(denied.ok, false);
    assert.equal(storage.getItem(Life.KEY_CONFIRMED), null);
    migrated.draft.damageAcknowledged = true;
    const allowed = Life.commitReport(storage, migrated.draft, '2026-11-07T00:00:00.000Z');
    assert.equal(allowed.ok, true);
});

test('缺字段可留在草稿，不按 0 计入，排除前不能生成新报告', function () {
    const storage = Life.createMemoryStorage({ lifeCalculator_activities: legacyActivities() });
    const booted = Life.bootStorage(storage, '2026-11-07T00:00:00.000Z');
    booted.draft.settings = settingsForReport();
    const blocked = Life.commitReport(storage, booted.draft, '2026-11-07T01:00:00.000Z');
    assert.equal(blocked.ok, false);
    assert.equal(storage.getItem(Life.KEY_CONFIRMED), null);
    const summary = Life.summarize(booted.draft.settings, booted.draft.activities, booted.draft);
    assert.equal(summary.T, 116480);
    const fixed = Life.excludeUncalculable(booted.draft.activities[1]);
    booted.draft.activities[1] = fixed.activity;
    const committed = Life.commitReport(storage, booted.draft, '2026-11-07T02:00:00.000Z');
    assert.equal(committed.ok, true);
    assert.equal(committed.snapshot.activities.length, 2);
    const lines = Life.reportLines(committed.snapshot).lines.join('\n');
    assert.match(lines, /缺小时：用户确认排除，不计入统计范围/);
    assert.match(lines, /统计范围：1 项计入，1 项由用户确认排除/);
});

test('备份、草稿、提交和回读失败都不报成功，旧报告与内存草稿还在', function () {
    const original = JSON.stringify({ schemaVersion: 2, kind: 'confirmed', marker: 'old-report', settings: settingsForReport(), activities: [] });
    const backupStorage = Life.createMemoryStorage({ lifeCalculator_activities: legacyActivities() });
    backupStorage.setItem = function () { throw new Error('disk full'); };
    const backupResult = Life.bootStorage(backupStorage, '2026-11-07T00:00:00.000Z');
    assert.equal(backupResult.ok, false);
    assert.equal(backupResult.backupStatus, 'failed');
    assert.equal(backupStorage.getItem(Life.KEY_DRAFT), null);
    assert.equal(backupStorage.getItem(Life.KEY_BACKUP), null);
    assert.match(backupResult.errors.join(' '), /原始备份失败/);

    const draftStorage = Life.createMemoryStorage({ lifeCalculator_activities: '[]', [Life.KEY_BACKUP]: '{"kept":true}' });
    const backupRaw = draftStorage.getItem(Life.KEY_BACKUP);
    draftStorage.setItem = function (key, value) {
        if (key === Life.KEY_DRAFT) {
            throw new Error('draft failed');
        }
        Life.createMemoryStorage().setItem.call({ setItem: Map.prototype.set }, key, value);
    };
    const map = new Map(Object.entries(draftStorage.dump()));
    draftStorage.getItem = function (key) { return map.has(key) ? map.get(key) : null; };
    draftStorage.setItem = function (key, value) {
        if (key === Life.KEY_DRAFT) {
            throw new Error('draft failed');
        }
        map.set(key, String(value));
    };
    draftStorage.removeItem = function (key) { map.delete(key); };
    const draftBoot = Life.bootStorage(draftStorage, '2026-11-07T00:00:00.000Z');
    assert.equal(draftBoot.ok, false);
    assert.equal(draftBoot.draftPersisted, false);
    assert.ok(draftBoot.draft);
    assert.equal(draftStorage.getItem(Life.KEY_BACKUP), backupRaw);
    assert.match(draftBoot.errors.join(' '), /草稿没有写入本机/);

    const reportStorage = Life.createMemoryStorage({ [Life.KEY_CONFIRMED]: original, [Life.KEY_BACKUP]: backupRaw });
    const memoryDraft = Life.emptyDraft();
    memoryDraft.settings = settingsForReport();
    memoryDraft.activities = [{ id: 'read', name: '阅读', timeAmount: 4, frequency: 'weekly', durationYears: 20, color: '#333', group: 'daily', legacy: false, excludedByUser: false }];
    reportStorage.setItem = function () { throw new Error('commit failed'); };
    const failedCommit = Life.commitReport(reportStorage, memoryDraft, '2026-11-07T03:00:00.000Z');
    assert.equal(failedCommit.ok, false);
    assert.equal(failedCommit.previousIntact, true);
    assert.equal(reportStorage.getItem(Life.KEY_CONFIRMED), original);
    assert.equal(memoryDraft.activities[0].timeAmount, 4);

    const mismatch = Life.createMemoryStorage({ [Life.KEY_CONFIRMED]: original });
    mismatch.getItem = function (key) {
        if (key === Life.KEY_CONFIRMED && mismatch.armed) {
            return 'different';
        }
        return Life.createMemoryStorage().getItem ? null : null;
    };
    const box = { confirmed: original };
    const mismatchStorage = {
        getItem: function (key) {
            if (key !== Life.KEY_CONFIRMED) {
                return null;
            }
            if (mismatchStorage.lie) {
                mismatchStorage.lie = false;
                return 'different';
            }
            return box.confirmed;
        },
        setItem: function (key, value) {
            if (key === Life.KEY_CONFIRMED) {
                box.confirmed = String(value);
                mismatchStorage.lie = true;
            }
        },
        removeItem: function () {
            box.confirmed = null;
        }
    };
    const mismatchResult = Life.commitReport(mismatchStorage, memoryDraft, '2026-11-07T04:00:00.000Z');
    assert.equal(mismatchResult.ok, false);
    assert.equal(box.confirmed, original);
    assert.match(mismatchResult.message, /没有提交成功/);
});

test('重复生成替换同一份报告，不把需求叠成两倍', function () {
    const storage = Life.createMemoryStorage({});
    const draft = Life.emptyDraft();
    draft.settings = settingsForReport();
    draft.activities = [{ id: 'read', name: '阅读', timeAmount: 4, frequency: 'weekly', durationYears: 20, color: '#333', group: 'daily', legacy: false, excludedByUser: false }];
    const first = Life.commitReport(storage, draft, '2026-11-07T05:00:00.000Z');
    const second = Life.commitReport(storage, draft, '2026-11-07T06:00:00.000Z');
    assert.equal(first.ok && second.ok, true);
    assert.equal(second.snapshot.activities.length, 1);
    assert.equal(Life.demandHours(second.snapshot.activities[0]), 4160);
    const parsed = JSON.parse(storage.getItem(Life.KEY_CONFIRMED));
    assert.equal(parsed.activities.length, 1);
    assert.notEqual(parsed.committedAt, first.snapshot.committedAt);
});

test('已确认睡眠 8 小时时，草稿改成 7 小时不会改报告和 PNG 文案', function () {
    const storage = Life.createMemoryStorage({});
    const draft = Life.emptyDraft();
    draft.settings = settingsForReport();
    draft.activities = [{ id: 'sleep', name: '睡眠', timeAmount: 8, frequency: 'daily', durationYears: 40, color: '#123456', group: 'daily', legacy: false, excludedByUser: false }];
    const committed = Life.commitReport(storage, draft, '2026-11-07T07:00:00.000Z');
    draft.activities[0].timeAmount = 7;
    const saved = Life.saveDraft(storage, draft);
    assert.equal(saved.ok, true);
    const reloaded = Life.bootStorage(storage, '2026-11-07T08:00:00.000Z');
    assert.equal(reloaded.draft.activities[0].timeAmount, 7);
    assert.equal(reloaded.confirmed.activities[0].timeAmount, 8);
    const lines = Life.reportLines(reloaded.confirmed).lines.join('\n');
    assert.match(lines, /睡眠：116480 小时/);
    assert.doesNotMatch(lines, /睡眠：101920 小时/);
});

test('取消未提交编辑不改变原项；清空草稿不覆盖备份', function () {
    const storage = Life.createMemoryStorage({ lifeCalculator_activities: legacyActivities() });
    const booted = Life.bootStorage(storage, '2026-11-07T00:00:00.000Z');
    const backup = storage.getItem(Life.KEY_BACKUP);
    const original = Life.clone(booted.draft.activities[0]);
    const edited = Life.clone(original);
    edited.timeAmount = 7;
    const cancelled = original;
    assert.equal(cancelled.timeAmount, 8);
    assert.equal(booted.draft.activities[0].timeAmount, 8);
    storage.removeItem(Life.KEY_DRAFT);
    assert.equal(storage.getItem(Life.KEY_BACKUP), backup);
    assert.equal(storage.getItem('lifeCalculator_activities').includes('睡眠'), true);
});

test('V2报告和A原文保留直到V3生成；V2草稿优先且首备份不变',()=>{
 const old={schemaVersion:2,kind:'confirmed',settings:{S:20,A:30,L:80},activities:[]};
 const draft={...Life.emptyDraft(),schemaVersion:2,step:2,settings:{S:20,A:35,L:80}};
 const original=JSON.stringify(old),oldDraft=JSON.stringify(draft);
 const box=Life.createMemoryStorage({lifeCalculator_v2_confirmed:original,lifeCalculator_v2_draft:oldDraft,unrelated:'private'});
 const boot=Life.bootStorage(box);
 assert.equal(boot.confirmed.schemaVersion,2);assert.equal(boot.draft.settings.A,35);
 assert.match(Life.reportLines(boot.confirmed).lines.join(' '),/自然余生 50 年/);
 const backup=box.getItem(Life.KEY_BACKUP);assert.equal(JSON.parse(backup).keys.unrelated,undefined);
 assert.equal(box.getItem(Life.KEY_CONFIRMED),null);
 const submitted=Life.commitReport(box,boot.draft);
 assert.equal(submitted.snapshot.schemaVersion,3);assert.equal(submitted.snapshot.settings.A,35);
 assert.equal(Life.reportLines(submitted.snapshot).summary.budget.D,60);
 assert.equal(box.getItem('lifeCalculator_v2_confirmed'),original);assert.equal(box.getItem('lifeCalculator_v2_draft'),oldDraft);
 assert.equal(box.getItem(Life.KEY_BACKUP),backup);
});
test('回读抛错恢复旧报告，内存草稿不变',()=>{
 const box=Life.createMemoryStorage({[Life.KEY_CONFIRMED]:'old'}),get=box.getItem,set=box.setItem;
 let armed=false;
 box.setItem=(k,v)=>{set(k,v);if(k===Life.KEY_CONFIRMED)armed=true;};
 box.getItem=k=>{if(k===Life.KEY_CONFIRMED&&armed){armed=false;throw Error('read failed');}return get(k);};
 const d=Life.emptyDraft();d.settings={S:30,L:80};
 const before=JSON.stringify(d),r=Life.commitReport(box,d);
 assert.equal(r.ok,false);assert.equal(get(Life.KEY_CONFIRMED),'old');assert.equal(JSON.stringify(d),before);
});
test('损坏原文排除决定和范围进入正式快照及导出文案',()=>{
 const d=Life.emptyDraft();d.settings={S:30,L:80};d.damagedLegacyRaw='{broken';d.damageAcknowledged=true;
 const r=Life.commitReport(Life.createMemoryStorage(),d);
 assert.equal(r.ok,true);assert.equal(r.snapshot.damagedLegacyRaw,'{broken');assert.equal(r.snapshot.scope.damagedRawExcluded,true);
 assert.match(Life.reportLines(r.snapshot).lines.join(' '),/排除无法解析的旧数据/);
});

test('备份读取旧键失败仍可显示原V2报告，不转换或改原文',()=>{
 const old=JSON.stringify({schemaVersion:2,settings:{S:20,A:30,L:80},activities:[]});
 const box=Life.createMemoryStorage({lifeCalculator_v2_confirmed:old}),get=box.getItem;
 box.getItem=key=>{if(key==='lifeCalculator_activities')throw Error('denied');return get(key);};
 const r=Life.bootStorage(box);assert.equal(r.ok,false);assert.equal(r.confirmed.schemaVersion,2);assert.equal(r.confirmed.kind,'confirmed');
 assert.equal(get(Life.KEY_DRAFT),null);assert.equal(get('lifeCalculator_v2_confirmed'),old);
});

test('草稿回读不一致恢复原草稿并保留内存修改',()=>{
 const box=Life.createMemoryStorage({[Life.KEY_DRAFT]:'original-draft'}),get=box.getItem,set=box.setItem;let armed=false;
 box.setItem=(key,value)=>{set(key,value);if(key===Life.KEY_DRAFT)armed=true;};
 box.getItem=key=>{if(key===Life.KEY_DRAFT&&armed){armed=false;return 'mismatch';}return get(key);};
 const d=Life.emptyDraft();d.settings.S=30;const r=Life.saveDraft(box,d);
 assert.equal(r.ok,false);assert.equal(get(Life.KEY_DRAFT),'original-draft');assert.equal(r.draft.settings.S,30);
 assert.match(r.message,/刷新后不会保留/);
});

test('RC: 可解析但结构损坏的草稿/报告不覆盖原文，也不顶替已确认报告',()=>{
 const confirmed=JSON.stringify({schemaVersion:3,kind:'confirmed',settings:{S:30,L:80},activities:[]});
 for(const bad of ['null','{}','[]',JSON.stringify({schemaVersion:3,kind:'draft',settings:{S:30,L:80},activities:null}),JSON.stringify({schemaVersion:3,kind:'draft',settings:{S:30,L:80},activities:[null]})]) {
  const box=Life.createMemoryStorage({[Life.KEY_DRAFT]:bad,[Life.KEY_CONFIRMED]:confirmed});
  const r=Life.bootStorage(box);assert.equal(r.blocked,true);assert.equal(r.draft,null);
  assert.equal(r.confirmed.settings.S,30);assert.equal(box.getItem(Life.KEY_DRAFT),bad);assert.equal(box.getItem(Life.KEY_CONFIRMED),confirmed);
 }
 const box=Life.createMemoryStorage({[Life.KEY_CONFIRMED]:'{}'}),r=Life.bootStorage(box);
 assert.equal(r.blocked,true);assert.equal(r.confirmed,null);assert.equal(box.getItem(Life.KEY_CONFIRMED),'{}');
});

test('RC: 导入重复ID及模板键只修复草稿身份，保留每项需求、原键与首次备份',()=>{
 const acts=[{id:'same',name:'甲',timeAmount:4,frequency:'weekly',durationYears:20,templateKey:'study'},
 {id:'same',name:'乙',timeAmount:2,frequency:'daily',durationYears:30,templateKey:'study'},
 {id:'act_recovered_1',name:'丙',timeAmount:1,frequency:'yearly',durationYears:40}];
 const raw=JSON.stringify({schemaVersion:2,kind:'draft',settings:{S:30,A:35,L:80},activities:acts});
 const box=Life.createMemoryStorage({lifeCalculator_v2_draft:raw});
 const r=Life.bootStorage(box),a=r.draft.activities;
 assert.equal(new Set(a.map(i=>i.id)).size,3);assert.equal(a.length,3);assert.equal(a[0].id,'same');
 assert.equal(a[1].recoveredSourceId,'same');assert.equal(a[1].recoveredTemplateKey,'study');assert.equal(a[1].templateKey,null);
 assert.deepEqual(a.map(Life.demandHours),acts.map(Life.demandHours));assert.equal(box.getItem('lifeCalculator_v2_draft'),raw);
 const backup=box.getItem(Life.KEY_BACKUP);const again=Life.bootStorage(box);
 assert.deepEqual(again.draft.activities.map(i=>i.id),a.map(i=>i.id));assert.equal(box.getItem(Life.KEY_BACKUP),backup);
 const left=a.filter(i=>i.id!==a[0].id);assert.equal(left.length,2);assert.equal(left[0].name,'乙');
});

test('RC: 损坏UI元数据或非文本名称保持原文并停止转换，不会启动后崩溃',()=>{
 for(const extra of [{placeholders:{daily:null,explore:[]}},{unsubmitted:'bad'},{settingsTouched:[]},{activities:[{id:'x',name:{bad:true}}]}]) {
  const raw=JSON.stringify({...Life.emptyDraft(),...extra}),box=Life.createMemoryStorage({[Life.KEY_DRAFT]:raw});
  const r=Life.bootStorage(box);assert.equal(r.blocked,true);assert.equal(r.draft,null);assert.equal(box.getItem(Life.KEY_DRAFT),raw);
 }
});

test('RC: 既有V3草稿修复ID前保留首次原文及歧义未提交编辑，不静默套用到另一项',()=>{
 const a={id:'dup',name:'甲',timeAmount:1,frequency:'weekly',durationYears:20};
 const d={...Life.emptyDraft(),settings:{S:30,L:80},activities:[a,{...a,name:'乙'}],unsubmitted:{editor:{key:'dup',fields:{durationYears:2}}}};
 const raw=JSON.stringify(d,null,2),box=Life.createMemoryStorage({[Life.KEY_DRAFT]:raw});
 const r=Life.bootStorage(box);assert.equal(r.draft.identityRepairSourceRaw,raw);assert.equal(r.draft.unsubmitted.editor,undefined);
 assert.equal(r.draft.identityRepairUnsubmitted.fields.durationYears,2);assert.deepEqual(r.draft.activities.map(a=>a.durationYears),[20,20]);
 Life.saveDraft(box,r.draft);assert.equal(Life.bootStorage(box).draft.identityRepairSourceRaw,raw);
});
