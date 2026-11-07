/* Three pages. Unfilled rows are placeholders; records acquire one stable ID at first input. */
(function () {
    'use strict';
    const M = window.LifeModel;
    const GROUP = { daily: '日常', supplement: '补充日常', explore: '探索' };
    const FREQ = { daily: '天', weekly: '周', monthly: '月', yearly: '年' };
    const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const number = n => String(Math.round(n * 1000) / 1000);
    const options = selected => Object.entries(FREQ).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`).join('');
    function ensureMeta(d) {
        d.step = Math.min(3, Math.max(1, d.step || 1));
        M.ensureActivityColors(d.activities);
        d.unsubmitted = d.unsubmitted || {};
        d.placeholders = d.placeholders || { daily: [], explore: ['empty-explore'] };
        d.settingsTouched = d.settingsTouched || {};
        const initial=M.validateSettings(d.settings);
        if(initial.ok)d.durationStageAnchor={S:initial.values.S,L:initial.values.L};
        const editor = d.unsubmitted.editor;
        if (editor && !editor.key.startsWith('activity:') && !M.TEMPLATES.some(t=>t.key===editor.key)) {
            const old = d.activities.find(a=>a.id===editor.key);
            if (old) editor.key = 'activity:' + old.id;
        }
    }
    function years(d) { const v = M.validateSettings(d.settings); return v.ok ? M.budgetFromValues(v.values).D : null; }
    function updateStageSettings(d, key, value) {
        const anchor=d.durationStageAnchor;
        d.settings[key] = value;
        const validation=M.validateSettings(d.settings);
        if(!validation.ok)return; // Retain the last valid stage across temporarily empty/invalid input.
        const current={S:validation.values.S,L:validation.values.L};
        if(anchor && anchor.S===current.S && anchor.L===current.L)return;
        const unknown=d.activities.some(a=>!['stage','manual'].includes(a.durationMode));
        if(unknown && !d.durationCompatibilityOriginalRaw){
            // Keep the first pre-conversion draft string; never overwrite the existing raw-backup key.
            try{d.durationCompatibilityOriginalRaw=window.localStorage.getItem(M.KEY_DRAFT)||JSON.stringify(d);}catch(_error){d.durationCompatibilityOriginalRaw=JSON.stringify(d);}
        }
        const span=M.budgetFromValues(validation.values).D;
        d.activities.forEach(a=>{
            // Max explicitly authorized all unknown old durations (including hand-filled10) to follow stage.
            if(a.durationMode!=='manual'){a.durationYears=span;a.durationMode='stage';}
        });
        d.durationStageAnchor=current;
    }
    function row(d, activity, key, group, name) {
        const a = activity || { name: name || '', timeAmount: '', frequency: group === 'explore' ? 'weekly' : 'daily' };
        const known = Boolean(activity);
        const status = known ? M.summarize(d.settings, [a]).items[0] : null;
        const issues = status && status.status === 'uncalculable' ? status.issues.join('；') : '';
        const label = a.name || '探索项目';
        const title = name ? `<span class="row-name">${esc(name)}</span>` : `<input aria-label="${group === 'explore' ? '探索' : '日常'}名称" data-field="name" value="${esc(a.name)}" placeholder="名称">`;
        let html = `<div class="compact-row" data-row="${esc(key)}" data-group="${group}" ${known ? `data-activity-id="${esc(a.id)}"` : ''}><div class="compact-fields">${title}<input inputmode="decimal" aria-label="${esc(label)}耗时" data-field="timeAmount" value="${esc(a.timeAmount)}" placeholder="—"><span class="unit">小时/</span><select data-field="frequency" aria-label="${esc(label)}频率">${options(a.frequency)}</select><span class="more-slot">${known ? `<button type="button" class="text-btn more" data-more="${esc('activity:' + a.id)}">更多</button>` : !name ? `<button type="button" class="text-btn more" data-remove="${esc(key)}" aria-label="移除空行">×</button>` : ''}</span></div>`;
        if (status && status.status === 'over-horizon') html += `<p class="row-status">保留原 ${esc(a.durationYears)} 年，超出当前阶段，待修正</p>`;
        if (a.excludedByUser) html += '<p class="row-status">已明确排除，不计入统计范围</p>';
        else if (issues) html += `<p class="row-status">${esc(issues)}</p>`;
        if (d.unsubmitted.editor && d.unsubmitted.editor.key === key) {
            const e = d.unsubmitted.editor;
            html += `<div class="row-editor" data-editor="${esc(key)}"><label>持续年数 <input aria-label="持续年数" data-editor-field="durationYears" inputmode="decimal" value="${esc(e.fields.durationYears)}"> 年</label><span data-duration-origin>${e.fields.durationMode==='stage'?'随整个阶段':e.fields.durationMode==='manual'?'手填年数':'来源未记录'}</span>${a.durationMode ? '<button type="button" class="text-btn" data-whole-stage>用整个阶段</button>' : ''}<label>分类 <select aria-label="活动分类" data-editor-field="group">${Object.entries(GROUP).map(([g,t]) => `<option value="${g}" ${e.fields.group === g ? 'selected' : ''}>${t}</option>`).join('')}</select></label>${e.error ? `<p class="field-error">${esc(e.error)}</p>` : ''}<div class="editor-actions"><button type="button" class="btn primary" data-save-editor="${esc(key)}">保存此项</button><button type="button" class="btn" data-cancel-editor>取消</button><button type="button" class="btn" data-remove="${esc(key)}">移除</button>${issues && !a.excludedByUser ? `<button type="button" class="btn" data-exclude="${esc(key)}">明确排除此项</button>` : ''}</div></div>`;
        }
        return html + '</div>';
    }
    function find(d, key) {
        if (key.startsWith('activity:')) return d.activities.find(a => a.id === key.slice(9));
        return d.activities.find(a => a.templateKey === key) || d.activities.find(a => a.rowKey === key);
    }
    function dailyRows(d) {
        let html = '<div class="table-head"><span>活动</span><span>耗时</span><span>频率</span></div><div class="compact-list" id="daily-rows">';
        M.TEMPLATES.forEach(t => {
            const a = d.activities.find(a => a.templateKey === t.key);
            if (a && a.group === 'explore') html += `<div class="compact-row"><div class="compact-fields"><span class="row-name">${t.name}</span><span class="empty-moved">已归入探索 <button type="button" class="text-btn" data-return="${esc(a.id)}">移回日常</button></span></div></div>`;
            else html += row(d, a, t.key, 'daily', t.name);
        });
        d.activities.filter(a => a.group !== 'explore' && !M.TEMPLATES.some(t => t.key === a.templateKey)).forEach(a => { html += row(d, a, 'activity:' + a.id, 'daily'); });
        d.placeholders.daily.forEach(k => { html += row(d, null, k, 'daily'); });
        return html + '</div><button type="button" class="text-btn add-row" data-add="daily">＋其他日常</button>';
    }
    function balances(d) {
        const daily = M.summarize(d.settings, d.activities.filter(a => a.group !== 'explore'), d);
        const all = M.summarize(d.settings, d.activities, d);
        return { daily, all };
    }
    function balanceText(summary, unit) {
        const scale = unit === 'months' ? M.HOURS_PER_MONTH : M.HOURS_PER_YEAR;
        return summary.budget && summary.complete ? number((summary.E > 0 ? summary.E : summary.U) / scale) : '—';
    }
    function updateBalances(d) {
        if (d.step !== 3) return;
        const { daily, all } = balances(d);
        document.getElementById('daily-label').textContent = daily.E > 0 ? '已超出这一阶段' : '日常安排后尚未分配';
        document.getElementById('daily-value').textContent = balanceText(daily, 'months');
        document.getElementById('explore-label').textContent = all.E > 0 ? '超出这一阶段' : '加入探索后尚未分配';
        document.getElementById('explore-value').textContent = balanceText(all, 'years');
        document.getElementById('daily-total').classList.toggle('warn', daily.E > 0);
        document.getElementById('explore-total').classList.toggle('warn', all.E > 0);
    }
    function render(d, confirmed) {
        ensureMeta(d);
        const body = document.getElementById('wizard-body');
        document.getElementById('wizard-progress').textContent = `${d.step}/3`;
        document.getElementById('wizard-title').textContent = ['选择人生阶段','填写日常','留给想做的事'][d.step - 1];
        document.getElementById('wizard-back').hidden = d.step === 1;
        document.getElementById('wizard-next').hidden = d.step === 3;
        document.getElementById('wizard-commit').hidden = d.step !== 3;
        document.getElementById('basis-notice').textContent = d.step === 3 && confirmed && confirmed.schemaVersion === 2 ? '生成后改用选定阶段预算口径' : '';
        if (d.step === 1) {
            const errors = M.validateSettings(d.settings).errors;
            body.innerHTML = '<p class="step-explanation">起点之前，是你暂不考虑或当时无法自主安排的阶段。</p><div class="age-fields">' + [['S','自主规划起点'],['L','预计人生岁数']].map(([key,label]) => {
                const e = d.settingsTouched[key] ? errors.filter(e => e.field === key) : [];
                return `<div><label for="setting-${key}">${label}</label><input class="age-input" id="setting-${key}" data-setting="${key}" inputmode="decimal" value="${esc(d.settings[key])}" aria-invalid="${e.length > 0}"> 岁${key === 'S' ? '<div class="quick-ages" aria-label="起点快捷值">' + [21,26,30].map(a => `<button type="button" data-age="${a}">${a}</button>`).join('') + '</div>' : ''}${e.map(e => `<p class="field-error">${esc(e.message)}</p>`).join('')}</div>`;
            }).join('') + '</div>';
        } else if (d.step === 2) body.innerHTML = '<p class="step-explanation">只填需要计入的活动，同一段时间不要重复计算。</p>' + dailyRows(d);
        else {
            let html = '<div class="budget-label" id="daily-label"></div><div class="month-value" id="daily-total"><span id="daily-value"></span><small>个月</small></div><p class="explore-question">你想把这些时间留给什么？</p><div id="explore-rows" class="compact-list">';
            d.activities.filter(a => a.group === 'explore').forEach(a => { html += row(d, a, 'activity:' + a.id, 'explore'); });
            d.placeholders.explore.forEach(k => { html += row(d, null, k, 'explore'); });
            html += '</div><button type="button" class="text-btn add-row" data-add="explore">＋探索项目</button><div class="year-balance"><div class="budget-label" id="explore-label"></div><div class="year-value" id="explore-total"><span id="explore-value"></span> 年</div></div>';
            if (d.damagedLegacyRaw) html += `<p class="banner">旧数据无法解析，统计不完整。${d.damageAcknowledged ? '已明确排除这段原文。' : '<button type="button" class="btn" data-exclude-damage>明确排除损坏原文</button>'}</p>`;
            const badDaily = M.summarize(d.settings,d.activities).items.filter(i => i.status === 'uncalculable' && i.group !== 'explore');
            if (badDaily.length) html += `<p class="banner">${badDaily.length} 项日常无法计算，统计不完整，请返回补正或明确排除。</p>`;
            const exceptional = M.summarize(d.settings,d.activities,d).warnings.filter(w=>['excluded','damage-excluded','over-horizon'].includes(w.code));
            html += exceptional.map(w=>`<p class="banner">${esc(w.message)}</p>`).join('');
            body.innerHTML = html;
            updateBalances(d);
        }
        if (d.identityRepairNotice) {
            const notice = document.createElement('p'); notice.className = 'banner'; notice.textContent = d.identityRepairNotice; body.appendChild(notice);
        }
    }
    function bind(api) {
        const body = document.getElementById('wizard-body');
        body.addEventListener('input', event => {
            const d = api.getDraft(), target = event.target;
            if (target.dataset.setting) { updateStageSettings(d,target.dataset.setting,target.value); api.persistSoon(); return; }
            if (target.dataset.editorField) {
                const editor=d.unsubmitted.editor;editor.fields[target.dataset.editorField] = target.value;
                if(target.dataset.editorField==='durationYears'){
                    editor.fields.durationMode='manual';
                    const label=document.querySelector('[data-duration-origin]');if(label)label.textContent='手填年数';
                }
                api.persistSoon();return;
            }
            const host = target.closest('[data-row]');
            if (!host || !target.dataset.field) return;
            const key = host.dataset.row, group = host.dataset.group;
            let a = find(d,key);
            if (!a) {
                const template = M.TEMPLATES.find(t => t.key === key);
                const values = Object.fromEntries([...host.querySelectorAll('[data-field]')].map(el => [el.dataset.field,el.value]));
                if (!values.name && !values.timeAmount && !template) return;
                if (template && !values.timeAmount) return;
                const id = M.createId();
                a = { id, name: template ? template.name : values.name, timeAmount: values.timeAmount, frequency: values.frequency, durationYears: years(d), durationMode: 'stage', group, color: M.nextActivityColor(d.activities,id), templateKey: template ? key : null };
                d.activities.push(a);
                // Keep DOM row key until the next render; map placeholder to stable ID.
                a.rowKey = key;
                d.placeholders[group] = d.placeholders[group].filter(k => k !== key);
                host.dataset.activityId = a.id;
                host.querySelector('.more-slot').innerHTML = `<button type="button" class="text-btn more" data-more="${esc('activity:' + a.id)}">更多</button>`;
            }
            a[target.dataset.field] = target.value;
            a.excludedByUser = false;
            const issues = M.fieldIssues(a);
            let feedback = host.querySelector('.row-status');
            const message = issues.length ? issues.join('；') : Number(a.durationYears) > years(d) ? `保留原 ${a.durationYears} 年，超出当前阶段，待修正` : '';
            if (!feedback && message) { feedback = document.createElement('p'); feedback.className = 'row-status'; host.appendChild(feedback); }
            if (feedback) { feedback.textContent = message; feedback.hidden = !message; }
            updateBalances(d); api.persistSoon();
        });
        body.addEventListener('change', event => {
            // Selects also emit input in current browsers; explicitly dispatch for other engines.
            if (event.target.tagName === 'SELECT') event.target.dispatchEvent(new Event('input',{bubbles:true}));
        });
        body.addEventListener('focusout', event => {
            if (event.target.dataset.setting) {
                const d = api.getDraft(); d.settingsTouched[event.target.dataset.setting] = true;
                const e = M.validateSettings(d.settings).errors.find(e => e.field === event.target.dataset.setting);
                event.target.setAttribute('aria-invalid',Boolean(e));
                let error = event.target.parentElement.querySelector('.field-error');
                if (e) { if (!error) { error = document.createElement('p'); error.className='field-error'; event.target.parentElement.append(error); } error.textContent=e.message; }
                else if(error) error.remove();
            }
        });
        body.addEventListener('click', event => {
            const button = event.target.closest('button'); if (!button) return;
            const d = api.getDraft();
            if (button.dataset.age) { updateStageSettings(d,'S',button.dataset.age); d.settingsTouched.S=true; api.rerender(); }
            if (button.dataset.add) { d.placeholders[button.dataset.add].push('row_' + M.createId()); api.rerender(); }
            if (button.dataset.more) openEditor(api,button.dataset.more);
            if (button.hasAttribute('data-whole-stage')) {
                d.unsubmitted.editor.fields.durationYears=years(d);d.unsubmitted.editor.fields.durationMode='stage';api.rerender();
            }
            if (button.hasAttribute('data-cancel-editor')) { delete d.unsubmitted.editor; api.rerender(); }
            if (button.dataset.saveEditor) {
                const e = d.unsubmitted.editor, a = find(d,e.key);
                if (!a) { delete d.unsubmitted.editor; api.rerender(); }
                else {
                    const checked = M.validateActivityInput(Object.assign({},a,{durationYears:e.fields.durationYears}),years(d));
                    if (!checked.ok) { e.error=checked.errors.map(i=>i.message).join('；'); api.rerender(); return; }
                    Object.assign(a,checked.value,{group:e.fields.group,excludedByUser:false});
                    if(['stage','manual'].includes(e.fields.durationMode))a.durationMode=e.fields.durationMode;
                    delete d.unsubmitted.editor;
                    d.step = a.group === 'explore' ? 3 : 2; api.rerender();
                }
            }
            if (button.dataset.remove) {
                const key=button.dataset.remove,a=find(d,key);
                if (a && !window.confirm(`移除“${a.name || '未命名活动'}”？生成后才会修改正式报告。`)) return;
                d.activities=d.activities.filter(i=>!a || i.id!==a.id);
                d.placeholders.daily=d.placeholders.daily.filter(k=>k!==key); d.placeholders.explore=d.placeholders.explore.filter(k=>k!==key);
                delete d.unsubmitted.editor; api.rerender();
            }
            if (button.dataset.exclude) {
                const a=find(d,button.dataset.exclude);
                if (!window.confirm(`“${a.name || '未命名活动'}”无法计算。确认从统计范围排除？报告和PNG将记录排除决定，余额不含此项。`)) return;
                const result=M.excludeUncalculable(a); if(result.ok) Object.assign(a,result.activity);
                delete d.unsubmitted.editor; api.rerender();
            }
            if (button.hasAttribute('data-exclude-damage')) {
                if(!window.confirm('确认排除无法解析的旧数据原文？报告与PNG将记录统计范围不完整，原文仍保留。'))return;
                d.damageAcknowledged=true;api.rerender();
            }
            if (button.dataset.return) { d.activities=M.moveGroup(d.activities,button.dataset.return,'daily'); api.rerender(); }
            api.persist();
        });
    }
    function openEditor(api,key) {
        const d=api.getDraft(), a=key.startsWith('activity:') ? find(d,key) : d.activities.find(a=>a.id===key) || find(d,key);
        key = a ? (a.group !== 'explore' && M.TEMPLATES.some(t=>t.key===a.templateKey) ? a.templateKey : 'activity:' + a.id) : key;
        if (d.unsubmitted.editor && d.unsubmitted.editor.key !== key) {
            const pending = find(d, d.unsubmitted.editor.key);
            if (pending) d.step = pending.group === 'explore' ? 3 : 2;
            api.rerender(); api.flash('bad','请先保存或取消当前行内修改。'); return;
        }
        d.unsubmitted.editor=d.unsubmitted.editor || {key,fields:{durationYears:a?a.durationYears:years(d),group:a?a.group:(d.step===3?'explore':'daily'),durationMode:a?a.durationMode:'stage'}};
        api.rerender();
        const host=[...document.querySelectorAll('[data-row]')].find(el=>el.dataset.row===key || (a && el.dataset.activityId===a.id));
        if(host)host.scrollIntoView({block:'nearest'});
    }
    window.LifeWizard={GROUP,ensureMeta,render,bind,openEditor,years,updateBalances};
})();
