'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../js/utils.js');

function activity(partial) {
    return Object.assign({
        id: 'act_test',
        name: '阅读',
        timeAmount: 4,
        frequency: 'weekly',
        durationYears: 20,
        color: '#8C4A2F',
        group: 'daily',
        legacy: false,
        excludedByUser: false
    }, partial);
}

function budget(S, A, L) {
    const validation = Life.validateSettings({ S: S, A: A, L: L });
    assert.equal(validation.ok, true);
    return Life.budgetFromValues(validation.values);
}

test('V3只计算选定阶段D=L-S，原A不参与', () => {
    for (const A of [null,25,30,90,'未知']) {
        const sum=Life.summarize({S:30,A,L:80},[]);
        assert.equal(sum.budget.D,50); assert.equal(sum.budget.H,50*8736);
        assert.equal(sum.budget.A,undefined);
    }
});
test('50年阶段睡眠8h每天为400月；再探索2h每天为29.167年', () => {
    const settings={S:30,L:80};
    const sleep=activity({id:'sleep',timeAmount:8,frequency:'daily',durationYears:50});
    const reading=activity({id:'read',timeAmount:2,frequency:'daily',durationYears:50,group:'explore'});
    assert.equal(Life.summarize(settings,[sleep]).U/728,400);
    assert.ok(Math.abs(Life.summarize(settings,[sleep,reading]).U/8736-29.1666666667)<1e-9);
    const lines=Life.reportLines({schemaVersion:3,settings,activities:[sleep,reading]}).lines.join(' ');
    assert.match(lines,/29.167/); assert.doesNotMatch(lines,/自然余生|当前年龄/);
});

test('拒绝空值、非有限值、负数、超范围和超过一位小数，并且不改原值', function () {
    ['', '  ', null, undefined].forEach(function (value) {
        assert.equal(Life.parseAgeInput(value).ok, false);
    });
    ['abc', 'Infinity', 'NaN', '-1', '120.1', '10.12', '1e2'].forEach(function (value) {
        assert.equal(Life.parseAgeInput(value).ok, false, value);
    });
    assert.equal(Life.parseAgeInput('0').value, 0);
    assert.equal(Life.parseAgeInput('30.1').value, 30.1);
    assert.equal(Life.parseAgeInput('120').value, 120);
    const invalid = Life.validateSettings({ S: '30', A: '25', L: '30' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.values, null);
});

test('B30.1 L31 为 46.8 周，首个纳入格后 80% 属于规划，结束边界也按实际交集', function () {
    const summary = Life.summarize({ S: 30.1, A: 30.1, L: 31 }, []);
    assert.equal(summary.budget.D, 0.9);
    assert.equal(Life.formatWeeksFromHours(summary.budget.H), '46.8');
    const plan = Life.gridPlan({ S: 30.1, A: 30.1, L: 31 }, []);
    const first = plan.cells.find(function (cell) {
        return cell.segments.some(function (segment) { return segment.kind === 'unallocated' && segment.endFraction - segment.startFraction > 0; });
    });
    assert.equal(first.year, 30);
    assert.equal(first.week, 5);
    const planning = first.segments.find(function (segment) { return segment.kind === 'unallocated'; });
    assert.ok(Math.abs(planning.startFraction - 0.2) < 1e-9);
    assert.ok(Math.abs(planning.endFraction - 1) < 1e-9);
    const endPlan = Life.gridPlan({ S: 30, A: 30, L: 30.6 }, []);
    const partial = endPlan.cells.filter(function (cell) { return cell.year === 30 && cell.segments.some(s=>s.kind==='unallocated'); }).pop();
    const tail = partial.segments.find(function (segment) { return segment.kind === 'unallocated'; });
    assert.equal(partial.week, 31);
    assert.ok(Math.abs(tail.endFraction - 0.2) < 1e-9);
    const painted = plan.cells.reduce(function (sum, cell) {
        return sum + cell.segments.filter(function (segment) { return segment.kind === 'unallocated'; })
            .reduce(function (inner, segment) { return inner + segment.hours; }, 0);
    }, 0);
    assert.ok(Math.abs(painted - summary.budget.H) < 1e-6);
});

test('同一格跨过历史并包含两个活动时，按位置选中对应活动', function () {
    const activities = [
        activity({ id: 'one', name: '甲', timeAmount: 26, frequency: 'yearly', durationYears: 1 }),
        activity({ id: 'two', name: '乙', timeAmount: 26, frequency: 'yearly', durationYears: 1 })
    ];
    const plan = Life.gridPlan({ S: 30.1, A: 30.1, L: 31 }, activities);
    const cell = plan.cells.find(function (item) { return item.year === 30 && item.week === 5; });
    assert.equal(Life.segmentAt(cell.segments, 0.1).kind, 'outside');
    assert.equal(Life.segmentAt(cell.segments, 0.25).activityId, 'one');
    assert.equal(Life.segmentAt(cell.segments, 0.45).activityId, 'two');
    const history = plan.cells.find(function (item) { return item.year === 20 && item.week === 0; });
    assert.equal(history.segments.some(function (segment) { return segment.kind === 'activity'; }), false);
});

test('520 周预算对 600 周需求只警示 80 周超额，格子不超过预算', function () {
    const activities = [
        activity({ id: 'fill', name: '铺满', timeAmount: 24, frequency: 'daily', durationYears: 10 }),
        activity({ id: 'extra', name: '超出', timeAmount: 1344, frequency: 'yearly', durationYears: 10 })
    ];
    const summary = Life.summarize({ S: 20, A: 20, L: 30 }, activities);
    assert.equal(summary.budget.D * 52, 520);
    assert.equal(summary.T / Life.HOURS_PER_WEEK, 600);
    assert.equal(summary.E / Life.HOURS_PER_WEEK, 80);
    assert.equal(summary.U, 0);
    assert.equal(summary.identityHolds, true);
    assert.equal(summary.blockers.length, 0);
    assert.equal(summary.claimsFullyValid, false);
    const plan = Life.gridPlan({ S: 20, A: 20, L: 30 }, activities);
    assert.ok(Math.abs(plan.paintedHours - summary.budget.H) < 1e-6);
    assert.equal(plan.overflow.length, 1);
    assert.equal(plan.overflow[0].activityId, 'extra');
    assert.ok(Math.abs(plan.overflow[0].hours - summary.E) < 1e-6);
});

test('预算从40缩20年，非legacy既有项也保留30年原值', function () {
    const legacy = activity({ id: 'old', legacy: false, durationYears: 30, timeAmount: 4, frequency: 'weekly' });
    const wide = Life.summarize({ S: 20, A: 20, L: 60 }, [legacy]);
    const narrow = Life.summarize({ S: 20, A: 20, L: 40 }, [legacy]);
    assert.equal(wide.T, narrow.T);
    assert.equal(narrow.T, 4 * 52 * 30);
    assert.equal(narrow.items[0].status, 'over-horizon');
    assert.equal(narrow.blockers.length, 0);
    assert.equal(narrow.claimsFullyValid, false);
    const rejected = Life.validateActivityInput({
        name: '旧项', timeAmount: '4', frequency: 'weekly', durationYears: '30'
    }, narrow.budget.D);
    assert.equal(rejected.ok, false);
    const accepted = Life.validateActivityInput({
        name: '旧项', timeAmount: '4', frequency: 'weekly', durationYears: '20'
    }, narrow.budget.D);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.value.durationYears, 20);
    assert.equal(legacy.durationYears, 30);
});

test('旧显示周数来自 floor，新合计保留小数', function () {
    const daily = activity({ timeAmount: 8, frequency: 'daily', durationYears: 40 });
    const weekly = activity({ timeAmount: 4, frequency: 'weekly', durationYears: 20 });
    const monthly = activity({ timeAmount: 4, frequency: 'monthly', durationYears: 10 });
    assert.equal(Life.demandHours(daily), 116480);
    assert.equal(Life.legacyFlooredWeeks(daily), 693);
    assert.equal(Life.formatWeeksFromHours(Life.demandHours(daily)), '693.333');
    assert.equal(Life.demandHours(weekly), 4160);
    assert.equal(Life.legacyFlooredWeeks(weekly), 24);
    assert.equal(Life.formatWeeksFromHours(4160), '24.762');
    assert.equal(Life.demandHours(monthly), 480);
    assert.equal(Life.legacyFlooredWeeks(monthly), 2);
    assert.equal(Life.formatWeeksFromHours(480), '2.857');
});

test('分组移动和重复写入不复制活动，需求保持 4160 小时', function () {
    const reading = activity({ id: 'read', name: '阅读', group: 'daily' });
    const moved = Life.moveGroup([reading], 'read', 'explore');
    assert.equal(moved.length, 1);
    assert.equal(moved[0].id, 'read');
    assert.equal(moved[0].group, 'explore');
    assert.equal(Life.demandHours(moved[0]), 4160);
    const again = Life.upsertActivity(moved, Object.assign({}, moved[0], { group: 'supplement' }));
    assert.equal(again.length, 1);
    assert.equal(Life.demandHours(again[0]), 4160);
    const changes = Life.diffActivities([reading], again);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, 'group-only');
    assert.equal(changes[0].hoursSame, true);
});

test('缺字段不按0计且阻断正式报告，只有显式排除才可生成', function () {
    const legacy = activity({ id: 'keep', legacy: true, timeAmount: 8, frequency: 'daily', durationYears: 40 });
    const broken = activity({ id: 'broken', legacy: true, timeAmount: null, name: '残缺' });
    const summary = Life.summarize({ S: 20, A: 80, L: 80 }, [legacy, broken]);
    assert.equal(summary.budget.D, 60);
    assert.equal(summary.T, Life.demandHours(legacy));
    assert.equal(summary.items[1].hours, null);
    assert.ok(summary.blockers.some(function (item) { return item.code === 'uncalculable'; }));
    const excluded = Life.excludeUncalculable(broken);
    assert.equal(excluded.ok, true);
    const after = Life.summarize({ S: 20, A: 80, L: 80 }, [legacy, excluded.activity]);
    assert.equal(after.blockers.length, 0);
    assert.equal(after.T, Life.demandHours(legacy));
    assert.equal(after.claimsFullyValid, false);
    const added = Life.validateActivityInput({
        name: '新的', timeAmount: '1', frequency: 'weekly', durationYears: '1'
    }, 0);
    assert.equal(added.ok, false);
    assert.equal(Life.excludeUncalculable(legacy).ok, false);
});

test('未填写的模板不会自己变成活动', function () {
    const draft = Life.emptyDraft();
    assert.equal(draft.activities.length, 0);
    assert.equal(Life.TEMPLATES.length, 16);
    assert.equal(Life.summarize(draft.settings, draft.activities).T, 0);
});

test('指针按画布与显示尺寸的比例命中，缩放后不会偏到左上', function () {
    const cellSize = 10;
    const margin = 2;
    const stride = cellSize + margin;
    const canvasWidth = 52 * stride;
    const canvasHeight = 80 * stride;
    const rectWidth = canvasWidth * 0.5;
    const rectHeight = canvasHeight * 0.9;
    const col = 10;
    const row = 6;
    const offsetX = (col * stride + cellSize / 2) * (rectWidth / canvasWidth);
    const offsetY = (row * stride + cellSize / 2) * (rectHeight / canvasHeight);
    const hit = Life.locatePointer({
        offsetX: offsetX,
        offsetY: offsetY,
        rectWidth: rectWidth,
        rectHeight: rectHeight,
        canvasWidth: canvasWidth,
        canvasHeight: canvasHeight,
        cellSize: cellSize,
        margin: margin
    });
    assert.equal(hit.col, col);
    assert.equal(hit.row, row);
    const naiveCol = Math.floor(offsetX / stride);
    assert.notEqual(naiveCol, col);
});

test('小数时长不在网格提前截断；一格支持超过20个活动',()=>{
 const a=Array.from({length:35},(_,i)=>activity({id:'a'+i,timeAmount:0.1,frequency:'yearly',durationYears:0.123}));
 const sum=Life.summarize({S:30.1,L:31},a),plan=Life.gridPlan({S:30.1,L:31},a);
 assert.ok(Math.abs(plan.paintedHours-sum.T)<1e-8);
 assert.equal(plan.cells.find(c=>c.year===30&&c.week===5).segments.filter(s=>s.kind==='activity').length,35);
});

test('周期小时上限、非法值与小数年限校验',()=>{
 for(const [frequency,max] of Object.entries(Life.PERIOD_MAX_HOURS)) {
  assert.equal(Life.validateActivityInput({name:'项目',timeAmount:max,frequency,durationYears:.25},.9).ok,true);
  assert.equal(Life.validateActivityInput({name:'项目',timeAmount:max+.1,frequency,durationYears:.25},.9).ok,false);
 }
 for(const value of ['NaN','Infinity','-1','0','1.11','1e2',''])assert.equal(Life.parseHourInput(value,24).ok,false);
 assert.equal(Life.validateActivityInput({name:'项目',timeAmount:1,frequency:'unknown',durationYears:1},50).ok,false);
 assert.equal(Life.parseDurationInput('0.123',.9).value,.123);
});

test('图谱按日常→探索顺序，插入顺序不改变分配范围',()=>{
 const a=[activity({id:'explore',group:'explore',durationYears:1}),activity({id:'daily',durationYears:1})];
 const plan=Life.gridPlan({S:30,L:31},a);
 assert.equal(plan.cells.find(c=>c.year===30&&c.week===0).segments[0].activityId,'daily');
 assert.equal(plan.cells.some(c=>c.year<30&&c.segments.some(s=>s.kind==='activity')),false);
});

test('多组小数阶段保持预算恒等式、图谱不越界且需求不变',()=>{
 for(let i=1;i<=25;i++) {
  const settings={S:20+i/10,L:23+(i%5)/10};
  const acts=[activity({id:'a',timeAmount:i%24+.1,frequency:'daily',durationYears:.1*i}),activity({id:'b',timeAmount:100.1,frequency:'yearly',durationYears:1.123,group:'explore'})];
  const s=Life.summarize(settings,acts),g=Life.gridPlan(settings,acts);
  assert.equal(s.identityHolds,true);assert.ok(Math.abs(g.paintedHours-Math.min(s.T,s.budget.H))<1e-6);
  for(const c of g.cells)for(const seg of c.segments){assert.ok(seg.startFraction>=-1e-9&&seg.endFraction<=1+1e-9);}
 }
});

test('RC: 绕过草稿修复的重复ID阻断提交，不能合并或忽略原项',()=>{
 const d=Life.emptyDraft();d.settings={S:30,L:80};d.activities=[activity({id:'duplicate'}),activity({id:'duplicate',name:'另一项'})];
 const s=Life.summarize(d.settings,d.activities);assert.equal(s.T,8320);assert.ok(s.blockers.some(i=>i.code==='activity-id'));
 const box=Life.createMemoryStorage({[Life.KEY_CONFIRMED]:'keep'});assert.equal(Life.commitReport(box,d).ok,false);assert.equal(box.getItem(Life.KEY_CONFIRMED),'keep');
});

test('RC: 空活动报告保持全阶段未分配；极端原始字段不得产生Infinity需求',()=>{
 const s=Life.summarize({S:30,L:80},[]);assert.equal(s.T,0);assert.equal(s.U/728,600);assert.equal(s.E,0);assert.equal(s.blockers.length,0);
 const huge=activity({timeAmount:24,frequency:'daily',durationYears:'1'+'0'.repeat(307)});
 const bad=Life.summarize({S:30,L:80},[huge]);assert.equal(bad.items[0].status,'uncalculable');assert.equal(bad.items[0].hours,null);assert.equal(bad.complete,false);
 const d=Life.emptyDraft();d.settings={S:30,L:80};d.damagedLegacyRaw='{broken';d.damageAcknowledged=true;
 assert.equal(Life.summarize(d.settings,[],d).claimsFullyValid,false);
});


test('RC: 多项巨大但各自有限的原值合计溢出时阻断，不能显示完整余额',()=>{
 const a=activity({timeAmount:24,frequency:'daily',durationYears:'1'+'0'.repeat(304)});
 assert.ok(Number.isFinite(Life.demandHours(a)));
 const s=Life.summarize({S:30,L:80},[a,{...a,id:'b'},{...a,id:'c'}]);
 assert.equal(s.complete,false);assert.equal(s.U,null);assert.equal(s.E,null);assert.ok(s.blockers.some(b=>b.code==='demand-overflow'));
});
