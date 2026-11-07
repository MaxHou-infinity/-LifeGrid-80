'use strict';
// Run in a normal Mac shell. This runner never uses persistent browser profiles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'artifacts/local-v2');
const out = path.join(base, 'native', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
fs.mkdirSync(path.join(out, 'logs'), { recursive: true });
const env = { ...process.env, LIFE_ARTIFACTS_DIR: out };
// Always test HTTP root with the committed config and project-local dependencies.
delete env.LIFE_TEST_NO_SERVER;
delete env.LIFE_RUNTIME_ROOT;
delete env.LIFE_PLAYWRIGHT_TEST_MODULE;
function run(label, args) {
    console.log('Running ' + label + '…');
    const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const code = result.status === null ? 1 : result.status;
    const output = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error : '');
    fs.writeFileSync(path.join(out, 'logs', label + '.txt'), output + '\nEXIT_CODE=' + code + '\n');
    console.log(label + ': exit ' + code);
    return { exitCode: code, output };
}
const node = run('node', ['--test', '--test-reporter=tap', ...fs.readdirSync(path.join(root, 'tests')).filter(n => n.endsWith('.test.js')).sort().map(n => 'tests/' + n)]);
const e2e = run('e2e', ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.config.js']);
const qr = run('qr-decode', ['scripts/decode_png_qr.cjs', path.join(out, 'png')]);
const json = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const browser = json(path.join(out, 'logs/e2e-results.json'));
const decoded = json(path.join(out, 'png-qr-decoded.json'));
const count = name => Number(node.output.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1] || 0);
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
function listFiles(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? listFiles(dir + '/' + entry.name) : [dir + '/' + entry.name]);
}
const files = ['index.html', 'css/styles.css', ...listFiles('js'), ...listFiles('vendor'), 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'playwright.config.js', ...listFiles('tests'), ...listFiles('scripts'), ...listFiles('docs')];
const fileHashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const passed = node.exitCode === 0 && e2e.exitCode === 0 && qr.exitCode === 0
    && count('tests') > 0 && count('fail') === 0 && count('skipped') === 0 && count('todo') === 0 && count('cancelled') === 0
    && browser?.stats?.expected > 0 && browser?.stats?.skipped === 0 && browser?.stats?.unexpected === 0 && browser?.stats?.flaky === 0
    && decoded?.count > 0;
const result = {
    status: passed ? 'PASS' : 'FAIL', version: '2.0.0', commit,
    runDirectory: path.relative(root, out), nodeExitCode: node.exitCode,
    node: { tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), todo: count('todo') },
    e2eExitCode: e2e.exitCode, e2e: browser?.stats || null,
    independentFullPNGQRExitCode: qr.exitCode, decodedPNGCount: decoded?.count || 0,
    chromiumSandbox: true, isolatedContexts: true, fileHashes
};
fs.writeFileSync(path.join(out, 'native-result.json'), JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(path.join(base, 'native-latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log('EXIT_CODE=' + (passed ? 0 : 1));
process.exitCode = passed ? 0 : 1;
