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
        root.LegacyLifeModel = api;
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
        'lifeCalculator_visited'
    ];
    const KEY_BACKUP = 'lifeCalculator_v2_rawBackup';
    const KEY_DRAFT = 'lifeCalculator_v2_draft';
    const KEY_CONFIRMED = 'lifeCalculator_v2_confirmed';
    const KEY_ZOOM = 'lifeCalculator_v2_zoom';

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

    const COLORS = [
        '#8C4A2F', '#C56A2D', '#D89B3A', '#2F6F4E', '#3E7C8A',
        '#1F4E79', '#5C4A72', '#8D3B4A', '#6B5B4B', '#3F5E4B',
        '#A15C38', '#4E6E8E', '#7A5B3A', '#2E5A4C', '#9A4E3A', '#505C3A'
    ];

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
        if (parsed.decimals > 1) {
            return { ok: false, code: 'precision', message: '持续年数最多一位小数，不会用整数步长截断' };
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
        [['S', '自主规划起点'], ['A', '当前年龄'], ['L', '预计人生长度']].forEach(function (pair) {
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
        const startTenths = Math.round(values.S * 10);
        const ageTenths = Math.round(values.A * 10);
        const lifeTenths = Math.round(values.L * 10);
        const naturalTenths = Math.max(0, lifeTenths - ageTenths);
        const budgetTenths = Math.max(startTenths, ageTenths);
        const plannedTenths = Math.max(0, lifeTenths - budgetTenths);
        return {
            S: startTenths / 10,
            A: ageTenths / 10,
            L: lifeTenths / 10,
            N: naturalTenths / 10,
            B: budgetTenths / 10,
            D: plannedTenths / 10,
            futureNotIncluded: (naturalTenths - plannedTenths) / 10,
            H: plannedTenths * HOURS_PER_YEAR / 10
        };
    }

    function knownFrequency(frequency) {
        return Object.prototype.hasOwnProperty.call(PERIODS_PER_YEAR, frequency);
    }

    function fieldIssues(activity) {
        const issues = [];
        const amount = activity ? activity.timeAmount : undefined;
        const years = activity ? activity.durationYears : undefined;
        const frequency = activity ? activity.frequency : undefined;
        if (amount === null || amount === undefined || amount === '') {
            issues.push('缺少每周期小时数');
        } else if (!Number.isFinite(Number(amount))) {
            issues.push('每周期小时数不是有限数字');
        } else if (Number(amount) <= 0) {
            issues.push('每周期小时数不是正数');
        }
        if (frequency === null || frequency === undefined || frequency === '') {
            issues.push('缺少频率');
        } else if (!knownFrequency(frequency)) {
            issues.push('频率无法识别');
        }
        if (years === null || years === undefined || years === '') {
            issues.push('缺少持续年数');
        } else if (!Number.isFinite(Number(years))) {
            issues.push('持续年数不是有限数字');
        } else if (Number(years) <= 0) {
            issues.push('持续年数不是正数');
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
        if (budget) {
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
        if (excluded.length > 0) {
            warnings.push({ code: 'excluded', message: '有 ' + excluded.length + ' 项已由你确认排除，没有按 0 小时计入需求。' });
        }
        if (duplicateNames.length > 0) {
            warnings.push({ code: 'duplicate-name', message: '这些名称出现了多次：' + duplicateNames.join('、') + '。同名不会自动合并，同一小时只应计算一次，这里不会自动去重。' });
        }
        if (uncalculable.length > 0) {
            warnings.push({ code: 'incomplete', message: '目前只能统计其中 ' + counted + ' 项。统计不完整，不能把缺字段的项看成 0。' });
        }
        const claimsFullyValid = Boolean(budget) && blockers.length === 0 && overHorizon.length === 0 && excluded.length === 0 && !(budget && (budget.D === 0 || excess > 0));
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
            complete: uncalculable.length === 0 && !damage,
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

    function gridPlan(settings, activities) {
        const validation = validateSettings(settings);
        if (!validation.ok) {
            return { ok: false, errors: validation.errors, cells: [] };
        }
        const budget = budgetFromValues(validation.values);
        const startWt = weekTenths(budget.A);
        const planWt = weekTenths(budget.B);
        const endWt = weekTenths(budget.L);
        const rowCount = Math.ceil(Math.round(budget.L * 10) / 10);
        const queue = [];
        (activities || []).forEach(function (activity) {
            const hours = demandHours(activity);
            if (hours === null) {
                return;
            }
            queue.push({ id: activity.id, leftHundredths: Math.round(hours * 100) });
        });
        const cells = [];
        let paintedHundredths = 0;
        for (let year = 0; year < rowCount; year += 1) {
            for (let week = 0; week < WEEKS_PER_YEAR; week += 1) {
                const cellStart = (year * WEEKS_PER_YEAR + week) * 10;
                const cellEnd = cellStart + 10;
                if (cellStart >= endWt) {
                    continue;
                }
                const segments = [];
                function pushSpan(start, end, kind, extra) {
                    if (end - start <= 1e-9) {
                        return;
                    }
                    const segment = {
                        kind: kind,
                        activityId: extra && extra.activityId ? extra.activityId : null,
                        hours: extra && extra.hours ? extra.hours : (end - start) / 10 * HOURS_PER_WEEK,
                        startFraction: (start - cellStart) / 10,
                        endFraction: (end - cellStart) / 10
                    };
                    segments.push(segment);
                }
                pushSpan(Math.max(cellStart, 0), Math.min(cellEnd, startWt), 'past');
                pushSpan(Math.max(cellStart, startWt), Math.min(cellEnd, planWt), 'future-excluded');
                const planStart = Math.max(cellStart, planWt);
                const planEnd = Math.min(cellEnd, endWt);
                if (planEnd > planStart) {
                    let cursor = planStart;
                    let guard = 0;
                    while (cursor < planEnd - 1e-9 && queue.length > 0 && guard < 20) {
                        guard += 1;
                        const roomHundredths = Math.round((planEnd - cursor) * 1680);
                        const use = Math.min(roomHundredths, queue[0].leftHundredths);
                        if (use <= 0) {
                            queue.shift();
                            continue;
                        }
                        const usedTenths = use / 1680;
                        pushSpan(cursor, cursor + usedTenths, 'activity', {
                            activityId: queue[0].id,
                            hours: use / 100
                        });
                        queue[0].leftHundredths -= use;
                        paintedHundredths += use;
                        cursor += usedTenths;
                        if (queue[0].leftHundredths <= 0) {
                            queue.shift();
                        }
                    }
                    pushSpan(cursor, planEnd, 'unallocated');
                }
                pushSpan(Math.max(cellStart, endWt), cellEnd, 'beyond');
                cells.push({ year: year, week: week, segments: segments });
            }
        }
        return {
            ok: true,
            budget: budget,
            rowCount: rowCount,
            cells: cells,
            paintedHours: paintedHundredths / 100,
            overflow: queue.filter(function (item) { return item.leftHundredths > 0; }).map(function (item) {
                return { activityId: item.id, hours: item.leftHundredths / 100 };
            })
        };
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
            schemaVersion: 2,
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
        const legacy = readLegacy(storage);
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

    function saveDraft(storage, draft) {
        const copy = clone(draft);
        copy.schemaVersion = 2;
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
        const summary = summarize(draft.settings, draft.activities);
        return {
            schemaVersion: 2,
            kind: 'confirmed',
            committedAt: nowIso || new Date().toISOString(),
            settings: {
                S: summary.budget.S,
                A: summary.budget.A,
                L: summary.budget.L
            },
            assumption: clone(draft.assumption || {}),
            activities: clone(draft.activities || []),
            damageAcknowledged: Boolean(draft.damageAcknowledged)
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
        const signature = legacySignature(storage);
        const backup = ensureBackup(storage, nowIso);
        const result = {
            ok: true,
            errors: [],
            backupStatus: backup.skipped ? backup.reason : 'created',
            migrationStatus: 'not-needed',
            draft: null,
            draftPersisted: false,
            confirmed: null,
            confirmedRaw: null,
            confirmedBroken: false,
            backupRaw: null
        };
        if (!backup.ok) {
            result.ok = false;
            result.backupStatus = 'failed';
            result.errors.push(backup.message);
            result.migrationStatus = 'stopped';
        } else {
            result.backupRaw = backup.raw;
            const existingDraft = safeGet(storage, KEY_DRAFT);
            if (existingDraft.error) {
                result.ok = false;
                result.errors.push('读取草稿失败，已停止，没有重写原始备份。');
                result.migrationStatus = 'stopped';
            } else if (existingDraft.value !== null) {
                const parsed = parseStored(existingDraft.value);
                result.migrationStatus = 'draft-exists';
                if (!parsed.ok) {
                    result.ok = false;
                    result.errors.push('草稿无法解析。未覆盖草稿，也未覆盖原始备份。');
                    result.draftRaw = existingDraft.value;
                } else {
                    result.draft = parsed.value;
                    result.draftPersisted = true;
                }
            } else if (backup.ok) {
                const activitiesRaw = safeGet(storage, 'lifeCalculator_activities');
                if (activitiesRaw.error) {
                    result.ok = false;
                    result.migrationStatus = 'stopped';
                    result.errors.push('读取旧活动失败，已停止迁移，没有改写旧键。');
                } else if (activitiesRaw.value === null) {
                    result.migrationStatus = 'not-needed';
                } else {
                const migrated = migrateLegacy(readLegacy(storage));
                migrated.draft.updatedAt = nowIso || new Date().toISOString();
                const saved = saveDraft(storage, migrated.draft);
                result.draft = saved.draft;
                result.draftPersisted = saved.ok;
                if (!saved.ok) {
                    result.ok = false;
                    result.migrationStatus = 'failed';
                    result.errors.push(saved.message);
                } else {
                    result.migrationStatus = 'migrated';
                    result.draft = saved.draft;
                }
                }
            }
        }
        const confirmed = safeGet(storage, KEY_CONFIRMED);
        result.confirmedRaw = confirmed.value;
        if (confirmed.error) {
            result.ok = false;
            result.errors.push('读取已确认报告失败。');
        } else if (confirmed.value !== null) {
            const parsed = parseStored(confirmed.value);
            if (!parsed.ok) {
                result.confirmedBroken = true;
                result.ok = false;
                result.errors.push('已确认报告无法解析。页面不会用草稿顶替它，也没有覆盖原始备份。');
            } else {
                result.confirmed = parsed.value;
            }
        }
        if (legacySignature(storage) !== signature) {
            result.ok = false;
            result.errors.push('旧键被改动，这不符合迁移约束。');
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
        const summary = summarize(snapshot.settings, snapshot.activities, snapshot);
        const budget = summary.budget;
        const lines = [];
        lines.push(summary.claimsFullyValid ? '已确认报告' : '警示报告');
        if (!summary.claimsFullyValid) {
            lines.push('这不是一份全部有效的最终分配。');
        }
        if (budget) {
            lines.push('当前年龄 ' + formatYears(budget.A) + ' 岁（手填快照）');
            lines.push('自主规划起点 ' + formatYears(budget.S) + ' 岁');
            lines.push('预计人生长度 ' + formatYears(budget.L) + ' 岁');
            lines.push('起算点 ' + formatYears(budget.B) + ' 岁');
            lines.push('自然余生 ' + formatYears(budget.N) + ' 年');
            lines.push('纳入规划 ' + formatYears(budget.D) + ' 年');
            lines.push('未分配 ' + formatHours(summary.U) + ' 小时（约 ' + formatWeeksFromHours(summary.U) + ' 周）');
            lines.push('需求 ' + formatHours(summary.T) + ' 小时（约 ' + formatWeeksFromHours(summary.T) + ' 周）');
            lines.push('超额 ' + formatHours(summary.E) + ' 小时（约 ' + formatWeeksFromHours(summary.E) + ' 周）');
            lines.push('尚未纳入规划的未来 ' + formatYears(budget.futureNotIncluded) + ' 年');
        }
        lines.push(UNALLOCATED_NOTE);
        lines.push(FORMULA_NOTE);
        summary.warnings.forEach(function (warning) {
            lines.push(warning.message);
        });
        summary.items.forEach(function (item) {
            const label = item.name || '未命名活动';
            if (item.hours === null) {
                lines.push(label + '：' + (item.status === 'excluded' ? '已排除，不计入需求' : item.issues.join('、')));
            } else {
                lines.push(label + '：' + formatHours(item.hours) + ' 小时，约 ' + formatWeeksFromHours(item.hours) + ' 周');
            }
        });
        return { summary: summary, lines: lines };
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
