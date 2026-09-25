// Runs the in-browser element suite (core/tests/browser/) and refreshes its attestation (core/tests/browser/report.json). Node only, no dependencies,
// no browser package: it starts the SDK's own static server with --write-reports, opens the suite in a headless Chrome (or Edge) you already have
// installed, waits for the page to post its report, prints the passed and failed counts, re-runs core/tests/elements-attest.test.mjs against the new
// report, then stops the server and the browser and deletes the temporary profile.
//
//   node scripts/attest-browser.mjs [--port 5341] [--timeout 420] [--width 1280] [--height 900] [--no-attest]
//
// Browser: PK_CHROME (a path to chrome, chromium or msedge), else the usual install paths and PATH names for the platform. PK_CHROME_FLAGS adds
// extra flags (space separated; a CI container may need --no-sandbox).
// Viewport: keep it at desktop size. A small window (about 486x425) made the suite flaky, so the default is 1280x900 and a smaller one is refused.
// Time: the suite takes about 170 s; the default timeout is 420 s.
// Exit code: 0 when every case passed and the attestation test passes, 1 when a case failed or the attestation test failed, 2 when the run
// itself could not finish (no browser, port in use, timeout).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGenerated } from './generated.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportFile = path.join(root, 'core', 'tests', 'browser', 'report.json');
export const MIN_WIDTH = 1024;
export const MIN_HEIGHT = 700;

// Where a browser is usually installed, most likely first. `env` is process.env, `pathDirs` the PATH entries (only used off Windows).
export function chromeCandidates({ env = process.env, platform = process.platform, pathDirs = [] } = {}) {
    const list = [];
    if (env.PK_CHROME) list.push(env.PK_CHROME);
    if (platform === 'win32') {
        const join = (base, ...rest) => (base ? path.win32.join(base, ...rest) : null);
        for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]) list.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        for (const base of [env['PROGRAMFILES(X86)'], env.PROGRAMFILES]) list.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    } else if (platform === 'darwin') {
        list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    } else {
        for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) for (const dir of pathDirs) list.push(path.posix.join(dir, name));
        list.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium');
    }
    return list.filter(Boolean);
}

// The first candidate `exists` accepts, or null. A PK_CHROME that does not exist is an error worth saying, not something to skip silently.
export function findChrome(options = {}, exists = fs.existsSync) {
    const env = options.env ?? process.env;
    if (env.PK_CHROME && !exists(env.PK_CHROME)) throw new Error(`PK_CHROME is set to ${env.PK_CHROME}, which does not exist`);
    return chromeCandidates(options).find(p => exists(p)) ?? null;
}

// The flags that worked on this repository: the new headless mode, no GPU, no first-run pages, a throwaway profile, a desktop-sized window.
export function chromeArgs({ profile, url, width = 1280, height = 900, extra = '' }) {
    return ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, ...String(extra).split(/\s+/).filter(Boolean), url];
}

// { passed, failed, total, ran, ok } from a parsed report.json (null when it is not a report).
export function summarizeReport(report) {
    if (!report || !Array.isArray(report.results) || typeof report.passed !== 'number' || typeof report.failed !== 'number') return null;
    return { passed: report.passed, failed: report.failed, total: report.results.length, ran: report.ran ?? null, ok: report.failed === 0 && report.results.length === report.passed + report.failed && report.passed > 0 };
}

// True when `current` is a report from a run other than the one recorded before this script started.
export function isNewRun(previousRan, current) {
    return Boolean(current) && typeof current.ran === 'string' && current.ran !== previousRan;
}

// Command line -> options; an unknown flag or a too-small window is an error message (the second value), not a silent default.
export function parseArgs(argv) {
    const o = { port: 5341, timeout: 420, width: 1280, height: 900, attest: true };
    const num = (flag, v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} needs a positive whole number`); return n; };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--no-attest') o.attest = false;
        else if (['--port', '--timeout', '--width', '--height'].includes(a)) o[a.slice(2)] = num(a, argv[++i]);
        else throw new Error(`unknown argument ${a}`);
    }
    if (o.width < MIN_WIDTH || o.height < MIN_HEIGHT) throw new Error(`the window must be at least ${MIN_WIDTH}x${MIN_HEIGHT} (a small viewport made the suite flaky); got ${o.width}x${o.height}`);
    return o;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readReport = () => { try { return JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { return null; } }; // missing or half-written: not there yet

// Stops a process and everything it started (a browser has many children; Windows keeps a profile folder locked until they are gone).
export function killTree(child) {
    if (!child || child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

export async function removeDir(dir) {
    for (let i = 0; i < 20; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch { await sleep(500); } // a browser child may still hold a file: retry
    }
    return false;
}

async function main() {
    let options;
    try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    let chrome;
    try { chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) }); } catch (e) { console.error(e.message); return 2; }
    if (!chrome) { console.error('No Chrome, Chromium or Edge found. Install one, or set PK_CHROME to its path.'); return 2; }

    ensureGenerated(); // the suite loads the generated element modules; a fresh clone has none (node scripts/bootstrap.mjs)
    const before = readReport();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-attest-'));
    const url = `http://localhost:${options.port}/tests/browser/`;
    let server = null, browser = null, code = 2;
    try {
        server = spawn(process.execPath, [path.join(root, 'core', 'tools', 'serve.mjs'), String(options.port), '--write-reports'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let serverError = '';
        server.stderr.on('data', d => { serverError += d; });
        await new Promise((resolve, reject) => {
            server.once('exit', c => reject(new Error(`the server exited with ${c}: ${serverError.trim() || 'port in use?'}`)));
            server.stdout.on('data', d => { if (String(d).includes('http://localhost')) resolve(); });
            setTimeout(() => reject(new Error('the server did not start within 10 s')), 10000);
        });
        server.removeAllListeners('exit');
        console.log(`server on ${url}; browser ${chrome}; window ${options.width}x${options.height}`);
        browser = spawn(chrome, chromeArgs({ profile, url, width: options.width, height: options.height, extra: process.env.PK_CHROME_FLAGS }), { stdio: 'ignore', detached: process.platform !== 'win32' });

        const started = Date.now(); let current = null;
        while (Date.now() - started < options.timeout * 1000) {
            await sleep(2000);
            current = readReport();
            if (isNewRun(before?.ran ?? null, current)) break;
            current = null;
        }
        if (!current) { console.error(`No report within ${options.timeout} s (the suite needs about 170 s): raise --timeout, and check the browser can open ${url}`); return 2; }

        const sum = summarizeReport(current);
        console.log(`browser run ${sum.ran}: ${sum.passed} passed, ${sum.failed} failed, ${sum.total} cases`);
        for (const r of current.results.filter(r => !r.ok)) console.log(`  FAIL ${r.name}: ${r.error ?? ''}`);
        code = sum.ok ? 0 : 1;
        if (options.attest) {
            const t = spawnSync(process.execPath, ['--test', path.join(root, 'core', 'tests', 'elements-attest.test.mjs')], { cwd: root, encoding: 'utf8' });
            console.log(t.status === 0 ? 'elements-attest.test.mjs: passed' : `elements-attest.test.mjs: FAILED\n${t.stdout}${t.stderr}`);
            if (t.status !== 0) code = 1;
        }
    } catch (e) {
        console.error(e.message);
        code = 2;
    } finally {
        killTree(browser);
        killTree(server);
        await sleep(500);
        if (!(await removeDir(profile))) console.error(`Could not delete the temporary profile ${profile}; delete it by hand.`);
    }
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
