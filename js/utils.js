/**
 * 人生计算器纯模型。
 * 浏览器通过 script 标签得到 window.LifeModel；Node 测试通过 module.exports 引用。
 * 这里不碰 DOM，也不直接读写 localStorage，方便把验例和存储失败隔离跑完。
 *
 * 调查到的旧键（只存在于本工具，不是全站键）：
 * - lifeCalculator_activities  活动数组 JSON
 * - lifeCalculator_zoomLevel   缩放百分比字符串
 * - lifeCalculator_currentAge  年龄字符串；页面从未调用保存，缺键表示年龄未知
 * - lifeCalculator_visited     是否看过欢迎提示
 * 旧活动对象由保存函数写入：id、name、timeAmount、frequency、durationYears、color。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.LifeModel = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // 一年固定 52 周 = 364 天 = 8736 小时，一月是年的十二分之一。
    const WEEKS_PER_YEAR = 52;
    const DAYS_PER_YEAR = 364;
    const HOURS_PER_WEEK = 168;
    const HOURS_PER_YEAR = 8736;
    const HOURS_PER_MONTH = 728;
    const PERIODS_PER_YEAR = { daily: 364, weekly: 52, monthly: 12, yearly: 1 };
    const PERIOD_MAX_HOURS = { daily: 24, weekly: 168, monthly: 728, yearly: 8736 };
    const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
    const GROUPS = ['daily', 'supplement', 'explore'];

    const LEGACY_KEYS = [
        'lifeCalculator_activities',
        'lifeCalculator_zoomLevel',
        'lifeCalculator_currentAge',
        'lifeCalculator_visited',
        'lifeCalculator_v2_rawBackup', 'lifeCalculator_v2_draft', 'lifeCalculator_v2_confirmed', 'lifeCalculator_v2_zoom'
    ];
    const KEY_BACKUP = 'lifeCalculator_v3_rawBackup';
    const KEY_DRAFT = 'lifeCalculator_v3_draft';
    const KEY_CONFIRMED = 'lifeCalculator_v3_confirmed';
    const KEY_ZOOM = 'lifeCalculator_v3_zoom';

    // 旧界面把总小时除以 168 后提前 floor，再封顶 80*52。小时公式本身与现在一致。
    const LEGACY_ROUNDING_NOTE = '旧版小时公式与现在相同：每天按 364 天（7×52）、每周 52 次、每月 12 次、每年 1 次，再除以每周 168 小时。差异来自显示前的 Math.floor，以及最多 80×52 周的封顶。8 小时/天×40 年是 116480 小时，精确约 693.333 周，旧界面显示 693 周；4 小时/周×20 年是 4160 小时，精确约 24.762 周，旧界面显示 24 周；4 小时/月×10 年是 480 小时，精确约 2.857 周，旧界面显示 2 周。';

    const TEMPLATES = [
        { key: 'sleep', name: '睡眠' },
        { key: 'meals', name: '吃饭' },
        { key: 'hygiene', name: '洗漱如厕' },
        { key: 'work', name: '工作' },
        { key: 'commute', name: '通勤' },
        { key: 'chores', name: '家务' },
        { key: 'care', name: '照护' },
        { key: 'health', name: '就医保健' },
        { key: 'exercise', name: '运动' },
        { key: 'shorts', name: '手机短视频' },
        { key: 'media', name: '影视游戏' },
        { key: 'social', name: '社交' },
        { key: 'family', name: '伴侣家人' },
        { key: 'study', name: '阅读学习' },
        { key: 'travel', name: '旅行' },
        { key: 'margin', name: '留白' }
    ];

    // Categorical chart colors only; UI chrome keeps the website palette. Teal/neutral states stay reserved.
    const COLORS = ['#20364b','#b86728','#803e75','#c10020','#007d34','#00538a',
        '#f6768e','#cea262','#53377a','#93aa00','#b32851','#ff6800',
        '#817066','#593315','#4f83cc','#d8b500','#7f180d','#9c83c9',
        '#598b50','#e3a17a','#aa5d9e','#637a91','#646b22','#d34d5b'];
    const RESERVED_COLORS = ['#d9d2c5','#dde2e7','#c5d0db','#16859a','#e8edf1'];
    function nextActivityColor(activities, id) {
        const used = new Set((activities || []).map(a => String(a.color || '').toLowerCase()).concat(RESERVED_COLORS));
        const available = COLORS.find(c => !used.has(c));
        if (available) return available;
        // Beyond 24, derive new RGB values from identity and refuse exact collisions/state colors.
        let seed = 2166136261;
        for (const c of String(id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
        for (let n = 0; n < 0xffffff; n++) {
            const color = '#' + ((seed + n * 2654435761) >>> 0 & 0xffffff).toString(16).padStart(6, '0');
            if (!used.has(color)) return color;
        }
        throw new Error('No distinct activity color available');
    }
    function ensureActivityColors(activities) {
        const used = new Set(RESERVED_COLORS), pending = [];
        // Identity ordering makes repair independent of display/reorder order; only drafts call this.
        [...activities].sort((a,b) => String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0).forEach(a => {
            const color = String(a.color || '').toLowerCase();
            if (/^#[0-9a-f]{6}$/.test(color) && !used.has(color)) used.add(color);
            else pending.push(a);
        });
        pending.forEach(a => { a.color = nextActivityColor([...used].map(color => ({color})), a.id); used.add(a.color); });
        return activities;
    }

    const FORMULA_NOTE = '一年按 52 周 = 364 天 = 8736 小时近似，一个月 = 728 小时，一周 = 168 小时。合计使用未取整的小时，画面上的四舍五入不写回合计。连续着色只是等效时间比较，不表示活动发生在这些周，格子也不是真实日期。';
    const UNALLOCATED_NOTE = '未分配是规划预算里还没写上活动的等效时间，不是已经证实可以自由支配的时间，也不等于自然余生。';

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createId(rng) {
        const random = typeof rng === 'function' ? rng : Math.random;
        return 'act_' + Date.now().toString(36) + '_' + Math.floor(random() * 1e9).toString(36);
    }

    function trimFixed(value, decimals) {
        const factor = 10 ** decimals;
        const rounded = Math.round(value * factor) / factor;
        return String(rounded);
    }

    function formatYears(value) {
        return trimFixed(value, 1).replace(/\.0$/, '');
    }

    function formatHours(value) {
        return trimFixed(value, 2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    }

    function formatWeeksFromHours(hours) {
        return trimFixed(hours / HOURS_PER_WEEK, 3);
    }

    function parseDecimalText(raw) {
        if (raw === null || raw === undefined) {
            return { ok: false, code: 'empty', message: '不能为空' };
        }
        const text = String(raw).trim();
        if (text === '') {
            return { ok: false, code: 'empty', message: '不能为空' };
        }
        if (text.startsWith('-')) {
            return { ok: false, code: 'negative', message: '不能是负数' };
        }
        if (!/^\d+(\.\d+)?$/.test(text)) {
            return { ok: false, code: 'format', message: '需要是有限数字，不能带空格或单位' };
        }
        const decimals = text.includes('.') ? text.split('.')[1].length : 0;
        const value = Number(text);
        if (!Number.isFinite(value)) {
            return { ok: false, code: 'nonfinite', message: '需要是有限数字' };
        }
        return { ok: true, value: value, decimals: decimals, text: text };
    }

    function parseAgeInput(raw) {
        const parsed = parseDecimalText(raw);
        if (!parsed.ok) {
            return parsed;
        }
        if (parsed.decimals > 1) {
            return { ok: false, code: 'precision', message: '最多一位小数，不会自动帮你改短' };
        }
        if (parsed.value > 120) {
            return { ok: false, code: 'range', message: '需要在 0 到 120 岁之间' };
        }
        return { ok: true, value: parsed.value };
    }

    function parseHourInput(raw, maxHours) {
        const parsed = parseDecimalText(raw);
        if (!parsed.ok) {
            return parsed;
        }
        if (parsed.decimals > 1) {
            return { ok: false, code: 'precision', message: '小时数最多一位小数，不会自动改值' };
        }
        if (parsed.value <= 0) {
            return { ok: false, code: 'nonpositive', message: '已启用的活动必须大于 0 小时' };
        }
        if (parsed.value > maxHours) {
            return { ok: false, code: 'range', message: '不能超过这个周期的上限 ' + maxHours + ' 小时' };
        }
        return { ok: true, value: parsed.value };
    }

    function parseDurationInput(raw, maxYears) {
        const parsed = parseDecimalText(raw);
        if (!parsed.ok) {
            return parsed;
        }
        if (parsed.value <= 0) {
            return { ok: false, code: 'nonpositive', message: '持续年数必须大于 0' };
        }
        if (!Number.isFinite(maxYears)) {
            return { ok: false, code: 'no-budget', message: '请先把阶段设置填写成合法数值，才能确认持续年数' };
        }
        if (parsed.value > maxYears + 1e-9) {
            return { ok: false, code: 'range', message: '持续年数不能超过当前纳入规划的 ' + formatYears(maxYears) + ' 年' };
        }
        return { ok: true, value: parsed.value };
    }

    function validateSettings(settings) {
        const source = settings || {};
        const errors = [];
        const parsed = {};
        [['S', '自主规划起点'], ['L', '预计人生岁数']].forEach(function (pair) {
            const result = parseAgeInput(source[pair[0]]);
            if (!result.ok) {
                errors.push({ field: pair[0], code: result.code, message: pair[1] + '：' + result.message });
            } else {
                parsed[pair[0]] = result.value;
            }
        });
        if (parsed.S !== undefined && parsed.L !== undefined && !(parsed.S < parsed.L)) {
            errors.push({ field: 'S', code: 'order', message: '自主规划起点必须小于预计人生长度' });
        }
        return {
            ok: errors.length === 0,
            errors: errors,
            values: errors.length === 0 ? parsed : null
        };
    }

    function budgetFromValues(values) {
        // 合法年龄最多一位小数，用“十分之一岁”做整数运算，避免 31-30.1 变成 0.899999。
        const S = Math.round(values.S * 10) / 10;
        const L = Math.round(values.L * 10) / 10;
        const D = (Math.round(L * 10) - Math.round(S * 10)) / 10;
        return { S, L, B: S, D, H: D * HOURS_PER_YEAR };
    }

    function knownFrequency(frequency) {
        return Object.prototype.hasOwnProperty.call(PERIODS_PER_YEAR, frequency);
    }

    function fieldIssues(activity) {
        const issues = [];
        const item = activity || {};
        if (!String(item.name || '').trim()) issues.push('缺少活动名称');
        if (!knownFrequency(item.frequency)) issues.push('频率无法识别');
        const amount = parseHourInput(item.timeAmount, PERIOD_MAX_HOURS[item.frequency] || HOURS_PER_YEAR);
        if (!amount.ok) issues.push('每周期小时数：' + amount.message);
        const duration = parseDecimalText(item.durationYears);
        if (!duration.ok || duration.value <= 0) issues.push('缺少合法持续年数');
        if (amount.ok && duration.ok && knownFrequency(item.frequency) &&
            !Number.isFinite(amount.value * PERIODS_PER_YEAR[item.frequency] * duration.value)) {
            issues.push('总需求超出可计算数值范围');
        }
        return issues;
    }

    function demandHours(activity) {
        if (!activity || activity.excludedByUser) {
            return null;
        }
        if (fieldIssues(activity).length > 0) {
            return null;
        }
        return Number(activity.timeAmount) * PERIODS_PER_YEAR[activity.frequency] * Number(activity.durationYears);
    }

    function legacyFlooredWeeks(activity) {
        const hours = Number(activity.timeAmount) * PERIODS_PER_YEAR[activity.frequency] * Number(activity.durationYears);
        return Math.min(Math.floor(hours / HOURS_PER_WEEK), 80 * WEEKS_PER_YEAR);
    }

    function activityStatus(activity, budget) {
        if (activity.excludedByUser) {
            return 'excluded';
        }
        if (fieldIssues(activity).length > 0) {
            return 'uncalculable';
        }
        if (budget && Number(activity.durationYears) > budget.D + 1e-9) {
            return 'over-horizon';
        }
        return 'ok';
    }

    function summarize(settings, activities, meta) {
        const list = Array.isArray(activities) ? activities : [];
        const flags = meta || {};
        const validation = validateSettings(settings);
        const budget = validation.ok ? budgetFromValues(validation.values) : null;
        const items = list.map(function (activity) {
            const issues = fieldIssues(activity);
            const status = activityStatus(activity, budget);
            const hours = status === 'excluded' || status === 'uncalculable' ? null : demandHours(activity);
            return {
                id: activity.id,
                name: activity.name || '',
                group: activity.group || 'daily',
                legacy: Boolean(activity.legacy),
                status: status,
                issues: issues,
                hours: hours,
                color: activity.color || null,
                timeAmount: activity.timeAmount,
                frequency: activity.frequency,
                durationYears: activity.durationYears,
                excludedByUser: Boolean(activity.excludedByUser)
            };
        });
        let demand = 0;
        let counted = 0;
        items.forEach(function (item) {
            if (item.hours !== null) {
                demand += item.hours;
                counted += 1;
            }
        });
        const names = {};
        const duplicateNames = [];
        items.forEach(function (item) {
            const key = item.name.trim();
            if (!key || item.status === 'excluded') {
                return;
            }
            names[key] = (names[key] || 0) + 1;
        });
        Object.keys(names).forEach(function (name) {
            if (names[name] > 1) {
                duplicateNames.push(name);
            }
        });
        const uncalculable = items.filter(function (item) { return item.status === 'uncalculable'; });
        const overHorizon = items.filter(function (item) { return item.status === 'over-horizon'; });
        const excluded = items.filter(function (item) { return item.status === 'excluded'; });
        const warnings = [];
        const blockers = validation.errors.slice();
        const ids = new Set();
        const invalidIds = list.some(function (item) {
            if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) return true;
            ids.add(item.id);
            return false;
        });
        if (invalidIds) {
            blockers.push({ field: 'activities', code: 'activity-id', message: '活动标识缺失或重复，请重新打开草稿修复后再生成；不会合并或忽略这些项目。' });
        }
        const demandValid = Number.isFinite(demand);
        if (!demandValid) blockers.push({ field: 'activities', code: 'demand-overflow', message: '需求合计超出可计算数值范围，请检查原始项目；本次不能生成报告。' });
        const damage = Boolean(flags.damagedLegacyRaw) && !flags.damageAcknowledged;
        if (damage) {
            blockers.push({ field: 'legacy', code: 'legacy-damage', message: '有一段旧数据无法解析，已原样留在草稿和原始备份里。补正前不能生成新报告，除非你明确确认排除这段损坏数据。' });
        }
        if (uncalculable.length > 0) {
            blockers.push({ field: 'activities', code: 'uncalculable', message: '有 ' + uncalculable.length + ' 项缺少可精确计算的原始字段。它们不会被当成 0。请补全，或在看清影响后明确排除。' });
        }
        let unallocated = null;
        let excess = null;
        let identityHolds = false;
        if (budget && demandValid) {
            unallocated = Math.max(budget.H - demand, 0);
            excess = Math.max(demand - budget.H, 0);
            identityHolds = Math.abs((demand + unallocated) - (budget.H + excess)) < 1e-6;
            if (excess > 0) {
                warnings.push({ code: 'over-allocation', message: '需求超出规划预算 ' + formatHours(excess) + ' 小时（约 ' + formatWeeksFromHours(excess) + ' 周）。超配只作警示，活动不会被裁短。' });
            }
            if (budget.D === 0) {
                warnings.push({ code: 'zero-budget', message: '纳入规划为 0 年。已有活动仍保留，不能新增活动；可以修改设置，也可以生成带零预算警示的报告。' });
            }
            if (budget.futureNotIncluded > 0) {
                warnings.push({ code: 'future-not-included', message: '从当前年龄到规划起点之间还有 ' + formatYears(budget.futureNotIncluded) + ' 年未来没有纳入这次规划预算。' });
            }
        }
        if (overHorizon.length > 0) {
            warnings.push({ code: 'over-horizon', message: '有 ' + overHorizon.length + ' 项持续年数长于现在的规划期。仍按原值计入需求，并标成有待修正，不是最终有效分配。保存设置和生成警示报告都不要求先删除。' });
        }
        if (flags.damagedLegacyRaw && flags.damageAcknowledged) warnings.push({ code: 'damage-excluded', message: '用户已明确排除无法解析的旧数据，统计范围不完整。' });
        if (excluded.length > 0) {
            warnings.push({ code: 'excluded', message: '有 ' + excluded.length + ' 项已由你确认排除，没有按 0 小时计入需求。' });
        }
        if (duplicateNames.length > 0) {
            warnings.push({ code: 'duplicate-name', message: '这些名称出现了多次：' + duplicateNames.join('、') + '。同名不会自动合并，同一小时只应计算一次，这里不会自动去重。' });
        }
        if (uncalculable.length > 0) {
            warnings.push({ code: 'incomplete', message: '目前只能统计其中 ' + counted + ' 项。统计不完整，不能把缺字段的项看成 0。' });
        }
        const claimsFullyValid = Boolean(budget) && blockers.length === 0 && overHorizon.length === 0 && excluded.length === 0 && !flags.damagedLegacyRaw && !(budget && (budget.D === 0 || excess > 0));
        return {
            ok: Boolean(budget),
            settingsErrors: validation.errors,
            budget: budget,
            items: items,
            T: demand,
            U: unallocated,
            E: excess,
            counted: counted,
            identityHolds: identityHolds,
            complete: uncalculable.length === 0 && !damage && demandValid,
            duplicateNames: duplicateNames,
            warnings: warnings,
            blockers: blockers,
            claimsFullyValid: claimsFullyValid
        };
    }

    function validateActivityInput(input, budgetYears) {
        const errors = [];
        const name = input && input.name !== undefined ? String(input.name).trim() : '';
        if (!name) {
            errors.push({ field: 'name', code: 'empty', message: '请填写活动名称' });
        }
        const frequency = input ? input.frequency : '';
        if (!knownFrequency(frequency)) {
            errors.push({ field: 'frequency', code: 'frequency', message: '请选择每天、每周、每月或每年' });
        }
        const maxHours = knownFrequency(frequency) ? PERIOD_MAX_HOURS[frequency] : HOURS_PER_YEAR;
        const hours = parseHourInput(input ? input.timeAmount : '', maxHours);
        if (!hours.ok && knownFrequency(frequency)) {
            errors.push({ field: 'timeAmount', code: hours.code, message: hours.message });
        }
        if (!knownFrequency(frequency) && input && input.timeAmount !== undefined && String(input.timeAmount).trim() !== '') {
            const loose = parseDecimalText(input.timeAmount);
            if (!loose.ok || loose.decimals > 1 || loose.value <= 0) {
                errors.push({ field: 'timeAmount', code: loose.ok ? 'range' : loose.code, message: loose.ok ? '小时数需要大于 0，且最多一位小数' : loose.message });
            }
        }
        const duration = parseDurationInput(input ? input.durationYears : '', budgetYears);
        if (!duration.ok) {
            errors.push({ field: 'durationYears', code: duration.code, message: duration.message });
        }
        if (errors.length > 0) {
            return { ok: false, errors: errors };
        }
        return {
            ok: true,
            errors: [],
            value: {
                name: name,
                timeAmount: hours.value,
                frequency: frequency,
                durationYears: duration.value
            }
        };
    }

    function upsertActivity(activities, activity) {
        const next = activities.slice();
        const index = next.findIndex(function (item) { return item.id === activity.id; });
        if (index === -1) {
            next.push(activity);
        } else {
            next[index] = activity;
        }
        return next;
    }

    function moveGroup(activities, id, group) {
        if (GROUPS.indexOf(group) === -1) {
            return activities.slice();
        }
        return activities.map(function (activity) {
            if (activity.id !== id) {
                return activity;
            }
            const next = clone(activity);
            next.group = group;
            return next;
        });
    }

    function excludeUncalculable(activity) {
        if (fieldIssues(activity).length === 0) {
            return { ok: false, message: '这项可以计算，不能用排除来把它改成 0。' };
        }
        const next = clone(activity);
        next.excludedByUser = true;
        return { ok: true, activity: next };
    }

    function weekTenths(age) {
        return Math.round(Number(age) * 10) * WEEKS_PER_YEAR;
    }

    function segmentAt(segments, fraction) {
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            if (fraction >= segment.startFraction && fraction < segment.endFraction) {
                return segment;
            }
        }
        return segments.length > 0 ? segments[segments.length - 1] : null;
    }

    function legacyModel() {
        return typeof module === 'object' && module.exports ? require('./legacy-model.js') : globalThis.LegacyLifeModel;
    }

    function gridPlan(settings, activities, version) {
        if (version === 2) return legacyModel().gridPlan(settings, activities);
        const validation = validateSettings(settings);
        if (!validation.ok) return { ok: false, errors: validation.errors, cells: [] };
        const budget = budgetFromValues(validation.values);
        const rowCount = Math.ceil(budget.L);
        const ordered = (activities || []).filter(i => i.group !== 'explore').concat((activities || []).filter(i => i.group === 'explore'));
        const queue = ordered.map(item => ({ id: item.id, left: demandHours(item) }))
            .filter(item => item.left !== null && item.left > 0);
        const cells = [];
        let paintedHours = 0;
        const start = budget.S * HOURS_PER_YEAR, end = budget.L * HOURS_PER_YEAR;
        for (let year = 0; year < rowCount; year++) {
            for (let week = 0; week < 52; week++) {
                const cellStart = (year * 52 + week) * 168;
                const cellEnd = cellStart + 168;
                const segments = [];
                function span(a, b, kind, id) {
                    if (b - a < 1e-8) return;
                    segments.push({ kind, activityId: id || null, hours: b - a,
                        startFraction: (a - cellStart) / 168, endFraction: (b - cellStart) / 168 });
                }
                span(cellStart, Math.min(cellEnd, start), 'outside');
                let cursor = Math.max(cellStart, start);
                const stop = Math.min(cellEnd, end);
                while (cursor < stop - 1e-8 && queue.length) {
                    const use = Math.min(stop - cursor, queue[0].left);
                    span(cursor, cursor + use, 'activity', queue[0].id);
                    cursor += use; paintedHours += use; queue[0].left -= use;
                    if (queue[0].left < 1e-8) queue.shift();
                }
                span(cursor, stop, 'unallocated');
                span(Math.max(cellStart, end), cellEnd, 'outside');
                cells.push({ year, week, segments });
            }
        }
        return { ok: true, budget, rowCount, cells, paintedHours,
            overflow: queue.map(item => ({ activityId: item.id, hours: item.left })) };
    }

    function locatePointer(input) {
        if (!input || !(input.rectWidth > 0) || !(input.rectHeight > 0)) {
            return null;
        }
        const x = input.offsetX * (input.canvasWidth / input.rectWidth);
        const y = input.offsetY * (input.canvasHeight / input.rectHeight);
        const stride = input.cellSize + input.margin;
        if (x < 0 || y < 0 || x >= input.canvasWidth || y >= input.canvasHeight) {
            return null;
        }
        const col = Math.floor(x / stride);
        const row = Math.floor(y / stride);
        const localPx = x - col * stride;
        return {
            row: row,
            col: col,
            localFraction: Math.min(Math.max(localPx / input.cellSize, 0), 0.999999),
            canvasX: x,
            canvasY: y
        };
    }

    function emptyDraft() {
        return {
            schemaVersion: 3,
            kind: 'draft',
            step: 1,
            settings: { S: null, A: null, L: 80 },
            assumption: { LIsDefault: true },
            activities: [],
            damagedLegacyRaw: null,
            damageAcknowledged: false,
            updatedAt: null
        };
    }

    function migrateActivity(raw, index) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const preserved = {};
        if (raw && typeof raw === 'object') {
            Object.keys(raw).forEach(function (key) {
                if (['id', 'name', 'timeAmount', 'frequency', 'durationYears', 'color'].indexOf(key) === -1) {
                    preserved[key] = raw[key];
                }
            });
        }
        const id = source.id === undefined || source.id === null || source.id === ''
            ? 'legacy_' + index
            : String(source.id);
        return {
            id: id,
            name: source.name === undefined || source.name === null ? '' : String(source.name),
            timeAmount: source.timeAmount === undefined ? null : source.timeAmount,
            frequency: source.frequency === undefined ? null : source.frequency,
            durationYears: source.durationYears === undefined ? null : source.durationYears,
            color: source.color || null,
            group: 'daily',
            templateKey: null,
            legacy: true,
            excludedByUser: false,
            preserved: preserved,
            invalidItem: raw && typeof raw === 'object' ? null : raw
        };
    }

    function interpretLegacyAge(raw) {
        if (raw === null || raw === undefined) {
            return null;
        }
        const parsed = parseAgeInput(raw);
        if (!parsed.ok) {
            return raw;
        }
        return parsed.value;
    }

    function migrateLegacy(rawKeys) {
        const keys = rawKeys || {};
        const draft = emptyDraft();
        draft.settings.A = interpretLegacyAge(keys.lifeCalculator_currentAge);
        draft.settings.S = null;
        draft.settings.L = 80;
        draft.assumption = {
            LIsDefault: true,
            note: '旧版没有预计长度字段，网格固定画 80 年。这里预填 80 作为规划假设，请确认或修改；当前年龄和规划起点没有替你猜测。'
        };
        const rawActivities = keys.lifeCalculator_activities;
        if (rawActivities === null || rawActivities === undefined) {
            return { draft: draft };
        }
        try {
            const parsed = JSON.parse(rawActivities);
            if (!Array.isArray(parsed)) {
                draft.damagedLegacyRaw = rawActivities;
                draft.activities = [];
                return { draft: draft };
            }
            draft.activities = parsed.map(migrateActivity);
        } catch (error) {
            draft.damagedLegacyRaw = rawActivities;
            draft.activities = [];
        }
        return { draft: draft };
    }

    function createMemoryStorage(initial) {
        const map = new Map();
        Object.keys(initial || {}).forEach(function (key) {
            map.set(key, initial[key] === null || initial[key] === undefined ? null : String(initial[key]));
        });
        return {
            getItem: function (key) {
                return map.has(key) ? map.get(key) : null;
            },
            setItem: function (key, value) {
                map.set(String(key), String(value));
            },
            removeItem: function (key) {
                map.delete(key);
            },
            dump: function () {
                return Object.fromEntries(map.entries());
            }
        };
    }

    function writeVerify(storage, key, value) {
        let previous;
        try {
            previous = storage.getItem(key);
        } catch (error) {
            return { ok: false, code: 'read', message: '写入前读不到原值，已中止，避免覆盖。', previous: null };
        }
        try {
            storage.setItem(key, value);
        } catch (error) {
            return { ok: false, code: 'write', message: '写入失败，原值未替换。', previous: previous };
        }
        let read;
        try {
            read = storage.getItem(key);
        } catch (error) {
            try {
                if (previous === null) {
                    storage.removeItem(key);
                } else {
                    storage.setItem(key, previous);
                }
            } catch (restoreError) {
                return { ok: false, code: 'readback', message: '回读失败，且恢复原值也失败。请不要把这次操作当成已保存。' };
            }
            return { ok: false, code: 'readback', message: '回读失败，已尝试恢复原值。这次没有保存成功。', previous: previous };
        }
        if (read !== value) {
            try {
                if (previous === null) {
                    storage.removeItem(key);
                } else {
                    storage.setItem(key, previous);
                }
            } catch (restoreError) {
                return { ok: false, code: 'mismatch', message: '回读与写入不一致，且恢复原值失败。请不要把这次操作当成已保存。' };
            }
            return { ok: false, code: 'mismatch', message: '回读与写入不一致，已恢复原值。这次没有保存成功。', previous: previous };
        }
        return { ok: true, value: read, previous: previous };
    }

    function readLegacy(storage) {
        const raw = {};
        LEGACY_KEYS.forEach(function (key) {
            raw[key] = storage.getItem(key);
        });
        return raw;
    }

    function legacySignature(storage) {
        return JSON.stringify(readLegacy(storage));
    }

    function ensureBackup(storage, nowIso) {
        let existing;
        try {
            existing = storage.getItem(KEY_BACKUP);
        } catch (error) {
            return { ok: false, message: '读取原始备份失败，已停止迁移，旧数据未改。' };
        }
        if (existing !== null) {
            return { ok: true, skipped: true, reason: 'exists', raw: existing };
        }
        let legacy;
        try { legacy = readLegacy(storage); } catch (error) {
            return { ok: false, message: '读取计算器原始数据失败，已停止迁移，旧键未改。' };
        }
        const hasAny = LEGACY_KEYS.some(function (key) { return legacy[key] !== null; });
        if (!hasAny) {
            return { ok: true, skipped: true, reason: 'no-legacy', raw: null };
        }
        const payload = JSON.stringify({
            schemaVersion: 1,
            kind: 'raw-backup',
            capturedAt: nowIso || new Date().toISOString(),
            note: '首次转换前的原始字符串和版本信息。此键一旦写成就不再覆盖。',
            source: 'life-calculator classic activities/zoom/currentAge/visited',
            keys: legacy
        });
        const written = writeVerify(storage, KEY_BACKUP, payload);
        if (!written.ok) {
            return { ok: false, message: '原始备份失败，已停止迁移，旧键未改。' + written.message, code: written.code };
        }
        return { ok: true, skipped: false, raw: written.value };
    }

    function parseStored(raw) {
        try {
            return { ok: true, value: JSON.parse(raw) };
        } catch (error) {
            return { ok: false, message: '内容无法解析' };
        }
    }

    // Only draft identities may be repaired. Confirmed snapshots and raw source strings stay untouched.
    function repairDraftIdentities(draft) {
        const next = clone(draft);
        const reserved = new Set(next.activities.map(a => String(a.id || '')).filter(Boolean));
        const ids = new Set(), templates = new Set();
        let changed = false;
        next.activities.forEach(function (a, index) {
            if (typeof a.id !== 'string' || !a.id.trim() || ids.has(a.id)) {
                const original = a.id === undefined ? null : a.id;
                let candidate = 'act_recovered_' + index;
                while (reserved.has(candidate) || ids.has(candidate)) candidate += '_';
                a.id = candidate;
                a.recoveredSourceId = original;
                changed = true;
            }
            ids.add(a.id);
            if (a.templateKey && templates.has(a.templateKey)) {
                a.recoveredTemplateKey = a.templateKey;
                a.templateKey = null;
                changed = true;
            }
            if (a.templateKey) templates.add(a.templateKey);
        });
        if (changed) {
            next.identityRepairNotice = '有活动标识缺失或重复，已在草稿中分开保留全部项目；原始数据和已确认报告未改写。';
            if (next.unsubmitted && next.unsubmitted.editor) {
                next.identityRepairUnsubmitted = clone(next.unsubmitted.editor);
                delete next.unsubmitted.editor;
            }
        }
        return { draft: next, changed: changed };
    }

    function storedStateValid(value, kind) {
        const object = v => v && typeof v === 'object' && !Array.isArray(v);
        if (!object(value) || ![2, 3].includes(value.schemaVersion) || (value.kind !== kind && !(value.schemaVersion === 2 && value.kind === undefined)) ||
            !object(value.settings) || !Array.isArray(value.activities) ||
            !value.activities.every(a => object(a) && (a.name == null || typeof a.name === 'string') &&
                (a.color == null || typeof a.color === 'string') &&
                (a.excludedByUser === undefined || typeof a.excludedByUser === 'boolean'))) return false;
        if (kind === 'draft' && value.schemaVersion === 3) {
            if (value.unsubmitted !== undefined && !object(value.unsubmitted)) return false;
            if (value.settingsTouched !== undefined && !object(value.settingsTouched)) return false;
            const rows = value.placeholders;
            if (rows !== undefined && (!object(rows) || !['daily', 'explore'].every(g => Array.isArray(rows[g]) && rows[g].every(k => typeof k === 'string')))) return false;
            const editor = value.unsubmitted && value.unsubmitted.editor;
            if (editor && (!object(editor) || typeof editor.key !== 'string' || !object(editor.fields))) return false;
        }
        if (kind === 'confirmed') {
            const validation = value.schemaVersion === 2 ? legacyModel().validateSettings(value.settings) : validateSettings(value.settings);
            const ids = value.activities.map(a => a.id);
            if (!validation.ok || ids.some(id => !id) || new Set(ids).size !== ids.length) return false;
        }
        return true;
    }

    function saveDraft(storage, draft) {
        const copy = clone(draft);
        copy.schemaVersion = 3;
        copy.kind = 'draft';
        copy.updatedAt = copy.updatedAt || new Date().toISOString();
        const payload = JSON.stringify(copy);
        const written = writeVerify(storage, KEY_DRAFT, payload);
        if (!written.ok) {
            return {
                ok: false,
                persisted: false,
                draft: draft,
                message: '草稿没有写入本机。刷新后不会保留这次修改；当前页面上的内容还在。' + written.message
            };
        }
        const parsed = parseStored(written.value);
        if (!parsed.ok) {
            return { ok: false, persisted: false, draft: draft, message: '草稿回读后无法解析，不能视为已保存。' };
        }
        return { ok: true, persisted: true, draft: parsed.value, message: '草稿已保存在本机。' };
    }

    function snapshotFromDraft(draft, nowIso) {
        const summary = summarize(draft.settings, draft.activities, draft);
        return {
            schemaVersion: 3, basis: 'selected-stage-v3', kind: 'confirmed',
            committedAt: nowIso || new Date().toISOString(),
            settings: clone(draft.settings), activities: clone(draft.activities || []),
            assumption: clone(draft.assumption || {}),
            damagedLegacyRaw: draft.damagedLegacyRaw || null,
            damageAcknowledged: Boolean(draft.damageAcknowledged),
            scope: { countedIds: summary.items.filter(i => i.hours !== null).map(i => i.id),
                excludedIds: summary.items.filter(i => i.status === 'excluded').map(i => i.id),
                damagedRawExcluded: Boolean(draft.damagedLegacyRaw && draft.damageAcknowledged) }
        };
    }

    function commitReport(storage, draft, nowIso) {
        const summary = summarize(draft.settings, draft.activities, draft);
        if (summary.blockers.length > 0 || !summary.ok) {
            return {
                ok: false,
                committed: false,
                message: '这次没有生成报告。',
                blockers: summary.blockers
            };
        }
        let previous;
        try {
            previous = storage.getItem(KEY_CONFIRMED);
        } catch (error) {
            return { ok: false, committed: false, message: '提交前读不到已确认报告，已中止，避免写坏原报告。' };
        }
        const snapshot = snapshotFromDraft(draft, nowIso);
        const written = writeVerify(storage, KEY_CONFIRMED, JSON.stringify(snapshot));
        if (!written.ok) {
            let current = null;
            try {
                current = storage.getItem(KEY_CONFIRMED);
            } catch (error) {
                current = null;
            }
            return {
                ok: false,
                committed: false,
                message: '报告没有提交成功。已确认报告、原始备份和内存里的草稿都不应被这次失败覆盖。' + written.message,
                previousIntact: current === previous,
                previousRaw: previous
            };
        }
        const parsed = parseStored(written.value);
        if (!parsed.ok) {
            return { ok: false, committed: false, message: '报告回读后无法解析，不能视为提交成功。', previousIntact: false };
        }
        return { ok: true, committed: true, snapshot: parsed.value, message: '已生成报告。页面和 PNG 都读取这份已确认快照。' };
    }

    function bootStorage(storage, nowIso) {
        const result = { ok: true, blocked: false, errors: [], draft: null, confirmed: null, draftPersisted: false, migrationStatus: 'not-needed' };
        const backup = ensureBackup(storage, nowIso);
        result.backupStatus = backup.ok ? (backup.skipped ? backup.reason : 'created') : 'failed';
        result.backupRaw = backup.raw;
        if (!backup.ok) { result.ok = false; result.blocked = true; result.errors.push(backup.message); result.migrationStatus = 'stopped'; }
        const current = safeGet(storage, KEY_CONFIRMED);
        const old = current.value === null ? safeGet(storage, 'lifeCalculator_v2_confirmed') : current;
        if (current.error || old.error) { result.ok = false; result.blocked = true; result.errors.push('读取已确认报告失败，未改写存储。'); }
        else if (old.value !== null) {
            const parsed = parseStored(old.value);
            if (parsed.ok && storedStateValid(parsed.value, 'confirmed')) {
                result.confirmed = parsed.value;
                // Earlier V2 snapshots can omit the metadata label; this key already identifies a confirmed snapshot.
                if (result.confirmed.schemaVersion === 2 && result.confirmed.kind === undefined) result.confirmed.kind = 'confirmed';
            }
            else { result.ok = false; result.blocked = true; result.errors.push('已确认报告无法解析或结构损坏，未覆盖原文。'); }
        }
        if (!backup.ok) return result;
        const existing = safeGet(storage, KEY_DRAFT);
        if (existing.error) { result.ok = false; result.blocked = true; result.errors.push('草稿读取失败，未覆盖。'); return result; }
        if (existing.value !== null) {
            const parsed = parseStored(existing.value);
            if (parsed.ok && storedStateValid(parsed.value, 'draft')) {
                const repaired = repairDraftIdentities(parsed.value);
                result.draft = repaired.draft;
                if (repaired.changed && !result.draft.identityRepairSourceRaw) result.draft.identityRepairSourceRaw = existing.value;
                result.draftPersisted = true;
            }
            else { result.ok = false; result.blocked = true; result.errors.push('草稿无法解析或结构损坏，未覆盖原文。'); }
            return result;
        }
        const v2 = safeGet(storage, 'lifeCalculator_v2_draft');
        if (v2.error) { result.ok = false; result.blocked = true; result.errors.push('旧草稿读取失败，已停止迁移。'); return result; }
        if (v2.value !== null) {
            const parsed = parseStored(v2.value);
            if (!parsed.ok || !storedStateValid(parsed.value, 'draft')) { result.ok = false; result.blocked = true; result.errors.push('旧草稿无法解析或结构损坏，已停止迁移。'); return result; }
            result.draft = parsed.value;
        } else if (result.confirmed) result.draft = clone(result.confirmed);
        else if (storage.getItem('lifeCalculator_activities') !== null) result.draft = migrateLegacy(readLegacy(storage)).draft;
        if (result.draft) {
            result.draft.schemaVersion = 3; result.draft.kind = 'draft';
            result.draft.step = Math.min(3, Math.max(1, result.draft.step || 1));
            result.draft.preservedV2Unsubmitted = clone(result.draft.unsubmitted || {});
            result.draft.unsubmitted = {}; // preserved separately; v2 editor UI is not a committed activity
            result.draft = repairDraftIdentities(result.draft).draft;
            const saved = saveDraft(storage, result.draft);
            result.draftPersisted = saved.ok; result.migrationStatus = 'migrated';
            if (!saved.ok) { result.ok = false; result.errors.push(saved.message); }
        }
        return result;
    }

    function safeGet(storage, key) {
        try {
            return { value: storage.getItem(key), error: null };
        } catch (error) {
            return { value: null, error: error };
        }
    }

    function reportLines(snapshot) {
        if (snapshot.schemaVersion === 2) return legacyModel().reportLines(snapshot);
        const summary = summarize(snapshot.settings, snapshot.activities, snapshot);
        const budget = summary.budget;
        const f = n => trimFixed(n, 3);
        const lines = [summary.warnings.length ? '已确认阶段预算 · 警示报告' : '已确认阶段预算'];
        if (budget) {
            lines.push(formatYears(budget.S) + '—' + formatYears(budget.L) + '岁 · ' + formatYears(budget.D) + '年阶段预算');
            lines.push(summary.E > 0 ? '超出这一阶段 ' + f(summary.E / HOURS_PER_YEAR) + ' 年' : '尚未分配 ' + f(summary.U / HOURS_PER_YEAR) + ' 年');
            ['daily', 'explore'].forEach(group => {
                const hours = summary.items.filter(i => (i.group === 'explore' ? 'explore' : 'daily') === group).reduce((n, i) => n + (i.hours || 0), 0);
                lines.push((group === 'daily' ? '日常' : '探索') + '需求 ' + formatHours(hours) + ' 小时');
            });
        }
        lines.push('统计范围：' + summary.counted + ' 项计入，' + summary.items.filter(i => i.status === 'excluded').length + ' 项由用户确认排除。');
        if (snapshot.damagedLegacyRaw && snapshot.damageAcknowledged) lines.push('用户已明确排除无法解析的旧数据，统计范围不包含该原文。');
        summary.warnings.forEach(w => lines.push(w.message));
        summary.items.forEach(i => lines.push((i.name || '未命名活动') + '：' + (i.hours === null ? (i.status === 'excluded' ? '用户确认排除，不计入统计范围' : i.issues.join('、')) : formatHours(i.hours) + ' 小时 · ' + i.timeAmount + '小时/' + ({daily:'天',weekly:'周',monthly:'月',yearly:'年'}[i.frequency]) + ' × ' + i.durationYears + '年')));
        lines.push('阶段外：不纳入本次规划。尚未分配以青色显示；各活动颜色与图例一致。');
        lines.push(FORMULA_NOTE);
        if (summary.items.some(i => i.legacy)) lines.push(LEGACY_ROUNDING_NOTE);
        return { summary, lines };
    }

    function diffActivities(previous, next) {
        const before = new Map((previous || []).map(function (item) { return [item.id, item]; }));
        const after = new Map((next || []).map(function (item) { return [item.id, item]; }));
        const changes = [];
        after.forEach(function (activity, id) {
            if (!before.has(id)) {
                changes.push({ id: id, type: 'added', name: activity.name });
                return;
            }
            const prior = before.get(id);
            const hoursSame = prior.timeAmount === activity.timeAmount && prior.frequency === activity.frequency && prior.durationYears === activity.durationYears;
            const groupSame = prior.group === activity.group;
            if (!hoursSame || !groupSame || prior.name !== activity.name || prior.excludedByUser !== activity.excludedByUser) {
                changes.push({
                    id: id,
                    type: hoursSame && !groupSame ? 'group-only' : 'updated',
                    name: activity.name,
                    hoursSame: hoursSame
                });
            }
        });
        before.forEach(function (activity, id) {
            if (!after.has(id)) {
                changes.push({ id: id, type: 'removed', name: activity.name });
            }
        });
        return changes;
    }

    return {
        WEEKS_PER_YEAR: WEEKS_PER_YEAR,
        DAYS_PER_YEAR: DAYS_PER_YEAR,
        HOURS_PER_WEEK: HOURS_PER_WEEK,
        HOURS_PER_YEAR: HOURS_PER_YEAR,
        HOURS_PER_MONTH: HOURS_PER_MONTH,
        PERIODS_PER_YEAR: PERIODS_PER_YEAR,
        PERIOD_MAX_HOURS: PERIOD_MAX_HOURS,
        LEGACY_KEYS: LEGACY_KEYS,
        KEY_BACKUP: KEY_BACKUP,
        KEY_DRAFT: KEY_DRAFT,
        KEY_CONFIRMED: KEY_CONFIRMED,
        KEY_ZOOM: KEY_ZOOM,
        LEGACY_ROUNDING_NOTE: LEGACY_ROUNDING_NOTE,
        TEMPLATES: TEMPLATES,
        COLORS: COLORS,
        nextActivityColor: nextActivityColor,
        ensureActivityColors: ensureActivityColors,
        FORMULA_NOTE: FORMULA_NOTE,
        UNALLOCATED_NOTE: UNALLOCATED_NOTE,
        GROUPS: GROUPS,
        clone: clone,
        createId: createId,
        formatYears: formatYears,
        formatHours: formatHours,
        formatWeeksFromHours: formatWeeksFromHours,
        parseAgeInput: parseAgeInput,
        parseHourInput: parseHourInput,
        parseDurationInput: parseDurationInput,
        validateSettings: validateSettings,
        budgetFromValues: budgetFromValues,
        fieldIssues: fieldIssues,
        demandHours: demandHours,
        legacyFlooredWeeks: legacyFlooredWeeks,
        summarize: summarize,
        validateActivityInput: validateActivityInput,
        upsertActivity: upsertActivity,
        moveGroup: moveGroup,
        excludeUncalculable: excludeUncalculable,
        weekTenths: weekTenths,
        segmentAt: segmentAt,
        gridPlan: gridPlan,
        locatePointer: locatePointer,
        emptyDraft: emptyDraft,
        migrateLegacy: migrateLegacy,
        migrateActivity: migrateActivity,
        createMemoryStorage: createMemoryStorage,
        writeVerify: writeVerify,
        ensureBackup: ensureBackup,
        saveDraft: saveDraft,
        commitReport: commitReport,
        bootStorage: bootStorage,
        snapshotFromDraft: snapshotFromDraft,
        reportLines: reportLines,
        diffActivities: diffActivities
    };
});
