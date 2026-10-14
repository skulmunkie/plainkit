// The Blazor browser harness (#1320): drives the server-hosted sample app (blazor/samples/PlainKit.AppSample) in a real headless Chrome or Edge and runs measuring cases
// against it (deep link, 403/401 refusal, 404, module switch without a reload, back/forward, focus on the h1, CLS, console errors), then screenshots into review-output/.
// Node only, no dependency: it publishes the sample into a temporary folder (so no running server ever locks bin/ or obj/), starts it on a free port, waits until it answers,
// drives the browser over the DevTools protocol (the plumbing is attest-browser.mjs's and ui-review.mjs's), and ALWAYS stops the host, the browser and deletes both temporary
// folders on the way out (success, failure, Ctrl+C).
//
//   node scripts/blazor-browser.mjs [--out review-output] [--no-shots] [--cases a,b] [--timeout 120] [--keep-publish]
//   verify: node scripts/verify.mjs --only blazor-browser   (opt-in; not part of the pull request gate; see AGENTS.md)
//
//   review-output/blazor-app__<shot>__<desktop|phone>__<light|dark>.png   and   review-output/blazor-app.json (the case results)
// Needs the .NET SDK and Chrome/Edge (PK_CHROME, as attest-browser.mjs). The sample is Server render mode: the lazy-assembly path of WASM is not reachable here (spec section 13, Q8),
// so the "lazy load" case checks the Server equivalent: a module switch is a client navigation (no document reload).
// Exit code: 0 all cases passed, 1 a case failed, 2 the run could not finish.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeArgs, findChrome, killTree, removeDir } from './attest-browser.mjs';
import { connect, evaluate, freePort } from './ui-review.mjs';
import { ensureGenerated } from './generated.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(root, 'blazor', 'samples', 'PlainKit.AppSample');
export const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 375, height: 812 }];
export const THEMES = ['light', 'dark'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseArgs(argv) {
    const o = { out: path.join(root, 'review-output'), shots: true, cases: [], timeout: 120, keepPublish: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], v = () => { const x = argv[++i]; if (x === undefined || x.startsWith('--')) throw new Error(`${a} needs a value`); return x; };
        if (a === '--out') o.out = path.resolve(v());
        else if (a === '--no-shots') o.shots = false;
        else if (a === '--cases') o.cases.push(...v().split(',').map(s => s.trim()).filter(Boolean));
        else if (a === '--timeout') { o.timeout = Number(v()); if (!Number.isInteger(o.timeout) || o.timeout <= 0) throw new Error('--timeout needs a positive whole number'); }
        else if (a === '--keep-publish') o.keepPublish = true;
        else throw new Error(`unknown argument ${a}`);
    }
    return o;
}

/** The file name of one screenshot, in the ui-review scenario convention. Pure. */
export const shotName = (shot, vp, theme) => `blazor-app__${shot}__${vp.name}__${theme}.png`;

/** Publishes the sample into `dir`. Node reuse and the shared compiler are off so no build server outlives the run holding files. */
export function publish(dir) {
    const r = spawnSync('dotnet', ['publish', SAMPLE, '-c', 'Release', '-o', dir, '--nologo', '-v', 'q', '-nodeReuse:false', '-p:UseSharedCompilation=false'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`dotnet publish failed (${r.status}): ${(r.stdout + r.stderr).split('\n').filter(l => /error/i.test(l)).slice(0, 8).join('\n') || r.error}`);
}

/** Starts the published host on a free port and resolves once `/` answers 200. Rejects if it exits first or is not up in `timeout` seconds. */
export async function startHost(dir, timeout) {
    const port = await freePort();
    const child = spawn('dotnet', [path.join(dir, 'PlainKit.AppSample.dll')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ASPNETCORE_URLS: `http://127.0.0.1:${port}`, ASPNETCORE_ENVIRONMENT: 'Production', DOTNET_NOLOGO: '1', DetailedErrors: 'true', Logging__LogLevel__Default: 'Warning' } });
    let log = '', exited = null;
    for (const s of [child.stdout, child.stderr]) s.on('data', d => { log += d; });
    child.once('exit', c => { exited = c; });
    const host = { port, child, base: `http://127.0.0.1:${port}`, log: () => log };
    for (const start = Date.now(); Date.now() - start < timeout * 1000; await sleep(250)) {
        if (exited !== null) throw Object.assign(new Error(`the host exited with ${exited}:\n${log.slice(-1500)}`), { host });
        try { if ((await fetch(host.base + '/')).status === 200) return host; } catch (e) { if (!/fetch failed/.test(e.message)) throw e; } // not listening yet
    }
    throw Object.assign(new Error(`the host did not answer within ${timeout} s:\n${log.slice(-1500)}`), { host });
}

/** Stops whatever is still running with `dir` on its command line (a browser child that outlived taskkill /T keeps the profile locked). */
export function killUsing(dir) {
    dir = path.basename(dir); // the folder's name: the command line may spell the parent path another way (short names, case)
    if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${dir}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: 'ignore' });
    else spawnSync('pkill', ['-9', '-f', dir], { stdio: 'ignore' });
}

/** A headless browser over DevTools with the listeners every case needs: console errors, page errors, layout shifts. */
export async function openBrowser(chrome, profile) {
    const browser = spawn(chrome, [...chromeArgs({ profile, url: 'about:blank', extra: process.env.PK_CHROME_FLAGS }).slice(0, -1), '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore', detached: process.platform !== 'win32' });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(150);
    if (!fs.existsSync(portFile)) { killTree(browser); throw new Error('the browser did not open a DevTools port within 15 s'); }
    const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const wsUrl = pages.find(p => p.type === 'page').webSocketDebuggerUrl;
    const cdp = await connect(wsUrl);
    // connect() hands out only send/close; the events the cases read come through a second socket that records them.
    const ws = new WebSocket(wsUrl), events = [];
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the DevTools event connection')); });
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method) events.push(m); };
    let id = 0; const raw = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
    for (const m of ['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable']) raw(m);
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { window.__clsError = String(e); }` });
    return { browser, cdp, events, close() { ws.close(); cdp.close(); killTree(browser); } };
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
    one(sel) { return this.all(sel)[0] ?? null; },
    text(root = document.body) { let t = root.textContent ?? ''; for (const el of root.querySelectorAll('*')) if (el.shadowRoot) t += ' ' + this.text(el.shadowRoot); return t.replace(/\\s+/g, ' '); },
    active() { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; },
};`;

/** The context a case gets: navigation, evaluation, waiting, the viewport and theme, screenshots. */
export function makeContext({ host, session, out, shots, results }) {
    const { cdp, events } = session;
    const ctx = {
        host, events, cdp, sleep,
        errorsSince: (mark, ignore) => errorsIn(events, mark, ignore),
        noErrors(mark, ignore) { const e = ctx.errorsSince(mark, ignore); if (e.length) throw new Error('browser errors:\n    ' + e.join('\n    ')); },
        eval: expr => evaluate(cdp, `(() => { ${DEEP}; return (${expr}); })()`),
        async waitFor(expr, what, seconds = 20) {
            for (const t = Date.now(); Date.now() - t < seconds * 1000; await sleep(50)) { try { if (await ctx.eval(expr)) return; } catch (e) { if (!/Execution context|Cannot find context|navigat/i.test(e.message)) throw e; } }
            throw new Error(`timed out after ${seconds} s waiting for ${what}`);
        },
        async viewport(vp, theme) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
            await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        },
        /** A document load of `route` (a fresh page, the server renders it), waiting until the frame is drawn and the circuit connected. */
        async open(route) {
            await cdp.send('Page.navigate', { url: 'about:blank' }); // drops the page before, so its late errors are not this page's
            await sleep(300);
            ctx.openMark = events.length;
            await cdp.send('Page.navigate', { url: host.base + route });
            await ctx.waitFor(`document.readyState === 'complete' && !!window.__deep.one('pk-app-frame') && !!window.Blazor`, `${route} to load`);
            await ctx.waitFor(`!!document.querySelector('#pk-main') && window.__deep.text(document.querySelector('#pk-main')).trim().length > 0`, `the page body of ${route}`);
            await sleep(400); // the circuit start and a first interactive render
        },
        /** Clicks the link (an a, or a pk-menu-item with an href) whose path is `href` (through shadow roots) and waits for the address to change. */
        async clickLink(href) {
            const before = await ctx.eval('location.href');
            const clicked = await ctx.eval(`(() => { const m = x => new URL(x.getAttribute('href'), location.href).pathname === ${JSON.stringify(href)}, a = window.__deep.all('a[href]').find(m) ?? window.__deep.all('[href]').find(m); if (!a) return false; a.click(); return true; })()`);
            if (!clicked) throw new Error(`no link to ${href} on the page`);
            await ctx.waitFor(`location.href !== ${JSON.stringify(before)}`, `the address to leave ${before}`);
            await ctx.waitFor(`!!window.Blazor && window.__deep.text(document.querySelector('#pk-main')).trim().length > 0`, 'the page after the click');
            await sleep(400);
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
    const { CASES, SHOT_PLAN } = await import('./blazor-browser-cases.mjs');
    const known = CASES.map(c => c.name), unknown = o.cases.filter(n => !known.includes(n));
    if (unknown.length) { console.error(`unknown case ${unknown.join(', ')}; known: ${known.join(', ')}`); return 2; }

    const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-blazor-pub-')), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-blazor-chrome-'));
    let host = null, session = null, code = 2;
    const stop = () => { session?.close(); killTree(host?.child); };
    process.once('SIGINT', () => { stop(); process.exit(2); });
    try {
        console.log('publishing the sample ...');
        publish(pub);
        host = await startHost(pub, o.timeout);
        console.log(`host on ${host.base}; browser ${chrome}`);
        session = await openBrowser(chrome, profile);
        const results = { cases: [], shots: [] };
        const ctx = makeContext({ host, session, out: o.out, shots: o.shots, results });
        await ctx.viewport(VIEWPORTS[0], 'light');
        for (const c of CASES.filter(c => !o.cases.length || o.cases.includes(c.name))) {
            try { await c.run(ctx); results.cases.push({ name: c.name, ok: true }); console.log(`  ok   ${c.name}`); }
            catch (e) { results.cases.push({ name: c.name, ok: false, error: e.message }); console.log(`  FAIL ${c.name}: ${e.message}`); }
        }
        if (o.shots) for (const vp of VIEWPORTS) for (const theme of THEMES) {
            await ctx.viewport(vp, theme);
            for (const s of SHOT_PLAN) { try { await s(ctx, vp, theme); } catch (e) { results.cases.push({ name: `shot ${vp.name} ${theme}`, ok: false, error: e.message }); console.log(`  FAIL screenshots ${vp.name}/${theme}: ${e.message}`); } }
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
        stop();
        await sleep(500);
        killUsing(profile);
        killUsing(pub);
        for (const d of o.keepPublish ? [profile] : [pub, profile]) if (!(await removeDir(d)) && (killUsing(d), !(await removeDir(d)))) console.error(`Could not delete ${d}; delete it by hand.`);
    }
    return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
