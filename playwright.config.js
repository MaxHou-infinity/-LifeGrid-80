const path = require('node:path');
const artifacts = process.env.LIFE_ARTIFACTS_DIR
    ? path.resolve(process.env.LIFE_ARTIFACTS_DIR)
    : path.join(__dirname, 'artifacts/local-v2/browser');
module.exports = {
    testDir: path.join(__dirname, 'tests'),
    testMatch: /(?:e2e|iteration-v4|repo-v2)\.spec\.js/,
    timeout: 60000,
    expect: { timeout: 10000 },
    workers: 1,
    outputDir: path.join(artifacts, 'e2e-results'),
    reporter: [['line'], ['json', { outputFile: path.join(artifacts, 'logs/e2e-results.json') }]],
    use: {
        channel: 'chrome',
        launchOptions: { chromiumSandbox: true },
        viewport: { width: 1440, height: 1000 },
        baseURL: 'http://127.0.0.1:4173',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    // Each test gets a fresh context. Never use the user's profile or storage.
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1',
        cwd: __dirname,
        port: 4173,
        reuseExistingServer: false,
        timeout: 10000
    }
};
