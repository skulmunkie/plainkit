// Runs the in-browser element suite (core/tests/browser/), a local manual safety net (nothing checks it in CI or against the sources). Node only, no dependencies,
// no browser package: it starts the SDK's own static server with --write-reports, opens the suite in a headless Chrome (or Edge) you already have
// installed, waits for the page to post its report (core/tests/browser/report.json, local scratch output, not committed), prints the passed and failed
// counts, then stops the server and the browser and deletes the temporary profile.
//
//   node scripts/attest-browser.mjs [--port 5341] [--timeout 420] [--width 1280] [--height 900] [--filter a,b] [--elements x,y]
//   --filter / --elements: a targeted run (the inner loop). Only the cases whose name contains a --filter substring or names an --elements element run (core/tests/browser/case-filter.js);
//   the output says "N of M cases selected", and a filter that matches nothing exits 1. The full suite stays the integration-batch and release check.
//
// Browser: PK_CHROME (a path to chrome, chromium or msedge), else the usual install paths and PATH names for the platform. PK_CHROME_FLAGS adds
// extra flags (space separated; a CI container may need --no-sandbox).
// Viewport: keep it at desktop size. A small window (about 486x425) made the suite flaky, so the default is 1280x900 and a smaller one is refused.
// Time: the full suite takes about 10 minutes (575 s for 658 cases on a developer machine); the default timeout is 1800 s.
// Trace: every run writes a trace (pk-attest-trace-<time>.log in the temp folder, one line per server and page event, flushed as it happens, so it survives a hang). It is deleted when the
//   run passes and its path printed when the run fails or trips. Traces and profile folders older than 3 days (a failed or killed run) are deleted at the start of the next run. The page beats every 3 s and reports each case start and end; a case whose beat stops for 30 s froze the page (a loop no
//   timer can interrupt): it is recorded as a failed case by name, the browser is restarted at the next case (?from=n) and the run goes on, so a run always completes or names the case.
// Exit code: 0 when every case passed, 1 when a case failed, 2 when the run
// itself could not finish (no browser, port in use, timeout).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGenerated } from './generated.mjs';
import { writeRunStamp } from './verify-guard.mjs';
import { cpuScale } from '../core/tests/browser/cpu-scale.js';
import { parseList } from '../core/tests/browser/case-filter.js';
import { makeTempDir, removeTree, removeTreeAsync, tempRoot } from '../core/tools/tempdir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportFile = path.join(root, 'core', 'tests', 'browser', 'report.json');
const MAX_RESTARTS = 20;
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

// ", N of M cases selected (filter ...)" for a targeted run, "" for the full suite.
export function selectionNote(report) {
    if (!report?.filter) return '';
    const f = [...report.filter.filter.map(s => `filter ${s}`), ...report.filter.elements.map(s => `element ${s}`)].join(', ');
    return `; targeted: ${report.selected} of ${report.totalCases} cases selected (${f})`;
}

// True when `current` is a report from a run other than the one recorded before this script started.
export function isNewRun(previousRan, current) {
    return Boolean(current) && typeof current.ran === 'string' && current.ran !== previousRan;
}

// Command line -> options; an unknown flag or a too-small window is an error message (the second value), not a silent default.
export function parseArgs(argv) {
    const o = { port: 5341, timeout: 1800, width: 1280, height: 900, filter: [], elements: [] };
    const num = (flag, v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} needs a positive whole number`); return n; };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (['--port', '--timeout', '--width', '--height'].includes(a)) o[a.slice(2)] = num(a, argv[++i]);
        else if (a === '--filter' || a === '--elements') {
            const v = argv[++i];
            if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
            o[a.slice(2)].push(...parseList(v));
        } else throw new Error(`unknown argument ${a}`);
    }
    if (o.width < MIN_WIDTH || o.height < MIN_HEIGHT) throw new Error(`the window must be at least ${MIN_WIDTH}x${MIN_HEIGHT} (a small viewport made the suite flaky); got ${o.width}x${o.height}`);
    return o;
}

// The one-line reason a run ended without a report: the browser exiting early (crash, profile lock, a second instance handing the URL
// to an already running browser) is not "raise --timeout". `exit` is { code, signal } or null while the browser still runs; `where` says what the page was last doing.
export function noReportMessage({ timeout, url, exit = null, elapsed = 0, lines = [], where = '' }) {
    const tail = (lines.length ? ` Last server output: ${lines.slice(-3).join(' | ')}` : '') + (where ? ` ${where}` : '');
    if (exit) return `The browser exited (code ${exit.code ?? 'none'}${exit.signal ? `, signal ${exit.signal}` : ''}) after ${Math.round(elapsed)} s without writing a report: it crashed, or another browser took over the URL. Close other Chrome/Edge runs, or try PK_CHROME_FLAGS=--disable-extensions; open ${url} in a visible tab to see the page.${tail}`;
    return `No report within ${timeout} s (the full suite takes about 10 minutes (575 s for 658 cases on a developer machine), more on a busy machine): raise --timeout, and check the browser can open ${url}.${tail}`;
}

/** One `progress {json}` line the server prints for a page report -> { state, i, n, ms, ok, name, error, step }, or null for any other line. */
export function parseProgressLine(line) {
    if (!String(line).startsWith('progress {')) return null;
    try { const d = JSON.parse(String(line).slice(9)); return d && ['start', 'end', 'beat'].includes(d.state) ? d : null; } catch { return null; }
}

/** The run's own record of what the page reported: { n, results: Map(index -> { name, ok, ms, error }), open: { i, name } | null, beatAt }. */
export const newProgress = (now = Date.now()) => ({ n: 0, results: new Map(), open: null, beatAt: now, step: '' });
export function applyProgress(run, ev, now = Date.now()) {
    run.beatAt = now; run.n = ev.n || run.n;
    if (ev.state === 'start') { run.open = { i: ev.i, name: ev.name }; run.step = ''; }
    else if (ev.state === 'end') { run.results.set(ev.i, { name: ev.name, ok: ev.ok === true, ms: ev.ms, error: ev.error || undefined }); run.open = null; }
    else if (ev.step) run.step = ev.step;
    return run;
}
export const FREEZE_MS = 30000;
/** The case the page froze in (a case is open and no event, not even the 3 s beat, for FREEZE_MS), or null. */
export const frozenCase = (run, now = Date.now(), freezeMs = FREEZE_MS) => (run.open && now - run.beatAt > freezeMs ? run.open : null);
/** "Last case reported by the page: ..." for a run that never reported. */
export function whereMessage(run) {
    if (run.open) return `The page was in case ${run.open.i}/${run.n} "${run.open.name}" (started, never finished${run.step ? `; last helper ${run.step}` : ''}).`;
    return run.results.size ? `The last case the page finished was ${Math.max(...run.results.keys())}/${run.n}.` : '';
}
/** { passed, failed, total, ok } from the progress record of a run that restarted the page (the page's own report only covers its last part). */
export function summarizeProgress(run) {
    const all = [...run.results.values()], passed = all.filter(r => r.ok).length;
    return { passed, failed: all.length - passed, total: all.length, ok: all.length === run.n && passed === all.length && passed > 0 };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readReport = () => { try { return JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { return null; } }; // missing or half-written: not there yet

// Stops a process and everything it started (a browser has many children; Windows keeps a profile folder locked until they are gone).
export function killTree(child) {
    if (!child || child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

export const removeDir = dir => removeTreeAsync(dir); // clears read-only, retries EBUSY/EPERM/ENOTEMPTY with backoff (core/tools/tempdir.mjs)

// A failed run keeps its trace for reading and a killed run (tool timeout, Ctrl+C) never reaches its own clean-up, so pk-attest- traces and profile
// folders would pile up in the temp folder. Each run deletes the ones older than STALE_MS first (never `keep`, its own). Returns the names it removed.
export const STALE_MS = 3 * 24 * 3600 * 1000;
export function pruneStale(dir, { now = Date.now(), maxAgeMs = STALE_MS, keep = [] } = {}) {
    let names;
    try { names = fs.readdirSync(dir); } catch (e) { console.error(`Could not list ${dir} to prune old pk-attest files: ${e.message}`); return []; }
    const removed = [];
    for (const name of names.filter(n => n.startsWith('pk-attest-'))) {
        const p = path.join(dir, name);
        if (keep.includes(p)) continue;
        const st = fs.lstatSync(p, { throwIfNoEntry: false });
        if (!st || now - st.mtimeMs <= maxAgeMs) continue;
        if (removeTree(p, { attempts: 2 })) removed.push(name); else console.error(`Could not delete the old ${p}; delete it by hand.`);
    }
    return removed;
}

// Starts a browser and waits until `probe()` returns a value (a DevTools port file, a listening port). A runner starved of CPU sometimes never gets there within the
// wait (#1457), so the launch alone is retried: up to `attempts`, the previous child killed and the profile folder emptied first. Nothing after the launch retries.
// Resolves { browser, value, attempts }; rejects naming the attempts, the browser path and the last stderr line.
export async function launchBrowser({ chrome, profile, args, probe, attempts = 3, waitMs = 15000 * cpuScale(), spawnFn = spawn, kill = killTree, remove = removeDir, pollMs = 150, now = Date.now, sleepFn = sleep }) {
    let lastErr = '';
    for (let n = 1; n <= attempts; n++) {
        if (n > 1) {
            if (!(await remove(profile))) throw new Error(`could not delete the browser profile ${profile} before attempt ${n}`);
            fs.mkdirSync(profile, { recursive: true });
        }
        const browser = spawnFn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });
        lastErr = '';
        browser.stderr?.on('data', d => { lastErr = (lastErr + d).split(/\r?\n/).filter(l => l.trim()).pop()?.slice(0, 300) ?? ''; });
        browser.once?.('error', e => { lastErr = e.message; });
        for (const end = now() + waitMs; now() < end;) {
            let value = null;
            try { value = await probe(); } catch (e) { lastErr = `probe: ${e.message}`.slice(0, 300); } // a port file still being written (EBUSY on Windows) is not ready yet; the message is kept for the final error
            if (value) return { browser, value, attempts: n };
            await sleepFn(pollMs);
        }
        kill(browser);
    }
    throw new Error(`the browser did not open a DevTools port within ${Math.round(waitMs / 1000)} s in ${attempts} attempts (${chrome}; last stderr: ${lastErr || 'none'})`);
}

async function main() {
    let options;
    try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    let chrome;
    try { chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) }); } catch (e) { console.error(e.message); return 2; }
    if (!chrome) { console.error('No Chrome, Chromium or Edge found. Install one, or set PK_CHROME to its path.'); return 2; }

    ensureGenerated(); // the suite loads the generated element modules; a fresh clone has none (node scripts/bootstrap.mjs)
    const before = readReport();
    const profile = makeTempDir('pk-attest-');
    const tracePath = path.join(tempRoot(), `pk-attest-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    const pruned = pruneStale(tempRoot(), { keep: [profile, tracePath] });
    if (pruned.length) console.log(`removed ${pruned.length} pk-attest file(s) older than ${STALE_MS / 86400000} days from ${tempRoot()}`);
    const t0 = Date.now();
    const trace = text => { try { fs.appendFileSync(tracePath, `${new Date().toISOString()} +${((Date.now() - t0) / 1000).toFixed(1)}s ${text}\n`); } catch (e) { console.error(`trace write failed: ${e.message}`); } };
    const query = new URLSearchParams();
    if (options.filter.length) query.set('filter', options.filter.join(','));
    if (options.elements.length) query.set('elements', options.elements.join(','));
    const urlFrom = from => { const q = new URLSearchParams(query); if (from > 1) q.set('from', String(from)); return `http://localhost:${options.port}/tests/browser/${q.size ? `?${q}` : ''}`; };
    const url = urlFrom(1);
    const run = newProgress();
    let server = null, browser = null, code = 2, restarts = 0;
    try {
        server = spawn(process.execPath, [path.join(root, 'core', 'tools', 'serve.mjs'), String(options.port), '--write-reports'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let serverError = '';
        const serverLines = [];
        server.stderr.on('data', d => { serverError += d; trace(`server stderr: ${String(d).trim().slice(0, 300)}`); });
        server.stdout.on('data', d => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) {
            const ev = parseProgressLine(l.trim());
            if (!ev) { serverLines.push(l.trim()); trace(`server: ${l.trim()}`); continue; }
            applyProgress(run, ev);
            if (ev.state !== 'beat') trace(`${ev.state} ${ev.i}/${ev.n}${ev.state === 'end' ? ` ${ev.ok ? 'ok' : 'FAIL'} ${ev.ms} ms` : ''} ${ev.name}${ev.error ? ` -- ${ev.error}` : ''}`);
            else trace(`beat ${ev.i}/${ev.n}${ev.step ? ` step ${ev.step}` : ''}`);
        } });
        await new Promise((resolve, reject) => {
            server.once('exit', c => reject(new Error(`the server exited with ${c}: ${serverError.trim() || 'port in use?'}`)));
            server.stdout.on('data', d => { if (String(d).includes('http://localhost')) resolve(); });
            setTimeout(() => reject(new Error('the server did not start within 10 s')), 10000);
        });
        server.removeAllListeners('exit');
        console.log(`server on ${url}; browser ${chrome}; window ${options.width}x${options.height}; trace ${tracePath}`);
        trace(`run start: ${url}`);
        let browserExit = null, exitedAt = 0;
        const launch = from => {
            browserExit = null;
            run.beatAt = Date.now(); run.open = null;
            browser = spawn(chrome, chromeArgs({ profile, url: urlFrom(from), width: options.width, height: options.height, extra: process.env.PK_CHROME_FLAGS }), { stdio: 'ignore', detached: process.platform !== 'win32' });
            const mine = browser;
            mine.once('exit', (c, sig) => { if (browser === mine) { browserExit = { code: c, signal: sig }; exitedAt = Date.now(); trace(`browser exited code ${c} signal ${sig}`); } });
        };
        launch(1);

        const started = Date.now(); let current = null, finishedByEvents = false;
        while (Date.now() - started < options.timeout * 1000) {
            await sleep(2000);
            current = readReport();
            if (isNewRun(before?.ran ?? null, current)) break;
            current = null;
            const frozen = frozenCase(run);
            if (frozen) {
                const error = `froze the page: no heartbeat for ${FREEZE_MS / 1000} s (a synchronous or microtask loop no timer can interrupt${run.step ? `; last helper ${run.step}` : ''}); the browser was restarted at the next case`;
                run.results.set(frozen.i, { name: frozen.name, ok: false, ms: FREEZE_MS, error });
                console.error(`case ${frozen.i}/${run.n} "${frozen.name}" ${error}`);
                trace(`FROZEN ${frozen.i}/${run.n} ${frozen.name}`);
                killTree(browser); restarts++;
                if (frozen.i >= run.n) { finishedByEvents = true; break; }
                if (restarts > MAX_RESTARTS) { console.error(`the page froze ${restarts} times; stopping`); break; }
                await sleep(1500);
                launch(frozen.i + 1);
                continue;
            }
            if (browserExit && Date.now() - exitedAt > 6000) break; // a page that finished may still be saving its report: give it a few seconds
        }
        if (!current && !finishedByEvents) { console.error(noReportMessage({ timeout: options.timeout, url, exit: browserExit, elapsed: (Date.now() - started) / 1000, lines: serverLines.slice(-3), where: whereMessage(run) })); return 2; }

        const took = Math.round((Date.now() - started) / 1000);
        if (restarts > 0) {
            // the page's own report covers only its last part: the record of every case is the progress the page sent
            const sum = summarizeProgress(run);
            console.log(`browser run (page restarted ${restarts} time${restarts === 1 ? '' : 's'}): ${sum.passed} passed, ${sum.failed} failed, ${sum.total} of ${run.n} cases, ${took} s`);
            for (const [i, r] of [...run.results].sort((a, b) => a[0] - b[0])) if (!r.ok) console.log(`  FAIL ${r.name}: ${r.error ?? ''}`);
            code = sum.ok ? 0 : 1;
            return code;
        }
        const sum = summarizeReport(current);
        if (!sum) { console.error(`${reportFile} is not a valid report (no results/passed/failed); delete it and run again.`); return 2; }
        console.log(`browser run ${sum.ran}: ${sum.passed} passed, ${sum.failed} failed, ${sum.total} cases${selectionNote(current)}, ${took} s`);
        if (current.filter && sum.total === 0) { console.error('The filter matched no case: check --filter / --elements against the case names in core/tests/browser/cases*.js.'); return 1; }
        for (const r of current.results.filter(r => !r.ok)) console.log(`  FAIL ${r.name}: ${r.error ?? ''}`);
        code = sum.ok ? 0 : 1;
        if (code === 1 && !current.results.some(r => !r.ok)) console.error(`The run failed without a failing case: ${sum.passed} passed + ${sum.failed} failed of ${sum.total} recorded results (the suite may have stopped part way).`);
    } catch (e) {
        console.error(e.message);
        code = 2;
    } finally {
        killTree(browser);
        killTree(server);
        if (code < 2 && !options.filter.length && !options.elements.length) writeRunStamp(root, 'browser', code === 0); // which tree this full run belongs to (scripts/gate-check.mjs, #1754)
        await sleep(500);
        if (!(await removeDir(profile))) console.error(`Could not delete the temporary profile ${profile}; delete it by hand.`);
        if (code === 0) { try { fs.rmSync(tracePath, { force: true }); } catch (e) { console.error(`Could not delete the trace ${tracePath}: ${e.message}`); } } else if (fs.existsSync(tracePath)) console.error(`trace of this run: ${tracePath}`);
    }
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
