// Shared plumbing for the benchmarks in scripts/bench/: a static server for core/ that can compress and log every request, a headless Chrome driven
// over the DevTools protocol (Node's own WebSocket, no dependency), and small statistics helpers. Read scripts/bench/README.md first.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, chromeArgs } from '../attest-browser.mjs';
import { ensureGenerated } from '../generated.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const coreDir = path.join(root, 'core');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- statistics: the median of N runs is the reported number; min and max show the noise ----
export const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
export const summary = (xs, d = 1) => ({ median: round(median(xs), d), min: round(Math.min(...xs), d), max: round(Math.max(...xs), d), runs: xs.length });
export const parseArgs = argv => {
    const o = { _: [] };
    for (const a of argv) { const m = /^--([\w-]+)(?:=(.*))?$/.exec(a); if (m) o[m[1]] = m[2] ?? true; else o._.push(a); }
    return o;
};
export const table = (rows, cols) => {
    const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const line = r => '| ' + cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join(' | ') + ' |';
    return [line(Object.fromEntries(cols.map(c => [c, c]))), '| ' + w.map(n => '-'.repeat(n)).join(' | ') + ' |', ...rows.map(line)].join('\n');
};

// ---- server: core/ as the site root; extra pages (virtual, in memory); optional compression; every request logged ----
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export async function startServer({ compress = 'none', dir = coreDir } = {}) {
    const pages = new Map(), log = [], cache = new Map();
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        let body, type;
        if (pages.has(url.pathname)) { body = Buffer.from(pages.get(url.pathname)); type = types['.html']; }
        else if (url.pathname.startsWith('/__img/')) { // generated tiny images for the image-gallery case: /__img/<n>.svg
            const n = Number(/(\d+)/.exec(url.pathname)?.[1] ?? 0);
            body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#${((n * 2654435761) % 0xffffff).toString(16).padStart(6, '0')}"/></svg>`); type = types['.svg'];
        } else {
            let file = path.join(dir, decodeURIComponent(url.pathname));
            if (file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404).end(); log.push({ url: url.pathname, status: 404, raw: 0, sent: 0 }); return; }
            body = fs.readFileSync(file); type = types[path.extname(file)] ?? 'application/octet-stream';
        }
        const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
        let out = body;
        const accept = req.headers['accept-encoding'] ?? '';
        if (compress === 'br' && accept.includes('br') && body.length > 200) { const k = `br:${url.pathname}:${body.length}`; out = cache.get(k) ?? cache.set(k, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })).get(k); headers['Content-Encoding'] = 'br'; }
        else if (compress !== 'none' && accept.includes('gzip') && body.length > 200) { const k = `gz:${url.pathname}:${body.length}`; out = cache.get(k) ?? cache.set(k, zlib.gzipSync(body, { level: 6 })).get(k); headers['Content-Encoding'] = 'gzip'; }
        log.push({ url: url.pathname, status: 200, raw: body.length, sent: out.length });
        res.writeHead(200, { ...headers, 'Content-Length': out.length }).end(out);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return { port: server.address().port, origin: `http://127.0.0.1:${server.address().port}`, pages, log, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) };
}

// ---- Chrome over CDP ----
export async function launchChrome({ width = 1280, height = 900, flags = [] } = {}) {
    const chrome = findChrome({ env: process.env, platform: process.platform, pathDirs: (process.env.PATH ?? '').split(path.delimiter).filter(Boolean) });
    if (!chrome) throw new Error('No Chrome, Chromium or Edge found: set PK_CHROME to its path.');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-bench-'));
    const argv = [...chromeArgs({ profile, url: 'about:blank', width, height, extra: process.env.PK_CHROME_FLAGS }).slice(0, -1), '--remote-debugging-port=0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--js-flags=--expose-gc', ...flags, 'about:blank'];
    const child = spawn(chrome, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    const wsUrl = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Chrome did not open a DevTools port in 15 s')), 15000);
        const check = () => { const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr); if (m) { clearTimeout(t); resolve(m[1]); } else setTimeout(check, 100); };
        check(); child.once('exit', c => reject(new Error(`Chrome exited (${c}): ${stderr.slice(-300)}`)));
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('DevTools socket failed')); });
    let id = 0; const pending = new Map(); const handlers = new Set();
    ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(`${m.error.message}`)) : resolve(m.result); }
        else for (const h of handlers) h(m);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const browser = {
        chrome, send,
        async newPage() {
            const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
            const s = (method, params) => send(method, params, sessionId);
            const listeners = new Set();
            const h = m => { if (m.sessionId === sessionId) for (const l of listeners) l(m); };
            handlers.add(h);
            await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable'].map(m => s(m)));
            await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            const page = {
                send: s, on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
                // Evaluate an expression in the page (top-level await works); the value comes back by value; a thrown error rejects.
                async eval(expression, { timeout = 240000 } = {}) {
                    let timer; const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`page evaluation timed out after ${timeout / 1000} s`)), timeout); });
                    try { return await Promise.race([this.evalNow(expression), limit]); } finally { clearTimeout(timer); }
                },
                async evalNow(expression) {
                    const r = await s('Runtime.evaluate', { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true, userGesture: true });
                    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
                    return r.result.value;
                },
                async goto(url, { wait = 'load' } = {}) {
                    const done = new Promise(res => { const off = page.on(m => { if (m.method === (wait === 'dom' ? 'Page.domContentEventFired' : 'Page.loadEventFired')) { off(); res(); } }); });
                    await s('Page.navigate', { url }); await done;
                },
                async throttle({ cpu = 1, network = null } = {}) {
                    await s('Emulation.setCPUThrottlingRate', { rate: cpu });
                    await s('Network.emulateNetworkConditions', network ? { offline: false, latency: network.latency, downloadThroughput: network.down, uploadThroughput: network.up } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
                },
                // Collect garbage and read the JS heap (bytes) with the DOM counters (nodes, JS event listeners).
                async heap() {
                    await s('HeapProfiler.collectGarbage'); await s('HeapProfiler.collectGarbage');
                    const hu = await s('Runtime.getHeapUsage'); const c = await s('Memory.getDOMCounters');
                    return { heap: hu.usedSize, nodes: c.nodes, listeners: c.jsEventListeners, documents: c.documents };
                },
                async close() { handlers.delete(h); await send('Target.closeTarget', { targetId }).catch(() => {}); },
            };
            return page;
        },
        async close() {
            try { ws.close(); } catch { /* the browser is killed next */ }
            if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL');
            await sleep(900);
            for (let i = 0; i < 8; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(500); } }
        },
    };
    return browser;
}

// Run `fn(server, browser)` with a server and a Chrome, and always clean both up.
export async function withBench(fn, { compress = 'none', width = 1280, height = 900 } = {}) {
    ensureGenerated();
    const server = await startServer({ compress });
    let browser;
    try { browser = await launchChrome({ width, height }); return await fn(server, browser); }
    finally { await browser?.close(); await server.close(); }
}

export const gz = buf => zlib.gzipSync(buf, { level: 9 }).length;
export const br = buf => zlib.brotliCompressSync(buf).length;

// The page shell every bench uses: the built CSS, a module script and a place to put markup.
export const shell = ({ body = '', script = '', head = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>bench</title><link rel="stylesheet" href="/dist/plainkit.min.css">${head}</head><body><h1>bench</h1>${body}<script type="module">${script}</script></body></html>`;
