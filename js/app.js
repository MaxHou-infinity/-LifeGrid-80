/**
 * 页面启动：迁移只进入草稿，图谱和 PNG 只读已确认快照。
 */
(function () {
    'use strict';

    const Model = window.LifeModel;
    const state = {
        draft: null,
        draftPersisted: false,
        confirmed: null,
        zoom: 100,
        layout: null,
        hover: null
    };
    let persistTimer = null;

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function flash(kind, text) {
        const alerts = document.getElementById('alerts');
        const wizardAlert = document.getElementById('wizard-alert');
        if (document.getElementById('wizard').open) wizardAlert.innerHTML = '<div class="banner">' + escapeHtml(text) + '</div>';
        alerts.innerHTML = '<div class="banner ' + kind + '" role="' + (kind === 'bad' ? 'alert' : 'status') + '"><p>' + escapeHtml(text) + '</p></div>';
    }

    function normalize(draft) {
        const next = draft || Model.emptyDraft();
        window.LifeWizard.ensureMeta(next);
        return next;
    }

    function persist() {
        clearTimeout(persistTimer);
        if (state.storageBlocked) return { ok: false, message: '数据读取或原始备份未完成，不能覆盖本机数据。当前修改仅在内存中。' };
        state.draft.updatedAt = new Date().toISOString();
        const saved = Model.saveDraft(window.localStorage, state.draft);
        state.draftPersisted = Boolean(saved.ok);
        if (saved.ok) state.draft = normalize(saved.draft);
        return saved;
    }

    function persistSoon() {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(function () {
            const saved = persist();
            if (!saved.ok) flash('bad', saved.message);
        }, 250);
    }

    function colorsOf(activities) {
        const colors = {};
        (activities || []).forEach(function (activity) { colors[activity.id] = activity.color || Model.COLORS[0]; });
        return colors;
    }

    function renderPage() {
        const report = document.getElementById('report-body');
        const caption = document.getElementById('grid-caption');
        const list = document.getElementById('activity-list');
        const exportButton = document.getElementById('export-png');
        const editReport = document.getElementById('edit-report');
        const resume = document.getElementById('resume-planner');
        resume.hidden = !state.draftPersisted;
        document.getElementById('confirmed-report').hidden = !state.confirmed || document.getElementById('wizard').open;
        document.getElementById('intro').hidden = Boolean(state.confirmed);
        if (!state.confirmed) {
            return;
        }
        const lines = Model.reportLines(state.confirmed);
        if (state.confirmed.schemaVersion === 2) {
            report.innerHTML = '<h2>原版已确认报告 · V2</h2><ul>' + lines.lines.map(line => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>';
        } else {
            const sum=lines.summary, b=sum.budget;
            report.innerHTML = '<h1 class="stage-heading">' + escapeHtml(Model.formatYears(b.S)+'—'+Model.formatYears(b.L)+'岁 · '+Model.formatYears(b.D)+'年阶段预算') + '</h1><p class="report-balance' + (sum.E>0?' warn':'') + '">' + escapeHtml(lines.lines[2]) + '</p><p class="report-sub">' + escapeHtml(lines.lines[3]+' · '+lines.lines[4]) + '</p>' + sum.warnings.map(w=>'<p class="banner">'+escapeHtml(w.message)+'</p>').join('');
        }
        document.getElementById('report-notes').innerHTML=lines.lines.map(line=>'<p>'+escapeHtml(line)+'</p>').join('');
        caption.textContent = lines.summary.claimsFullyValid ? '这张图谱读取已确认报告。' : '这是警示报告的图谱，不能称作全部有效的最终分配。';
        editReport.hidden = false;
        exportButton.disabled = false;
        const plan = Model.gridPlan(state.confirmed.settings, state.confirmed.activities, state.confirmed.schemaVersion);
        state.layout = window.LifeGrid.draw(document.getElementById('life-grid'), document.getElementById('year-gutter'), plan, {
            zoom: state.zoom,
            colors: colorsOf(state.confirmed.activities),
            hover: state.hover
        });
        renderLegend(state.confirmed);
        renderOverflow(plan, state.confirmed.activities);

        list.innerHTML = state.confirmed.activities.map(function (activity) {
            const item = lines.summary.items.find(function (entry) { return entry.id === activity.id; });
            const hours = item && item.hours !== null ? Model.formatHours(item.hours) + ' 小时' : (item ? item.issues.join('、') : '');
            return '<article class="activity-row"><div class="activity-main"><span class="activity-dot" style="background:' + escapeHtml(activity.color || '#d9d2c5') + '"></span><div><strong>' +
                escapeHtml(activity.name || '未命名活动') + '</strong><p>' + escapeHtml((window.LifeWizard.GROUP[activity.group] || '日常') + ' · ' + hours) + '</p></div></div>' +
                '<button type="button" class="btn secondary" data-draft-edit="' + escapeHtml(activity.id) + '">在草稿中编辑</button></article>';
        }).join('');
    }

    function renderLegend(snapshot) {
        const rows = snapshot.schemaVersion === 2 ? [
            [window.LifeGrid.STATE_COLOR.past, '已过去'], [window.LifeGrid.STATE_COLOR['future-excluded'], '尚未纳入规划'],
            [window.LifeGrid.STATE_COLOR.unallocated, '未分配']
        ] : [[window.LifeGrid.STATE_COLOR.outside, '不纳入本次规划'], [window.LifeGrid.STATE_COLOR.unallocated, '尚未分配']];
        snapshot.activities.forEach(function (activity) {
            if (activity.excludedByUser) return;
            rows.push([activity.color || Model.COLORS[0], activity.name || '未命名活动']);
        });
        document.getElementById('legend').innerHTML = rows.map(function (row) {
            return '<div class="legend-row"><span><i class="swatch-dot" style="background:' + escapeHtml(row[0]) + '"></i> ' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
    }

    function renderOverflow(plan, activities) {
        const host = document.getElementById('overflow-list');
        if (!plan.ok || !plan.overflow.length) {
            host.innerHTML = '';
            return;
        }
        host.innerHTML = '<div class="banner warn"><p>图谱只画到规划预算以内。下面这些小时没有画进格子，需求数字仍然保留。</p><ul>' +
            plan.overflow.map(function (item) {
                const activity = activities.find(function (entry) { return entry.id === item.activityId; });
                return '<li>' + escapeHtml((activity && activity.name) || '活动') + '：' + escapeHtml(Model.formatHours(item.hours)) + ' 小时</li>';
            }).join('') + '</ul></div>';
    }

    function renderWizard() {
        window.LifeWizard.render(state.draft, state.confirmed);
    }

    function openWizard(step, activityId) {
        window.LifeWizard.ensureMeta(state.draft);
        if (step) state.draft.step = step;
        const dialog = document.getElementById('wizard');
        document.getElementById('confirmed-report').hidden = true;
        document.getElementById('cell-popover').hidden = true;
        document.getElementById('wizard-alert').innerHTML = '';
        document.body.style.overflow = 'hidden';
        if (!dialog.open) dialog.showModal();
        renderWizard();
        if (activityId) {
            const existing = state.draft.activities.find(a=>a.id===activityId);
            if (!existing) { flash('warn','这项已从当前草稿移除，正式报告仍保留原项。'); return; }
            state.draft.step = existing.group === 'explore' ? 3 : 2;
            renderWizard();
            window.LifeWizard.openEditor(api(), activityId);
            return;
        }
        const first = document.querySelector('#wizard-body input, #wizard-body button, #wizard-close');
        if (first) first.focus();
    }

    function closeWizard(options) {
        const quiet = options && options.quiet;
        const saved = options && options.alreadySaved ? options.alreadySaved : persist();
        const dialog = document.getElementById('wizard');
        if (dialog.open) dialog.close();
        document.body.style.overflow = '';
        renderPage();
        if (!quiet) {
            if (!saved.ok) flash('bad', saved.message);
            else flash('good', '草稿已保存在本机。已确认报告没有被这次关闭改写。');
        }
        document.getElementById(state.confirmed ? 'edit-report' : 'open-planner').focus();
        return saved;
    }

    function api() {
        return {
            getDraft: function () { return state.draft; },
            persist: function () {
                const saved = persist();
                if (!saved.ok) flash('bad', saved.message);
                return saved;
            },
            persistSoon: persistSoon,
            rerender: renderWizard,
            flash: flash
        };
    }

    function showHit(event, activate) {
        if (!state.confirmed || !state.layout) return;
        const hit = window.LifeGrid.hitFromEvent(event, document.getElementById('life-grid'), state.layout);
        const debug = document.getElementById('hit-debug');
        if (!hit) {
            debug.textContent = '';
            return;
        }
        const plan = Model.gridPlan(state.confirmed.settings, state.confirmed.activities, state.confirmed.schemaVersion);
        const cell = plan.cells.find(function (item) { return item.year === hit.row && item.week === hit.col; });
        if (!cell) {
            debug.textContent = hit.row + ':' + hit.col + ':界外';
            document.getElementById('life-grid').dataset.hit = hit.row + ':' + hit.col + ':outside';
            return;
        }
        const segment = Model.segmentAt(cell.segments, hit.localFraction);
        const label = segment ? window.LifeGrid.describeSegment(segment, state.confirmed.activities) : '空白';
        debug.textContent = hit.row + ':' + hit.col + ':' + (segment && segment.activityId ? segment.activityId : (segment ? segment.kind : 'none')) + ' ' + label;
        document.getElementById('life-grid').dataset.hit = hit.row + ':' + hit.col + ':' + (segment && segment.activityId ? segment.activityId : (segment ? segment.kind : 'none'));
        const sameCell = state.hover && state.hover.row === hit.row && state.hover.col === hit.col;
        state.hover = { row: hit.row, col: hit.col };
        if (!sameCell) {
            state.layout = window.LifeGrid.draw(document.getElementById('life-grid'), document.getElementById('year-gutter'), plan, {
                zoom: state.zoom,
                colors: colorsOf(state.confirmed.activities),
                hover: state.hover
            });
        }
        if (activate) showPopover(event, cell, segment);
        else document.getElementById('hit-debug').textContent = cell.segments.map(i => window.LifeGrid.describeSegment(i,state.confirmed.activities)).join(' / ');
    }

    function showPopover(event, cell, segment) {
        const popover = document.getElementById('cell-popover');
        const point = event.changedTouches ? event.changedTouches[0] : event;
        const rows = cell.segments.map(function (item) {
            const current = item === segment ? ' is-hit' : '';
            const text = window.LifeGrid.describeSegment(item, state.confirmed.activities);
            const edit = item.kind === 'activity'
                ? '<button type="button" class="btn secondary" data-draft-edit="' + escapeHtml(item.activityId) + '">编辑这项</button>'
                : item.kind === 'unallocated' ? '<button type="button" class="btn" data-continue>继续规划</button>' : '';
            return '<div class="segment-row' + current + '"><p>' + escapeHtml(text) + '</p>' + edit + '</div>';
        }).join('');
        popover.innerHTML = '<h3>这一格的分段</h3>' + rows + '<p class="quiet">空白部分不会自动新增活动。连续着色不是真实周历。</p><button type="button" class="btn secondary" id="close-popover">关闭</button>';
        popover.hidden = false;
        const left = Math.max(8, Math.min(point.clientX + 8, window.innerWidth - (popover.offsetWidth || 328) - 8));
        const top = Math.max(8, Math.min(point.clientY + 8, window.innerHeight - (popover.offsetHeight || 240) - 8));
        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
    }

    function loadZoom() {
        const modern = window.localStorage.getItem(Model.KEY_ZOOM);
        const legacy = window.localStorage.getItem('lifeCalculator_zoomLevel');
        const source = modern || legacy;
        const value = Number(source);
        if (Number.isFinite(value) && value >= 50 && value <= 200) state.zoom = value;
        document.getElementById('zoom-level').textContent = state.zoom + '%';
    }

    function saveZoom(next) {
        state.zoom = next;
        document.getElementById('zoom-level').textContent = state.zoom + '%';
        try {
            const written = Model.writeVerify(window.localStorage, Model.KEY_ZOOM, String(state.zoom));
            if (!written.ok) flash('bad', '缩放没有写入本机。画面上的缩放还在，刷新后不一定还是这个比例。');
        } catch (error) {
            flash('bad', '缩放没有写入本机。画面上的缩放还在，刷新后不一定还是这个比例。');
        }
        renderPage();
    }

    function boot() {
        let result;
        try {
            result = Model.bootStorage(window.localStorage);
        } catch (error) {
            flash('bad', '启动时没有完成迁移。为避免写坏旧数据，页面没有继续转换。');
            state.draft = Model.emptyDraft();
            state.storageBlocked = true;
            renderPage();
            return;
        }
        state.storageBlocked = Boolean(result.blocked);
        state.draft = normalize(result.draft || Model.emptyDraft());
        state.draftPersisted = Boolean(result.draftPersisted);
        state.confirmed = result.confirmed;
        if (!result.ok) flash('bad', result.errors.join(' '));
        else if (state.draft.identityRepairNotice) flash('warn', state.draft.identityRepairNotice);
        else if (result.migrationStatus === 'migrated') {
            flash('warn', '旧活动已放进草稿，原始字符串已备份且不会覆盖。生成前，正式报告保持原口径。');
        }
        try { loadZoom(); } catch(error) { flash('bad','缩放读取失败，使用默认比例。'); }
        renderPage();
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!Model || !window.LegacyLifeModel || !window.LifeWizard || !window.LifeGrid || !window.LifeExport) {
            flash('bad', '工具脚本未能完整加载，请刷新重试；本机数据未改动。');
            return;
        }
        document.getElementById('alerts').innerHTML = '';
        document.getElementById('open-planner').disabled = false;
        document.getElementById('resume-planner').disabled = false;
        window.LifeWizard.bind(api());
        document.getElementById('open-planner').addEventListener('click', function () { openWizard(state.draft.step || 1); });
        document.getElementById('resume-planner').addEventListener('click', function () { openWizard(state.draft.step || 1); });
        document.getElementById('edit-report').addEventListener('click', function () { openWizard(state.draft.step || 1); });
        document.getElementById('wizard-close').addEventListener('click', closeWizard);
        document.getElementById('wizard').addEventListener('cancel', function (event) {
            event.preventDefault();
            closeWizard();
        });
        document.getElementById('wizard-form').addEventListener('submit', function (event) { event.preventDefault(); });
        document.getElementById('wizard-back').addEventListener('click', function () {
            if (state.draft.unsubmitted.editor) { flash('bad','请先保存此项或取消行内修改。'); return; }
            state.draft.step = Math.max(1, (state.draft.step || 1) - 1);
            const saved = persist();
            renderWizard();
            if (!saved.ok) flash('bad', saved.message);
        });
        document.getElementById('wizard-next').addEventListener('click', function () {
            if (state.draft.step === 1) {
                state.draft.settingsTouched = { S: true, L: true };
                if (!Model.validateSettings(state.draft.settings).ok) { renderWizard(); return; }
            }
            if (state.draft.unsubmitted.editor) { flash('bad','请先保存此项或取消行内修改。'); return; }
            state.draft.step = Math.min(3, (state.draft.step || 1) + 1);
            const saved = persist();
            document.getElementById('wizard-alert').innerHTML=''; renderWizard();
            if (!saved.ok) flash('bad', saved.message);
            document.getElementById('wizard').scrollTop=0;
        });
        document.getElementById('wizard-commit').addEventListener('click', function () {
            if (state.storageBlocked) { flash('bad','原始备份或数据读取失败，不能提交。草稿仍在内存中。'); return; }
            if (state.draft.unsubmitted.editor) { flash('bad','请先保存此项或取消行内修改。'); return; }
            const result = Model.commitReport(window.localStorage, state.draft);
            if (!result.ok) {
                flash('bad', result.message + (result.blockers || []).map(i=>i.message).join(' '));
                renderWizard(); return;
            }
            state.confirmed = result.snapshot;
            const saved = persist();
            closeWizard({quiet:true,alreadySaved:saved});
            flash(saved.ok?'good':'bad',saved.ok?'已生成时间图谱。':'时间图谱已提交；草稿未保存，刷新后可能不能恢复本次草稿。'+saved.message);
            window.scrollTo(0,0);
        });
        document.getElementById('activity-list').addEventListener('click', function (event) {
            const button = event.target.closest('[data-draft-edit]');
            if (!button) return;
            openWizard(2, button.dataset.draftEdit);
        });
        document.getElementById('cell-popover').addEventListener('click', function (event) {
            if (event.target.closest('[data-continue]')) { openWizard(3); return; }
            if (event.target.closest('#close-popover')) {
                document.getElementById('cell-popover').hidden = true;
                return;
            }
            const button = event.target.closest('[data-draft-edit]');
            if (!button) return;
            document.getElementById('cell-popover').hidden = true;
            openWizard(2, button.dataset.draftEdit);
        });
        document.getElementById('export-png').addEventListener('click', function () {
            if (!state.confirmed) {
                flash('bad', '还没有已确认报告，不能把草稿导出成 PNG。');
                return;
            }
            try {
                const built = window.LifeExport.download(state.confirmed);
                if (built.snapshotSignature !== JSON.stringify(state.confirmed)) {
                    flash('bad', 'PNG 与已确认报告不一致，请不要使用这次下载的文件。');
                }
            } catch (error) {
                flash('bad', 'PNG 没有生成。已确认报告本身没有被改写。');
            }
        });
        document.getElementById('zoom-in').addEventListener('click', function () {
            if (state.zoom < 200) saveZoom(state.zoom + 25);
        });
        document.getElementById('zoom-out').addEventListener('click', function () {
            if (state.zoom > 50) saveZoom(state.zoom - 25);
        });
        const canvas = document.getElementById('life-grid');
        let pointerStart = null;
        canvas.addEventListener('pointermove', function (event) {
            if (event.pointerType === 'touch') return;
            showHit(event, false);
        });
        canvas.addEventListener('pointerdown', function (event) {
            pointerStart = { x: event.clientX, y: event.clientY, type: event.pointerType };
        });
        canvas.addEventListener('pointerup', function (event) {
            if (!pointerStart) return;
            const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
            pointerStart = null;
            if (moved > 12) return;
            showHit(event, true);
        });
        document.addEventListener('pointerdown', function (event) {
            const popover = document.getElementById('cell-popover');
            if (!popover.hidden && !popover.contains(event.target) && event.target !== canvas) popover.hidden = true;
        });
        boot();
    });
})();
