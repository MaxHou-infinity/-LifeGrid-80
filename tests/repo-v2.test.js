'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../js/utils');
const E = require('../js/export');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('独立仓库：本地运行资源存在且可在子路径解析；官网导航是显式外链', () => {
    const html = read('index.html');
    const local = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
    assert.equal(local.length, 8);
    for (const url of local) {
        assert.ok(!url.startsWith('/'), url);
        const nested = new URL(url, 'https://example.test/life-calculator/index.html');
        assert.ok(nested.pathname.startsWith('/life-calculator/'));
        assert.ok(fs.existsSync(path.join(root, url.split('?')[0])), url);
        assert.doesNotMatch(url, /releases\/|v4-t136/);
    }
    assert.match(html, /<title>人生计算器 \/ Life Calculator · v2.0<\/title>/);
    assert.match(html, /href="https:\/\/maxhou.cn\/pages\/agent-diary.html"/);
});

test('独立仓库：README 文档与图片链接真实存在，hero 为交接原字节，命令有项目入口', () => {
    for (const file of ['README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'docs/DEVELOPMENT.md', 'docs/TESTING.md']) {
        const text = read(file);
        const links = [...text.matchAll(/\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)].map(m => m[1] || m[2]);
        for (const link of links.filter(u => !/^(?:https?:|#)/.test(u))) {
            const target = path.resolve(path.dirname(path.join(root, file)), link.split('#')[0]);
            assert.ok(target.startsWith(root + path.sep));
            assert.ok(fs.existsSync(target), file + ': ' + link);
        }
    }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/images/lifegrid-v2-hero.jpg'))).digest('hex');
    assert.equal(hash, 'e9a579a4bffe9a933c6aadc7e151ff83f8673db96091181d1d0cb367f6211277');
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    assert.equal(pkg.version, '2.0.0');
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[''].version, pkg.version);
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
        assert.match(version, /^\d+\.\d+\.\d+$/);
        assert.equal(lock.packages[''].devDependencies[name], version);
        assert.equal(lock.packages['node_modules/' + name].version, version);
    }
    for (const match of read('README.md').matchAll(/npm run ([\w:]+)/g)) assert.ok(pkg.scripts[match[1]], match[1]);
    assert.ok(pkg.scripts.start && pkg.scripts.test);
});

test('指定验例：26—80，睡眠7h+阅读2h余33.75年；30—80余31.25年；PNG只读已确认', () => {
    const source = read('tests/ui-contract.test.js').split('const sleep=')[0];
    const harness = new Function('require', '__dirname', source + '\nreturn harness;')(require, __dirname);
    const h = harness();
    h.click('open-planner'); h.setting('S', '26'); h.setting('L', '80'); h.click('wizard-next');
    h.input(h.row('sleep', 'daily', { timeAmount: '7', frequency: 'daily' }), 'timeAmount', '7');
    h.click('wizard-next');
    assert.equal(h.get('daily-value').textContent, '459');
    const row = h.row('empty-explore', 'explore', { name: '阅读', timeAmount: '', frequency: 'weekly' });
    h.input(row, 'name', '阅读'); h.input(row, 'timeAmount', '2'); h.input(row, 'frequency', 'daily');
    assert.equal(h.get('explore-value').textContent, '33.75');
    assert.equal(h.storage.getItem(M.KEY_CONFIRMED), null);
    h.click('wizard-commit');
    const before = h.storage.getItem(M.KEY_CONFIRMED), snap = JSON.parse(before), backup = h.storage.getItem(M.KEY_BACKUP);
    assert.deepEqual(snap.activities.map(a => a.durationYears), [54, 54]);
    const png = E.content(snap);
    assert.equal(png.balance, '尚未分配 33.75 年');
    assert.doesNotMatch(png.lines.join(' '), /小时|8736|728|×/);
    h.click('edit-report'); h.click('wizard-back'); h.click('wizard-back'); h.setting('S', '30');
    h.click('wizard-next'); h.click('wizard-next');
    assert.equal(h.get('explore-value').textContent, '31.25');
    h.fire('wizard', 'cancel');
    const draft = JSON.parse(h.storage.getItem(M.KEY_DRAFT));
    assert.deepEqual(draft.activities.map(a => [a.durationYears, a.durationMode]), [[50, 'stage'], [50, 'stage']]);
    assert.equal(h.storage.getItem(M.KEY_CONFIRMED), before);
    assert.deepEqual(E.content(JSON.parse(h.storage.getItem(M.KEY_CONFIRMED))), png);
    assert.equal(h.storage.getItem(M.KEY_BACKUP), backup);
    h.click('edit-report'); h.click('wizard-commit');
    const after = JSON.parse(h.storage.getItem(M.KEY_CONFIRMED));
    assert.deepEqual(after.activities.map(a => a.id), snap.activities.map(a => a.id));
    assert.equal(E.content(after).balance, '尚未分配 31.25 年');
});
