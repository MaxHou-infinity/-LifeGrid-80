'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../js/legacy-model.js');

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

test('年龄边界：S 小于、等于、大于 A 时的起算点和规划年数', function () {
    const youngerStart = budget(20, 30, 80);
    assert.equal(youngerStart.B, 30);
    assert.equal(youngerStart.D, 50);
    const same = budget(30, 30, 80);
    assert.equal(same.B, 30);
    assert.equal(same.D, 50);
    const laterStart = budget(40, 30, 80);
    assert.equal(laterStart.B, 40);
    assert.equal(laterStart.D, 40);
    assert.equal(budget(20, 80, 80).D, 0);
    assert.equal(budget(20, 90, 80).D, 0);
    assert.equal(budget(20, 90, 80).N, 0);
    const changedPast = budget(10, 30, 80);
    assert.equal(changedPast.D, budget(25, 30, 80).D);
});

test('A25 S30 L80 与 20 个等效年需求：55/50/30，另有 5 年未纳入', function () {
    const summary = Life.summarize(
        { S: 30, A: 25, L: 80 },
        [activity({ timeAmount: 24, frequency: 'daily', durationYears: 20, name: '整段需求' })]
    );
    assert.equal(summary.budget.N, 55);
    assert.equal(summary.budget.D, 50);
    assert.equal(summary.budget.futureNotIncluded, 5);
    assert.equal(summary.T, 20 * Life.HOURS_PER_YEAR);
    assert.equal(summary.U, 30 * Life.HOURS_PER_YEAR);
    assert.equal(summary.E, 0);
    assert.equal(summary.identityHolds, true);
    const lines = Life.reportLines({
        settings: { S: 30, A: 25, L: 80 },
        activities: [activity({ timeAmount: 24, frequency: 'daily', durationYears: 20, name: '整段需求' })]
    }).lines.join('\n');
    assert.match(lines, /自然余生 55 年/);
    assert.match(lines, /纳入规划 50 年/);
    assert.match(lines, /尚未纳入规划的未来 5 年/);
    assert.match(lines, /未分配/);
    assert.match(lines, /不是已经证实可以自由支配的时间/);
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
    const partial = endPlan.cells.filter(function (cell) { return cell.year === 30; }).pop();
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
    assert.equal(Life.segmentAt(cell.segments, 0.1).kind, 'past');
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

test('预算从 40 年缩到 20 年后，30 年旧项保留原值并允许生成', function () {
    const legacy = activity({ id: 'old', legacy: true, durationYears: 30, timeAmount: 4, frequency: 'weekly' });
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

test('零预算保留旧项、拒绝新增，缺字段不按 0 计且阻断正式报告', function () {
    const legacy = activity({ id: 'keep', legacy: true, timeAmount: 8, frequency: 'daily', durationYears: 40 });
    const broken = activity({ id: 'broken', legacy: true, timeAmount: null, name: '残缺' });
    const summary = Life.summarize({ S: 20, A: 80, L: 80 }, [legacy, broken]);
    assert.equal(summary.budget.D, 0);
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
    }, after.budget.D);
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
