// The Blazor browser harness (#1320): drives the server-hosted sample app (blazor/samples/PlainKit.AppSample) in a real headless Chrome or Edge and runs measuring cases
// against it (deep link, 403/401 refusal, 404, module switch without a reload, back/forward, focus on the h1, CLS, console errors), then screenshots into review-output/.
// Node only, no dependency: it publishes the sample into a temporary folder (so no running server ever locks bin/ or obj/), starts it on a free port, waits until it answers,
// drives the browser over the DevTools protocol (the plumbing is attest-browser.mjs's and ui-review.mjs's), and ALWAYS stops the host, the browser and deletes both temporary
// folders on the way out (success, failure, Ctrl+C).
//
//   node scripts/blazor-browser.mjs [--out review-output] [--no-shots] [--cases a,b] [--timeout 120] [--publish-timeout 600] [--keep-publish] [--changed [--base <ref>]]
//   --changed: only the cases the files changed versus --base (default origin/main) can affect (scripts/blazor-browser-select.mjs); a shared or unknown file runs everything; no run stamp.
//   verify: node scripts/verify.mjs --only blazor-browser   (opt-in; not part of the pull request gate; see AGENTS.md)
//
//   review-output/blazor-app__<shot>__<desktop|phone>__<light|dark>.png   and   review-output/blazor-app.json (the case results)
// Needs the .NET SDK and Chrome/Edge (PK_CHROME, as attest-browser.mjs). The sample is Server render mode: it has no lazy assemblies (spec section 13, Q8), so its module-switch case checks
// the Server equivalent (a client navigation, no document reload). The lazy-assembly path is the standalone WebAssembly sample (blazor/samples/PlainKit.AppSample.Wasm, #1368): the run also
// publishes it (no wasm-tools workload needed), serves the published wwwroot as static files from a tiny node server, and runs WASM_CASES against it (--no-wasm skips it).
// Exit code: 0 all cases passed, 1 a case failed, 2 the run could not finish.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeArgs, findChrome, killTree, launchBrowser, removeDir } from './attest-browser.mjs';
import { connect, evaluate, freePort } from './ui-review.mjs';
import { ensureGenerated } from './generated.mjs';
import { changedSince, defaultBase } from './verify-changed.mjs';
import { writeRunStamp } from './verify-guard.mjs';
import { CASE_TIMEOUT_MS, createRunGuard, runWatchdogMs, stopChild, withTimeout } from './blazor-browser-guard.mjs';
import { cpuScale } from '../core/tests/browser/cpu-scale.js';
import { makeTempDir } from '../core/tools/tempdir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(root, 'blazor', 'samples', 'PlainKit.AppSample');
const SAMPLE_WASM = path.join(root, 'blazor', 'samples', 'PlainKit.AppSample.Wasm');
export const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }];
export const THEMES = ['light', 'dark'];
let guard = null; // the whole-run watchdog while main() runs: it knows the pids this run started (#1764)
const sleep = ms => new Promise(r => setTimeout(r, ms));

let scale = 1, measuredAt = -Infinity;
/** How much slower than an idle machine this one is right now (1 to 4, core/tests/browser/cpu-scale.js), measured at most every 5 s. */
export const loadScale = () => { if (Date.now() - measuredAt > 5000) { scale = cpuScale(); measuredAt = Date.now(); } return scale; };

export function parseArgs(argv) {
    const o = { out: path.join(root, 'review-output'), shots: true, cases: [], timeout: 120, publishTimeout: 600, keepPublish: false, wasm: true, changed: false, base: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], v = () => { const x = argv[++i]; if (x === undefined || x.startsWith('--')) throw new Error(`${a} needs a value`); return x; };
        if (a === '--out') o.out = path.resolve(v());
        else if (a === '--no-shots') o.shots = false;
        else if (a === '--cases') o.cases.push(...v().split(',').map(s => s.trim()).filter(Boolean));
        else if (a === '--timeout') { o.timeout = Number(v()); if (!Number.isInteger(o.timeout) || o.timeout <= 0) throw new Error('--timeout needs a positive whole number'); }
        else if (a === '--publish-timeout') { o.publishTimeout = Number(v()); if (!Number.isInteger(o.publishTimeout) || o.publishTimeout <= 0) throw new Error('--publish-timeout needs a positive whole number of seconds'); }
        else if (a === '--keep-publish') o.keepPublish = true;
        else if (a === '--no-wasm') o.wasm = false;
        else if (a === '--changed') o.changed = true;
        else if (a === '--base') o.base = v();
        else throw new Error(`unknown argument ${a}`);
    }
    if (o.changed && o.cases.length) throw new Error('use either --cases or --changed');
    return o;
}

/** The file name of one screenshot, in the ui-review scenario convention. Pure. */
export const shotName = (shot, vp, theme) => `blazor-app__${shot}__${vp.name}__${theme}.png`;

/** Publishes the sample (or `project`) into `dir`. Node reuse and the shared compiler are off so no build server outlives the run holding files.
 *  A publish running longer than `timeoutSec` (a stale build server holding a lock hung one run for 50 minutes, #1411) is killed and fails with a message saying so. */
export function publish(dir, project = SAMPLE, timeoutSec = 600) {
    const r = spawnSync('dotnet', ['publish', project, '-c', 'Release', '-o', dir, '--nologo', '-v', 'q', '-nodeReuse:false', '-p:UseSharedCompilation=false'], { encoding: 'utf8', timeout: timeoutSec * 1000, killSignal: 'SIGKILL' });
    if (r.error?.code === 'ETIMEDOUT') {
        killUsing(dir); // dotnet's own children (the compiler) outlive the killed parent
        throw new Error(`dotnet publish of ${path.basename(project)} did not finish within ${timeoutSec} s and was stopped. A stale dotnet build server or a locked bin/obj folder is the usual cause: run "dotnet build-server shutdown", end leftover dotnet processes, and run again (--publish-timeout <seconds> raises the limit).`);
    }
    if (r.status !== 0) throw new Error(`dotnet publish failed (${r.status}): ${(r.stdout + r.stderr).split('\n').filter(l => /error/i.test(l)).slice(0, 8).join('\n') || r.error}`);
}

/** Starts the published host on a free port and resolves once `/` answers 200. Rejects if it exits first or is not up in `timeout` seconds.
 *  `host.restart()` stops that process and starts the same published app again on the same port (#1714: the reconnect cases need the server to really go away and come back). */
export async function startHost(dir, timeout) {
    const host = { port: await freePort(), dir, child: null, log: () => '' };
    host.base = `http://127.0.0.1:${host.port}`;
    await launch(host, timeout);
    host.restart = async () => { await stopChild(host.child); guard?.forget(host.child?.pid); await sleep(800); await launch(host, timeout); };
    return host;
}

async function launch(host, timeout) {
    const child = spawn('dotnet', [path.join(host.dir, 'PlainKit.AppSample.dll')], { cwd: host.dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ASPNETCORE_URLS: host.base, ASPNETCORE_ENVIRONMENT: 'Production', DOTNET_NOLOGO: '1', DetailedErrors: 'true', Logging__LogLevel__Default: 'Warning' } });
    let log = '', exited = null;
    for (const s of [child.stdout, child.stderr]) s.on('data', d => { log += d; });
    child.once('exit', c => { exited = c; });
    guard?.record(child.pid);
    host.child = child; host.log = () => log;
    for (const start = Date.now(); Date.now() - start < timeout * 1000; await sleep(250)) {
        if (exited !== null) throw Object.assign(new Error(`the host exited with ${exited}:
${log.slice(-1500)}`), { host });
        try { if ((await fetch(host.base + '/')).status === 200) return; } catch (e) { if (!/fetch failed/.test(e.message)) throw e; } // not listening yet
    }
    throw Object.assign(new Error(`the host did not answer within ${timeout} s:
${log.slice(-1500)}`), { host });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

/** Serves the static files of a published WebAssembly app (`<dir>/wwwroot`) from this process on a free port, falling back to index.html for a path with no file (the client router's). `stop()` closes it. */
export async function startStaticHost(dir) {
    const web = path.join(dir, 'wwwroot'), port = await freePort();
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = path.join(web, rel);
        if (!file.startsWith(web)) { res.writeHead(403).end(); return; }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(web, 'index.html');
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    await new Promise((res, rej) => server.once('error', rej).listen(port, '127.0.0.1', res));
    return { port, base: `http://127.0.0.1:${port}`, stop: () => server.close() };
}

/** Stops whatever is still running with `dir` on its command line (a browser child that outlived taskkill /T keeps the profile locked). */
export function killUsing(dir) {
    dir = path.basename(dir); // the folder's name: the command line may spell the parent path another way (short names, case)
    if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${dir}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: 'ignore' });
    else spawnSync('pkill', ['-9', '-f', dir], { stdio: 'ignore' });
}

/** A headless browser over DevTools with the listeners every case needs: console errors, page errors, layout shifts. */
export async function openBrowser(chrome, profile) {
    const { browser, value: debugPort } = await launchBrowser({ chrome, profile, args: [...chromeArgs({ profile, url: 'about:blank', extra: process.env.PK_CHROME_FLAGS }).slice(0, -1), '--remote-debugging-port=0', 'about:blank'], probe: () => { const f = path.join(profile, 'DevToolsActivePort'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n')[0].trim() : null; } });
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const wsUrl = pages.find(p => p.type === 'page').webSocketDebuggerUrl;
    guard?.record(browser.pid);
    const cdp = await connect(wsUrl);
    // connect() hands out only send/close; the events the cases read come through a second socket that records them.
    const ws = new WebSocket(wsUrl), events = [];
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the DevTools event connection')); });
    const waiters = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method) events.push(m); else if (waiters.has(m.id)) { waiters.get(m.id)(); waiters.delete(m.id); } };
    let id = 0; const raw = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
    // A round trip on the event socket: its answer comes after every event the page emitted before it (one socket is in order), so what the page logged or requested up to now is in `events` when this resolves.
    // The case's own socket and this one are not ordered against each other, so a log line or a request could otherwise land after the check that should have seen it (#1423).
    const sync = () => new Promise((res, rej) => {
        const my = ++id;
        waiters.set(my, res);
        ws.send(JSON.stringify({ id: my, method: 'Runtime.evaluate', params: { expression: '0' } }));
        setTimeout(() => { if (waiters.delete(my)) rej(new Error('the browser did not answer a round trip on its event connection within 30 s')); }, 30000 * loadScale());
    });
    for (const m of ['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable']) raw(m);
    await cdp.send('Page.enable');
    if (process.env.PK_CPU_THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PK_CPU_THROTTLE) }); // a slow runner on purpose, to reproduce a shift that only shows when upgrades land late
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; (window.__clsLog ||= []).push({ t: Math.round(performance.now()), v: e.value, s: (e.sources || []).map(x => (x.node ? (x.node.nodeType === 3 ? (x.node.parentElement ? x.node.parentElement.localName : '') + ' text "' + x.node.data.trim().slice(0, 24) + '"' : x.node.localName + (x.node.id ? '#' + x.node.id : '')) + ' ' : '') + JSON.stringify(x.previousRect) + '>' + JSON.stringify(x.currentRect)) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { window.__clsError = String(e); }` });
    return { browser, cdp, events, sync, close() { ws.close(); cdp.close(); killTree(browser); } };
}

/** The console errors, uncaught exceptions and failed requests in `events` from index `from` on, as short strings. Pure. */
export function errorsIn(events, from = 0, ignore = []) {
    const out = [];
    for (const e of events.slice(from)) {
        const p = e.params;
        if (e.method === 'Runtime.consoleAPICalled' && p.type === 'error') out.push('console.error: ' + p.args.map(a => a.value ?? a.description ?? '').join(' '));
        else if (e.method === 'Runtime.exceptionThrown') out.push('exception: ' + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
        else if (e.method === 'Log.entryAdded' && p.entry.level === 'error') out.push(`log.error: ${p.entry.text} ${p.entry.url ?? ''}`.trim());
    }
    return out.filter(m => !ignore.some(re => re.test(m)));
}

/** The page-side helper: a query that goes through shadow roots, the deep text of a node, the deep focused element. Installed once per document. */
export const DEEP = `window.__deep = window.__deep || {
    all(sel, root = document) { const out = [...root.querySelectorAll(sel)]; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...this.all(sel, el.shadowRoot)); return out; },
    // The control of the field labelled by label (a pk-field with that label, or a checkbox with that text), in a pk-field-group or a pk-record-page.
    field(label) { const C = 'pk-input, pk-textarea, pk-select, pk-checkbox, pk-combobox'; return this.all('pk-field').find(f => f.getAttribute('label') === label)?.querySelector(C) ?? this.all('pk-checkbox').find(c => c.textContent.trim() === label) ?? null; },
    one(sel) { return this.q(sel)[0] ?? null; },
    // scope >>> sel: the matches of sel inside (the light and shadow tree of) the elements matching scope.
    q(sel) { const [scope, rest] = sel.split(' >>> '); return rest === undefined ? this.all(sel) : this.all(scope).flatMap(s => this.all(rest, s.shadowRoot ?? s)); },
    text(root = document.body) { let t = root.textContent ?? ''; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) t += ' ' + this.text(el.shadowRoot); return t.replace(/\\s+/g, ' '); },
    active() { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; },
};`;

/** A page-side expression: true when an element matching `sel` (through shadow roots) is laid out and its text includes `label`. */
const visible = (sel, label) => `window.__deep.q(${JSON.stringify(sel)}).some(x => x.getBoundingClientRect().width > 0 && (x.textContent ?? '').includes(${JSON.stringify(label)}))`;

/** The context a case gets: navigation, evaluation, waiting, the viewport and theme, screenshots. */
export function makeContext({ host, session, out, shots, results }) {
    const { cdp, events, sync } = session;
    const ctx = {
        host, events, cdp, sleep,
        errorsSince: (mark, ignore) => errorsIn(events, mark, ignore),
        /** Resolves once every event the page has emitted so far is in `events`. */
        flushEvents: sync,
        async noErrors(mark, ignore) { await sync(); const e = ctx.errorsSince(mark, ignore); if (e.length) throw new Error('browser errors:\n    ' + e.join('\n    ')); },
        eval: expr => evaluate(cdp, `(() => { ${DEEP}; return (${expr}); })()`),
        /** Polls `expr` until truthy. The ceiling (`seconds`: what an idle machine needs, with room to spare) is stretched by the machine's CPU load (loadScale), so a busy runner does not turn a slow load into a failure (#1401, #1423). */
        async waitFor(expr, what, seconds = 20) {
            for (const t = Date.now(), limit = seconds * loadScale() * 1000; Date.now() - t < limit; await sleep(50)) { try { if (await ctx.eval(expr)) return; } catch (e) { if (!/Execution context|Cannot find context|navigat/i.test(e.message)) throw e; } }
            throw new Error(`timed out after ${Math.round(seconds * loadScale())} s waiting for ${what}`);
        },
        async viewport(vp, theme) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.touch ? 2 : 1, mobile: !!vp.touch });
            await cdp.send('Emulation.setTouchEmulationEnabled', vp.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
            await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        },
        /** A document load of `route` (a fresh page, the server renders it), waiting until the frame is drawn and the circuit connected. */
        async open(route) {
            await cdp.send('Page.navigate', { url: 'about:blank' }); // drops the page before, so its late errors are not this page's
            await sleep(300);
            await sync(); // the page just left may log late (a beforeunload block, an echoed failure): that is its line, not this page's
            ctx.openMark = events.length;
            await cdp.send('Page.navigate', { url: host.base + route });
            await ctx.waitFor(`document.readyState === 'complete' && !!window.__deep.one('pk-app-frame') && !!window.Blazor`, `${route} to load`);
            await ctx.waitFor(`!!document.querySelector('#pk-main') && window.__deep.text(document.querySelector('#pk-main')).trim().length > 0`, `the page body of ${route}`);
            await ctx.waitInteractive();
            await sleep(400); // a first interactive render
        },
        /** Waits until Blazor has taken the page over: its event delegator has put the handler table (`_blazorEvents_<renderer>`) on a rendered element. Until then the prerendered copy answers no click
         *  or event (a lost click flaked two-way-bind and phone-touch-list-and-record, #1423) and no callback property is set (a case that needs one waits for it too). */
        waitInteractive: () => ctx.waitFor(`window.__deep.all('*').some(e => Object.keys(e).some(k => k.startsWith('_blazorEvents_')))`, 'Blazor to take the prerendered page over (its event handlers registered)'),
        /** Clicks the link (an a, or a pk-menu-item with an href) whose path is `href` (through shadow roots) and waits for the address to change. */
        async clickLink(href) {
            const before = await ctx.eval('location.href');
            const clicked = await ctx.eval(`(() => { const m = x => new URL(x.getAttribute('href'), location.href).pathname === ${JSON.stringify(href)}, a = window.__deep.all('a[href]').find(m) ?? window.__deep.all('[href]').find(m); if (!a) return false; a.click(); return true; })()`);
            if (!clicked) throw new Error(`no link to ${href} on the page`);
            await ctx.waitFor(`location.href !== ${JSON.stringify(before)}`, `the address to leave ${before}`);
            await ctx.waitFor(`!!window.Blazor && !!document.querySelector('#pk-main') && window.__deep.text(document.querySelector('#pk-main')).trim().length > 0`, 'the page after the click');
            await sleep(400);
        },
        /** Clicks the first visible element matching `sel` (through shadow roots) whose text includes `label`. */
        async clickDeep(sel, label = '') {
            await ctx.waitFor(visible(sel, label), `something visible to click: ${sel} ${label}`.trim()); // what a callback or a load has yet to reveal (a hidden Edit button) is waited for, not missed
            const hit = await ctx.eval(`(() => { const e = window.__deep.q(${JSON.stringify(sel)}).find(x => x.getBoundingClientRect().width > 0 && (x.textContent ?? '').includes(${JSON.stringify(label)})); if (!e) return false; e.click(); return true; })()`);
            if (!hit) throw new Error(`nothing visible to click: ${sel} ${label}`);
        },
        /** A real touch tap (touchstart and touchend through the DevTools input domain) on the first visible element matching `sel` whose text includes `label`. */
        async tap(sel, label = '') {
            await ctx.waitFor(visible(sel, label), `something visible to tap: ${sel} ${label}`.trim());
            const r = await ctx.eval(`(() => { const e = window.__deep.q(${JSON.stringify(sel)}).find(x => x.getBoundingClientRect().width > 0 && (x.textContent ?? '').includes(${JSON.stringify(label)})); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; })()`);
            if (!r) throw new Error(`nothing visible to tap: ${sel} ${label}`);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            return r;
        },
        /** Types `value` into the control matching `sel` and raises the events a keystroke does. */
        async typeInto(sel, value) {
            const hit = await ctx.eval(`(() => { const c = window.__deep.one(${JSON.stringify(sel)}); if (!c) return false; c.value = ${JSON.stringify(value)}; if (c.fire) c.fire(); else c.dispatchEvent(new Event('input', { bubbles: true, composed: true })); return true; })()`);
            if (!hit) throw new Error(`no control matches ${sel}`);
        },
        /** Picks `files` (absolute paths) on the file input matching `sel`, as the OS picker would: DevTools sets them and raises input and change on the native input. */
        async setFiles(sel, files) {
            const r = await cdp.send('Runtime.evaluate', { expression: `(() => { ${DEEP}; return window.__deep.one(${JSON.stringify(sel)}); })()` });
            if (!r.result.objectId) throw new Error(`no file input matches ${sel}`);
            await cdp.send('DOM.setFileInputFiles', { files, objectId: r.result.objectId });
        },
        /** Commits `value` into the control of the field labelled `label`, as a person's edit does (a checkbox is clicked, the others get the value and their commit event). */
        async setField(label, value) {
            const hit = await ctx.eval(`(() => { const c = window.__deep.field(${JSON.stringify(label)}); if (!c) return false;
                const inner = c.shadowRoot?.querySelector('input, select'); // the native control inside: what a person really operates
                if (c.tagName === 'PK-CHECKBOX') (inner ?? c).click(); else if (c.tagName === 'PK-SELECT' && inner) { inner.value = ${JSON.stringify(value)}; inner.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } else { c.value = ${JSON.stringify(value)}; if (c.fire) c.fire(); else c.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } return true; })()`);
            if (!hit) throw new Error(`no field labelled ${label}`);
        },
        async shot(name, vp, theme) {
            if (!shots) return;
            // The SDK's default is dark whatever the system prefers; light is the same token set under data-theme="light", which is what the theme toggle sets.
            await ctx.eval(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)})`);
            await sleep(200);
            fs.mkdirSync(out, { recursive: true });
            const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            fs.writeFileSync(path.join(out, shotName(name, vp, theme)), Buffer.from(r.data, 'base64'));
            results.shots.push(shotName(name, vp, theme));
        },
        ok(cond, message) { if (!cond) throw new Error(message); },
    };
    return ctx;
}

async function main() {
    let o;
    try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
    let chrome;
    try { chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) }); } catch (e) { console.error(e.message); return 2; }
    if (!chrome) { console.error('No Chrome, Chromium or Edge found. Install one, or set PK_CHROME to its path.'); return 2; }
    ensureGenerated();
    const { CASES, WASM_CASES, SHOT_PLAN } = await import('./blazor-browser-cases.mjs');
    const known = [...CASES, ...WASM_CASES].map(c => c.name), unknown = o.cases.filter(n => !known.includes(n));
    if (unknown.length) { console.error(`unknown case ${unknown.join(', ')}; known: ${known.join(', ')}`); return 2; }
    const picked = list => list.filter(c => !o.cases.length || o.cases.includes(c.name));
    let serverCases = picked(CASES), wasmCases = o.wasm ? picked(WASM_CASES) : [], shotPlan = SHOT_PLAN, sel = null;
    if (o.changed) {
        const { selectCases, describeSelection } = await import('./blazor-browser-select.mjs');
        const base = defaultBase(o.base, root);
        if (!base) { console.error('No base to compare with (no origin/main). Pass --base <ref>.'); return 2; }
        const mb = spawnSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
        const readBase = f => { if (!mb) return null; const r = spawnSync('git', ['show', `${mb}:${f}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }); return r.status === 0 ? r.stdout : null; };
        sel = selectCases(changedSince(base, root), { root, cases: CASES, wasmCases: WASM_CASES, shots: SHOT_PLAN, readBase });
        console.log(describeSelection(sel, { cases: CASES.length + WASM_CASES.length, shots: SHOT_PLAN.length }));
        if (!sel.full) {
            serverCases = serverCases.filter(c => sel.cases.has(c.name)); wasmCases = wasmCases.filter(c => sel.cases.has(c.name)); shotPlan = SHOT_PLAN.filter((_, i) => sel.shots.has(i));
            if (!serverCases.length && !wasmCases.length && !(o.shots && shotPlan.length)) { console.log('blazor browser --changed: nothing the changed files can affect; nothing to run'); return 0; }
        }
    }

    const pub = makeTempDir('pk-blazor-pub-'), wasmPub = makeTempDir('pk-blazor-wasm-'), profile = makeTempDir('pk-blazor-chrome-');
    let host = null, wasmHost = null, session = null, code = 2;
    guard = createRunGuard({ ms: runWatchdogMs(process.env) });
    const stop = async () => {
        guard.phase('closing the browser'); try { session?.close(); } catch (e) { console.error(`closing the browser: ${e.message}`); }
        guard.phase('stopping the host'); await stopChild(host?.child); wasmHost?.stop();
    };
    process.once('SIGINT', () => { stop().finally(() => process.exit(2)); });
    try {
        const results = { cases: [], shots: [] };
        const runAll = async (ctx, cases) => {
            for (const c of cases) {
                guard.phase('running a case'); guard.caseName(c.name);
                try { await withTimeout(c.run(ctx), CASE_TIMEOUT_MS * loadScale(), `case ${c.name}`); results.cases.push({ name: c.name, ok: true }); console.log(`  ok   ${c.name}`); }
                catch (e) { results.cases.push({ name: c.name, ok: false, error: e.message }); console.log(`  FAIL ${c.name}: ${e.message}`); }
            }
        };
        if (serverCases.length || (o.shots && shotPlan.length)) { console.log('publishing the sample ...'); publish(pub, SAMPLE, o.publishTimeout); host = await startHost(pub, o.timeout); }
        if (wasmCases.length) { console.log('publishing the WebAssembly sample ...'); publish(wasmPub, SAMPLE_WASM, o.publishTimeout); wasmHost = await startStaticHost(wasmPub); }
        console.log(`host on ${host?.base}${wasmHost ? `, WebAssembly host on ${wasmHost.base}` : ''}; browser ${chrome}`);
        session = await openBrowser(chrome, profile);
        const ctx = makeContext({ host, session, out: o.out, shots: o.shots, results });
        await ctx.viewport(VIEWPORTS[0], 'light');
        await runAll(ctx, serverCases);
        await runAll(makeContext({ host: wasmHost, session, out: o.out, shots: o.shots, results }), wasmCases);
        if (o.shots && shotPlan.length) for (const vp of VIEWPORTS) for (const theme of THEMES) {
            await ctx.viewport(vp, theme);
            for (const s of shotPlan) { try { await s(ctx, vp, theme); } catch (e) { results.cases.push({ name: `shot ${vp.name} ${theme}`, ok: false, error: e.message }); console.log(`  FAIL screenshots ${vp.name}/${theme}: ${e.message}`); } }
        }
        fs.mkdirSync(o.out, { recursive: true });
        fs.writeFileSync(path.join(o.out, 'blazor-app.json'), JSON.stringify(results, null, 2));
        const failed = results.cases.filter(c => !c.ok);
        console.log(`blazor browser: ${results.cases.length - failed.length} passed, ${failed.length} failed, ${results.shots.length} screenshots in ${o.out}`);
        code = failed.length ? 1 : 0;
    } catch (e) {
        console.error(e.message);
        if (e.host) host = e.host;
        code = 2;
    } finally {
        await stop();
        if (code < 2 && !o.cases.length && !(sel && !sel.full)) writeRunStamp(root, 'blazor-browser', code === 0); // which tree this run belongs to (scripts/gate-check.mjs, #1754)
        await sleep(500);
        guard.phase('cleaning temp folders');
        killUsing(profile);
        killUsing(pub);
        killUsing(wasmPub);
        await sleep(1000); killUsing(profile); // a browser child can still be spawning or exiting after the first pass (#1764: an orphaned renderer kept the profile locked)
        for (const d of o.keepPublish ? [profile] : [pub, wasmPub, profile]) if (!(await withTimeout(removeDir(d), 60000, `deleting ${d}`).catch(() => false)) && (killUsing(d), !(await withTimeout(removeDir(d), 60000, `deleting ${d}`).catch(() => false)))) console.error(`Could not delete ${d}; delete it by hand.`);
    }
    guard.disarm();
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
