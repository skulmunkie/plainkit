// Runs the whole scorecard analysis headless, in one command, and prints a readable summary (worst first). Node only, no dependencies, no browser
// package: it starts the SDK's own static server, opens the site in a headless Chrome (or Edge) you already have installed, drives it over the
// DevTools protocol (the WebSocket built into Node 22+), then stops the server and the browser and deletes the temporary profile.
//
//   node scripts/scorecard-sweep.mjs [--only sweep,quality,pages] [--port 5342] [--out <dir>] [--timeout 3600] [--concurrency 8] [--write-report]
//   sweep stage only: [--tabs 4] [--frames 3] [--kinds views,templates,samples] [--filter pk-tabs,gallery #/overview] [--widths 320,375] [--themes dark] [--fresh-frames]
//
// Stages (all three by default):
//   sweep    every gallery view, template and element example at 320, 375, 640, 1024, 1280 and 1920 px in both themes (core/site/scorecard/sweep.js):
//            overflow, controls under 44 px on a phone, nested scrollers, text under the size tiers, h1 count. Each item is loaded once and then resized and
//            re-themed (--fresh-frames loads a frame per cell, the slow cross-check), several browser tabs (--tabs, separate render processes) each run a share, and a
//            frame counts as settled when its elements are defined, its styles applied and its layout has stopped changing (no fixed sleeps). The narrowing options
//            (--kinds, --filter, --widths, --themes) are for a change under test; --write-report needs the full sweep.
//   quality  the scorecard run itself (core/modules/scorecard, the host page's own options): every element example through the SDK quality checks
//            (accessibility, layout, spacing, touch targets, focus, contrast) at every scoring width and theme, plus the measured performance and scale metrics.
//   pages    every gallery route in a real tab at a phone and a desktop width: the SDK quality checks on the live page, paint, layout shift and long
//            tasks (the performance monitor's measures, limits from js/perf-logic.js), layout and style-recalculation counts, and what the dev console
//            would show (console errors, uncaught exceptions, failed requests).
// Output: <out>/sweep.json, quality.json, pages.json and summary.md (default <repo>/scratch/scorecard/, which git ignores) and the summary on the screen.
// Report for the scorecard page: core/site/scorecard/sweep-report.json is NOT tracked (git ignores it: it goes stale with every gallery edit) and is written only
// with --write-report, from a full sweep: the counts per metric and the worst item/metric groups, a few KB (the full failing cells stay in <out>/sweep.json).
// Browser: PK_CHROME (a path to chrome, chromium or msedge), else the usual install paths and PATH names. PK_CHROME_FLAGS adds flags (a CI container may need --no-sandbox).
// Exit code: 0 when nothing failed, 1 when the analysis found failures, 2 when the run itself could not finish (no browser, port in use, timeout).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGenerated } from './generated.mjs';
import { findChrome, chromeArgs } from './attest-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WIDTHS = [320, 375, 640, 1024, 1280, 1920];
const DEFAULT_THEMES = ['dark', 'light'];
const sweepReportFile = path.join(root, 'core', 'site', 'scorecard', 'sweep-report.json');
export const STAGES = ['sweep', 'quality', 'pages'];
export const SWEEP_KINDS = ['views', 'templates', 'samples'];
export const PAGE_WIDTHS = [375, 1280];
// Core Web Vitals "good" limits (js/perf-logic.js THRESHOLDS): a page above them is listed.
export const PAGE_LIMITS = { lcp: 2500, fcp: 1800, cls: 0.1, longTaskMs: 200 };

// ---- pure helpers (tested in scripts/tests/scorecard-sweep.test.mjs) -----------------------------------------------------

export function parseArgs(argv) {
    const o = { only: [...STAGES], port: 5342, timeout: 3600, out: path.join(root, 'scratch', 'scorecard'), writeReport: false, tabs: 4, frames: 3, kinds: null, filter: null, widths: null, themes: null, fresh: false };
    const list = (flag, v, allowed) => { const l = String(v ?? '').split(',').map(x => x.trim()).filter(Boolean); if (!l.length || (allowed && l.some(x => !allowed.includes(x)))) throw new Error(`${flag} takes a comma list${allowed ? ' of ' + allowed.join(', ') : ''}`); return l; };
    const num = (flag, v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} needs a positive whole number`); return n; };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--write-report') o.writeReport = true;
        else if (a === '--only') { o.only = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.only.length || o.only.some(s => !STAGES.includes(s))) throw new Error(`--only takes a comma list of ${STAGES.join(', ')}`); }
        else if (a === '--out') { if (!argv[i + 1]) throw new Error('--out needs a folder'); o.out = path.resolve(argv[++i]); }
        else if (a === '--fresh-frames') o.fresh = true;
        else if (a === '--kinds') o.kinds = list(a, argv[++i], SWEEP_KINDS);
        else if (a === '--filter') o.filter = list(a, argv[++i]);
        else if (a === '--widths') o.widths = list(a, argv[++i]).map(x => num(a, x));
        else if (a === '--themes') o.themes = list(a, argv[++i], ['dark', 'light']);
        else if (a === '--port' || a === '--timeout' || a === '--concurrency' || a === '--tabs' || a === '--frames') o[a.slice(2)] = num(a, argv[++i]);
        else throw new Error(`unknown argument ${a}`);
    }
    if (o.writeReport && !o.only.includes('sweep')) throw new Error('--write-report needs the sweep stage');
    if (o.writeReport && (o.kinds || o.filter || o.widths || o.themes)) throw new Error('--write-report needs the full sweep (no --kinds, --filter, --widths or --themes)');
    return o;
}

// The failing measures of one sweep result as { metric, value } pairs.
export function failingMetrics(r) {
    const m = [];
    if (r.error) m.push({ metric: 'error', value: r.error });
    for (const k of ['overflow', 'smallTargets', 'nestedScrollers', 'metaTooSmall', 'readingSmall']) if (r[k] > 0) m.push({ metric: k, value: r[k] });
    if (r.h1 !== null && r.h1 !== undefined && r.h1 !== 1) m.push({ metric: 'h1', value: r.h1 });
    return m;
}

// Failures grouped by item and metric, so one item failing in 12 width/theme cells is one row: { item, metric, cells, worst, widths, themes }, most cells first.
export function groupSweep(failures) {
    const map = new Map();
    for (const f of failures ?? []) for (const { metric, value } of failingMetrics(f)) {
        const key = `${f.item}||${metric}`;
        const g = map.get(key) ?? { item: f.item, metric, cells: 0, worst: 0, widths: new Set(), themes: new Set() };
        g.cells++; g.worst = typeof value === 'number' ? Math.max(g.worst || 0, value) : value;
        g.widths.add(f.width); g.themes.add(f.theme); map.set(key, g);
    }
    return [...map.values()].map(g => ({ ...g, widths: [...g.widths].sort((a, b) => a - b), themes: [...g.themes].sort() })).sort((a, b) => b.cells - a.cells || a.item.localeCompare(b.item) || a.metric.localeCompare(b.metric));
}

// Targets of a quality run ({ name, score, findings }) that scored under 100 or have findings, worst first.
export function belowScore(items) {
    return (items ?? []).filter(i => i.score < 100 || i.findings?.length).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
}

// Every finding as one row, de-duplicated across targets by (check, severity, selector) so a shared cause reads once with the list of targets.
export function dedupeFindings(items) {
    const map = new Map();
    for (const i of items ?? []) for (const f of i.findings ?? []) {
        const key = `${f.check}||${f.severity}||${f.selector}`;
        const g = map.get(key) ?? { check: f.check, severity: f.severity, selector: f.selector, message: f.message, count: 0, targets: [] };
        g.count += f.count ?? 1; if (!g.targets.includes(i.name)) g.targets.push(i.name); map.set(key, g);
    }
    const rank = { error: 0, warn: 1 };
    return [...map.values()].sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2) || b.targets.length - a.targets.length || a.check.localeCompare(b.check) || a.selector.localeCompare(b.selector));
}

// Page loads that miss a Core Web Vitals "good" limit, logged an error, threw or failed a request: { url, width, why: [...] }.
export function pageProblems(pages, limits = PAGE_LIMITS) {
    const out = [];
    for (const p of pages ?? []) {
        const why = [];
        if (p.lcp !== null && p.lcp !== undefined && p.lcp > limits.lcp) why.push(`LCP ${Math.round(p.lcp)} ms > ${limits.lcp}`);
        if (p.fcp !== null && p.fcp !== undefined && p.fcp > limits.fcp) why.push(`FCP ${Math.round(p.fcp)} ms > ${limits.fcp}`);
        if (p.cls > limits.cls) why.push(`CLS ${Math.round(p.cls * 1000) / 1000} > ${limits.cls}`);
        if (p.longTaskMax > limits.longTaskMs) why.push(`long task ${Math.round(p.longTaskMax)} ms > ${limits.longTaskMs}`);
        for (const e of p.console ?? []) if (e.level === 'error') why.push(`console error: ${e.text}`);
        for (const e of p.exceptions ?? []) why.push(`uncaught: ${e}`);
        for (const e of p.failedRequests ?? []) why.push(`request failed: ${e}`);
        if (why.length) out.push({ url: p.url, width: p.width, why });
    }
    return out;
}

// Failing cells per metric ({ readingSmall: 1557, ... }, worst first): a cell that fails two metrics counts in both.
export function countByMetric(failures) {
    const by = {};
    for (const f of failures ?? []) for (const { metric } of failingMetrics(f)) by[metric] = (by[metric] ?? 0) + 1;
    return Object.fromEntries(Object.entries(by).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));
}

// The sweeps of several tabs as one run: cells added, failures in item, theme, width order (a fixed order, whatever finished first).
export function mergeShards(shards, { widths, themes }) {
    const failures = shards.flatMap(x => x.failures).sort((p, q) => p.item.localeCompare(q.item) || themes.indexOf(p.theme) - themes.indexOf(q.theme) || widths.indexOf(p.width) - widths.indexOf(q.width));
    return { checked: shards.reduce((n, x) => n + x.checked, 0), failures, widths, themes };
}

// What the scorecard page reads (core/site/scorecard/sweep-report.json, from a full sweep with --write-report): the totals, the failing cells per metric and
// the `limit` worst item/metric groups. Small on purpose (a full run has thousands of failing cells; they are in <out>/sweep.json), and not tracked.
export function sweepReport(run, { limit = 40, at = new Date().toISOString() } = {}) {
    const groups = groupSweep(run.failures);
    return { partial: false, at, checked: run.checked, failing: new Set(run.failures.map(f => `${f.item}||${f.width}||${f.theme}`)).size, by: countByMetric(run.failures), widths: run.widths, themes: run.themes, groupCount: groups.length, groups: groups.slice(0, limit) };
}

const pad = (s, n) => String(s).padEnd(n);
// The readable summary, worst first, as text.
export function formatSummary({ sweep, quality, pages }) {
    const L = [];
    if (sweep) {
        const g = groupSweep(sweep.failures);
        L.push(`SWEEP: ${sweep.checked} cells checked (${sweep.widths.join(', ')} px, ${sweep.themes.join(' and ')}), ${sweep.failures.length} failing, ${g.length} item/metric groups`);
        L.push(`  failing cells by metric: ${Object.entries(countByMetric(sweep.failures)).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
        for (const x of g.slice(0, 40)) L.push(`  ${pad(x.metric, 15)} ${pad(x.cells + ' cells', 10)} worst ${pad(x.worst, 6)} ${x.item}  [${x.widths.join('/')}px ${x.themes.join('+')}]`);
        if (g.length > 40) L.push(`  ... ${g.length - 40} more groups in sweep.json`);
    }
    if (quality) {
        const bad = belowScore(quality.items);
        L.push(`QUALITY: overall ${quality.overall}; ${Object.entries(quality.categories ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}; ${quality.items.length} elements scored, ${bad.length} with findings`);
        for (const i of bad.slice(0, 30)) L.push(`  ${pad(i.score, 4)} ${pad(i.name, 28)} ${i.findings.slice(0, 5).map(f => `${f.check}${f.count > 1 ? ' x' + f.count : ''}`).join(', ')}`);
        const d = dedupeFindings(quality.items);
        L.push(`  ${d.length} distinct (check, selector) findings`);
        for (const f of d.slice(0, 30)) L.push(`  ${pad(f.severity, 6)} ${pad(f.check, 18)} ${f.selector}  (${f.targets.length} element${f.targets.length === 1 ? '' : 's'})`);
        const m = quality.measured ?? {};
        L.push(`  measured: ${['cssKb', 'jsKb', 'lcpMs', 'cls', 'longTasks', 'domNodes', 'recalcMs', 'rows100Ms', 'rows1000Ms', 'rows5000Ms', 'contrastFail', 'literalColours', 'a11yErrors', 'a11yWarnings'].map(k => `${k}=${m[k]}`).join(' ')}`);
    }
    if (pages) {
        const p = pageProblems(pages.pages);
        L.push(`PAGES: ${pages.pages.length} page loads (${pages.widths.join(', ')} px), ${p.length} with a problem; ${pages.qualityFindings.length} distinct quality findings on live pages`);
        for (const x of p.slice(0, 40)) L.push(`  ${x.url} @${x.width}: ${x.why.join('; ')}`);
        for (const f of pages.qualityFindings.slice(0, 30)) L.push(`  ${pad(f.severity, 6)} ${pad(f.check, 18)} ${f.selector}  (${f.pages} page load${f.pages === 1 ? '' : 's'})`);
    }
    return L.join('\n');
}

// What failed in a run, as messages (empty: exit 0). Quality findings of severity warn are listed but do not fail a run; errors do.
export function verdict({ sweep, quality, pages }) {
    const failing = [];
    if (sweep?.failures.length) failing.push(`sweep: ${sweep.failures.length} failing cells`);
    if (quality) { const e = dedupeFindings(quality.items).filter(f => f.severity === 'error'); if (e.length) failing.push(`quality: ${e.length} error findings`); }
    if (pages) { const p = pageProblems(pages.pages); if (p.length) failing.push(`pages: ${p.length} page loads with a problem`); }
    return failing;
}

// ---- DevTools protocol client ---------------------------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Cdp {
    constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = []; }
    open() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);
            this.ws.addEventListener('open', () => resolve(this));
            this.ws.addEventListener('error', () => reject(new Error('could not connect to the browser DevTools socket')));
            this.ws.addEventListener('close', () => { for (const p of this.pending.values()) p.reject(new Error('the browser closed the connection')); this.pending.clear(); });
            this.ws.addEventListener('message', ev => {
                const m = JSON.parse(ev.data);
                if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`)); else p.resolve(m.result); }
                else if (m.method) for (const l of this.listeners) l(m.method, m.params);
            });
        });
    }
    send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject, method }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    on(fn) { this.listeners.push(fn); }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(`in the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
        return r.result.value;
    }
    close() { try { this.ws?.close(); } catch { /* the browser is being killed anyway */ } }
}

// ---- what runs inside the page (each is one async expression; the SDK's own modules are imported from the served origin) ----

const IN_PAGE = {
    // One tab's share of the sweep (options and shard are JSON); progress is read from window.__pk while it runs.
    sweep: options => `(async () => { const m = await import(location.origin + '/site/scorecard/sweep.js'); window.__pk = { done: 0, total: 0 };
        const r = await m.sweep({ ...${JSON.stringify(options)}, progress: (d, n) => { window.__pk = { done: d, total: n }; } }); return { checked: r.checked, failures: r.failures }; })()`,
    // The scorecard page's own host module exports the mounted card; a second import of the same URL returns the instance the page's script tag made.
    quality: `(async () => { const { ready } = await import(location.origin + '/site/scorecard/scorecard.js'); const card = await ready; if (!card) throw new Error('the scorecard did not mount');
        await new Promise(r => setTimeout(r, 1500));
        const poll = setInterval(() => { const p = document.querySelector('[data-sc-progress]'); window.__pk = { text: p ? p.textContent : '' }; }, 500);
        await card.run(); clearInterval(poll); const rep = card.report(); if (!rep) throw new Error('the run produced no report');
        return { overall: rep.overall, categories: Object.fromEntries(Object.entries(rep.scores?.categories ?? {}).map(([k, c]) => [k, c.score])), scores: rep.scores ?? null, measured: rep.measured ?? null,
            items: rep.items.map(i => ({ id: i.id, name: i.name, kind: i.kind, score: i.score, findings: i.findings })) }; })()`,
    routes: `(async () => { const m = await import(location.origin + '/site/scorecard/sweep.js'); return m.routes(); })()`,
    // After a page has loaded: the SDK quality checks on the live page, and what the injected observers collected.
    pageProbe: phone => `(async () => { const q = await import(location.origin + '/js/quality.js'); const body = document.body;
        let findings = []; try { findings = [...q.evaluate(q.collect(body), { phone: ${phone} }), ...q.focusProblems(body)]; } catch (e) { findings = [{ check: 'probe-failed', severity: 'error', selector: 'document', message: String(e) }]; }
        const o = window.__pkPerf || {}; const nav = performance.getEntriesByType('navigation')[0];
        return { findings: findings.map(f => ({ check: f.check, severity: f.severity, selector: f.selector, message: f.message })), fcp: o.fcp ?? null, lcp: o.lcp ?? null, cls: o.cls ?? 0, longTasks: o.longTasks ?? [], domNodes: document.querySelectorAll('*').length,
            loadMs: nav ? Math.round(nav.loadEventEnd) : null, transferKb: Math.round(performance.getEntriesByType('resource').reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) / 102.4) / 10 }; })()`,
};

// Installed before every navigation so the observers see the first paint: FCP, LCP, layout shift and long tasks, as the performance monitor reads them.
const OBSERVERS = `(() => { const o = window.__pkPerf = { cls: 0, longTasks: [], fcp: null, lcp: null };
    const watch = (type, fn) => { try { new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) { o['no_' + type] = true; } };
    watch('paint', e => { if (e.name === 'first-contentful-paint') o.fcp = e.startTime; });
    watch('largest-contentful-paint', e => { o.lcp = e.startTime; });
    watch('layout-shift', e => { if (!e.hadRecentInput) o.cls += e.value; });
    watch('longtask', e => o.longTasks.push(Math.round(e.duration))); })()`;

// ---- the run --------------------------------------------------------------------------------------------------------------

function killTree(child) {
    if (!child || child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
async function removeDir(dir) {
    for (let i = 0; i < 20; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch { await sleep(500); } }
    return false;
}
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// Runs one in-page expression that takes minutes and prints its progress every 15 s.
async function longEval(cdp, expression, label, progressOf, deadline) {
    let finished = false; let value; let error;
    const p = cdp.eval(expression).then(v => { value = v; }, e => { error = e; }).finally(() => { finished = true; });
    let shown = '';
    while (!finished) {
        await Promise.race([p, sleep(15000)]);
        if (finished) break;
        if (Date.now() > deadline) throw new Error(`${label} did not finish before the timeout`);
        const text = progressOf(await cdp.eval('window.__pk').catch(() => null));
        if (text && text !== shown) { log(`${label}: ${text}`); shown = text; }
    }
    if (error) throw error;
    return value;
}

// The sweep, sharded over `options.tabs` browser tabs: each is its own render process, so the frames of one tab no longer queue behind one main thread.
// Every tab opens a page of the served origin (any document will do: the sweep only needs somewhere to put its frames) and runs every tabs-th item.
async function sweepStage(cdp, options, deadline) {
    const widths = options.widths ?? DEFAULT_WIDTHS; const themes = options.themes ?? DEFAULT_THEMES;
    const tabs = [cdp];
    for (let i = 1; i < options.tabs; i++) {
        const t = await fetch(`http://127.0.0.1:${options.port + 1000}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
        tabs.push(await new Cdp(t.webSocketDebuggerUrl).open());
    }
    try {
        for (const t of tabs) { await t.send('Page.enable'); await t.send('Page.navigate', { url: `http://localhost:${options.port}/site/scorecard/sweep.js` }); }
        await sleep(1000);
        for (const t of tabs) { await t.send('Page.bringToFront').catch(() => null); await t.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => null); }
        const share = { kinds: options.kinds ?? SWEEP_KINDS, filter: options.filter, widths, themes, size: options.frames, fresh: options.fresh };
        let finished = 0; let shown = '';
        const runs = tabs.map((t, index) => t.eval(IN_PAGE.sweep({ ...share, shard: { index, count: tabs.length } })).finally(() => { finished++; }));
        const all = Promise.all(runs);
        while (finished < tabs.length) {
            await Promise.race([all.catch(() => null), sleep(15000)]);
            if (finished === tabs.length) break;
            if (Date.now() > deadline) throw new Error('sweep did not finish before the timeout');
            const ps = await Promise.all(tabs.map(t => t.eval('window.__pk').catch(() => null)));
            const text = `${ps.reduce((n, p) => n + (p?.done ?? 0), 0)}/${ps.reduce((n, p) => n + (p?.total ?? 0), 0)} items (${tabs.length} tabs)`;
            if (text !== shown) { log(`sweep: ${text}`); shown = text; }
        }
        return mergeShards(await all, { widths, themes });
    } finally { for (const t of tabs.slice(1)) t.close(); }
}

async function pagesStage(cdp, port, widths, deadline) {
    const routes = await cdp.eval(IN_PAGE.routes);
    const pages = []; const merged = new Map();
    let current = null;
    const local = u => u.replace(`http://localhost:${port}`, '');
    cdp.on((method, p) => {
        if (!current) return;
        if (method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) current.console.push({ level: p.type === 'warning' ? 'warn' : 'error', text: p.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300) });
        else if (method === 'Runtime.exceptionThrown') current.exceptions.push((p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).split('\n')[0].slice(0, 300));
        else if (method === 'Network.requestWillBeSent') current.requests.set(p.requestId, local(p.request.url));
        else if (method === 'Network.loadingFailed' && !p.canceled) current.failedRequests.push(`${p.errorText} ${current.requests.get(p.requestId) ?? ''}`.trim());
        else if (method === 'Network.responseReceived' && p.response.status >= 400) current.failedRequests.push(`${p.response.status} ${local(p.response.url)}`);
    });
    await cdp.send('Network.enable'); await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Performance.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVERS });
    const urls = routes.map(r => ({ label: `gallery ${r}`, url: `http://localhost:${port}/site/gallery/index.html?theme=dark${r}` }));
    let n = 0;
    for (const width of widths) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width <= 640 ? 812 : 900, deviceScaleFactor: 1, mobile: false });
        for (const u of urls) {
            if (Date.now() > deadline) throw new Error('the pages stage did not finish before the timeout');
            current = { console: [], exceptions: [], failedRequests: [], requests: new Map() };
            await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(50);
            await cdp.send('Page.navigate', { url: u.url });
            await sleep(1800); // load, first paint and the elements' own first render
            const probe = await cdp.eval(IN_PAGE.pageProbe(width <= 640)).catch(e => ({ findings: [{ check: 'probe-failed', severity: 'error', selector: 'document', message: e.message }], longTasks: [], cls: 0 }));
            const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }))).metrics.map(x => [x.name, x.value]));
            const c = current; current = null;
            const ms = k => (metrics[k] !== undefined ? Math.round(metrics[k] * 1000) : null);
            pages.push({
                url: u.label, width, fcp: probe.fcp, lcp: probe.lcp, cls: probe.cls, longTasks: probe.longTasks, longTaskMax: Math.max(0, ...probe.longTasks), domNodes: probe.domNodes, loadMs: probe.loadMs, transferKb: probe.transferKb,
                layoutCount: metrics.LayoutCount ?? null, recalcStyleCount: metrics.RecalcStyleCount ?? null, layoutMs: ms('LayoutDuration'), recalcStyleMs: ms('RecalcStyleDuration'), scriptMs: ms('ScriptDuration'),
                console: c.console, exceptions: c.exceptions, failedRequests: [...new Set(c.failedRequests)], findings: probe.findings.length,
            });
            for (const f of probe.findings) {
                const k = `${f.check}||${f.severity}||${f.selector}`;
                const g = merged.get(k) ?? { check: f.check, severity: f.severity, selector: f.selector, message: f.message, pages: 0, where: [] };
                g.pages++; if (g.where.length < 5) g.where.push(`${u.label} @${width}`); merged.set(k, g);
            }
            if (++n % 25 === 0) log(`pages: ${n}/${urls.length * widths.length}`);
        }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const rank = { error: 0, warn: 1 };
    return { widths, pages, qualityFindings: [...merged.values()].sort((a, b) => (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2) || b.pages - a.pages) };
}

async function main() {
    let options;
    try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    if (typeof WebSocket === 'undefined') { console.error('This script needs Node 22 or newer (the WebSocket client is built in).'); return 2; }
    let chrome;
    try { chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) }); } catch (e) { console.error(e.message); return 2; }
    if (!chrome) { console.error('No Chrome, Chromium or Edge found. Install one, or set PK_CHROME to its path.'); return 2; }

    ensureGenerated();
    const t0 = Date.now(); const deadline = t0 + options.timeout * 1000;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-scorecard-'));
    const debugPort = options.port + 1000;
    let server = null, browser = null, cdp = null, code = 2;
    const result = {}; const timings = {};
    try {
        server = spawn(process.execPath, [path.join(root, 'core', 'tools', 'serve.mjs'), String(options.port)], { stdio: ['ignore', 'pipe', 'pipe'] });
        let serverError = '';
        server.stderr.on('data', d => { serverError += d; });
        await new Promise((resolve, reject) => {
            server.once('exit', c => reject(new Error(`the server exited with ${c}: ${serverError.trim() || 'port in use?'}`)));
            server.stdout.on('data', d => { if (String(d).includes('http://localhost')) resolve(); });
            setTimeout(() => reject(new Error('the server did not start within 10 s')), 10000);
        });
        server.removeAllListeners('exit');
        const start = `http://localhost:${options.port}/site/scorecard/index.html${options.concurrency ? '?concurrency=' + options.concurrency : ''}`;
        const extra = `--remote-debugging-port=${debugPort} --remote-allow-origins=* ${process.env.PK_CHROME_FLAGS ?? ''}`;
        browser = spawn(chrome, chromeArgs({ profile, url: 'about:blank', width: 1280, height: 900, extra }), { stdio: 'ignore', detached: process.platform !== 'win32' });
        let target = null;
        for (let i = 0; i < 40 && !target; i++) {
            await sleep(500);
            target = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).then(l => l.find(t => t.type === 'page'), () => null); // not listening yet: try again
        }
        if (!target) throw new Error('the browser did not open a DevTools page within 20 s');
        cdp = await new Cdp(target.webSocketDebuggerUrl).open();
        log(`server on http://localhost:${options.port}/; browser ${chrome}; stages ${options.only.join(', ')}`);

        const open = async () => { await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url: start }); await sleep(2500); };
        if (options.only.includes('sweep')) {
            const s = Date.now(); await open();
            result.sweep = await sweepStage(cdp, options, deadline);
            timings.sweep = Date.now() - s;
        }
        if (options.only.includes('quality')) {
            const s = Date.now(); await open();
            result.quality = await longEval(cdp, IN_PAGE.quality, 'quality', p => p?.text ?? '', deadline);
            timings.quality = Date.now() - s;
        }
        if (options.only.includes('pages')) {
            const s = Date.now(); await open();
            result.pages = await pagesStage(cdp, options.port, PAGE_WIDTHS, deadline);
            timings.pages = Date.now() - s;
        }

        fs.mkdirSync(options.out, { recursive: true });
        for (const k of STAGES) if (result[k]) fs.writeFileSync(path.join(options.out, `${k}.json`), JSON.stringify(result[k], null, 1) + '\n');
        const summary = formatSummary(result);
        fs.writeFileSync(path.join(options.out, 'summary.md'), summary + '\n');
        console.log('\n' + summary + '\n');
        console.log(`timings: ${Object.entries(timings).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)} s`).join(', ')}; total ${((Date.now() - t0) / 1000).toFixed(0)} s; files in ${options.out}`);
        if (options.writeReport && result.sweep) {
            fs.writeFileSync(sweepReportFile, JSON.stringify(sweepReport(result.sweep), null, 1) + '\n');
            console.log(`wrote ${path.relative(root, sweepReportFile)}`);
        }
        const failing = verdict(result);
        for (const f of failing) console.log(`FAIL ${f}`);
        code = failing.length ? 1 : 0;
    } catch (e) {
        console.error(e.message);
        code = 2;
    } finally {
        cdp?.close();
        killTree(browser);
        killTree(server);
        await sleep(500);
        if (!(await removeDir(profile))) console.error(`Could not delete the temporary profile ${profile}; delete it by hand.`);
    }
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
