// Blazor Server behaviour in a real browser, against the Playground (blazor/samples/PlainKit.Playground, its /bench and /datalist pages):
//   table  - PkTable<T> with 100 / 1,000 / 5,000 rows: bytes the server sends over the SignalR WebSocket to draw it, time to the first row, the bytes of a
//            server re-render that changes nothing, and what "select all" does (it sends the ids back: the default SignalR MaximumReceiveMessageSize is 32 KB).
//   list   - PkDataList under fast typing: how many Load calls 12 keystrokes cause (the search box debounces in the element).
//   node scripts/bench/blazor.mjs [--only=table|list] [--runs 3] [--json file]
// It builds nothing: run `dotnet build blazor/samples/PlainKit.Playground -c Release` first (node scripts/bootstrap.mjs before that on a fresh clone).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { launchChrome, parseArgs, median, round, table, sleep, root } from './lib.mjs';

const projectDir = path.join(root, 'blazor', 'samples', 'PlainKit.Playground');
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

async function startPlayground(publishDir = null) {
    if (publishDir) return launch(path.join(publishDir, 'PlainKit.Playground.dll'), publishDir, 'Production');
    const bin = path.join(projectDir, 'bin', 'Release');
    const dll = fs.existsSync(bin) ? fs.readdirSync(bin).map(d => path.join(bin, d, 'PlainKit.Playground.dll')).find(f => fs.existsSync(f)) : null;
    if (!dll) throw new Error('Build the Playground first: dotnet build blazor/samples/PlainKit.Playground -c Release');
    return launch(dll, projectDir, 'Development');
}

async function launch(dll, cwd, environment) {
    const port = await freePort();
    const child = spawn('dotnet', [dll, '--urls', `http://127.0.0.1:${port}`], { cwd, env: { ...process.env, ASPNETCORE_ENVIRONMENT: environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    for (let i = 0; i < 100 && !/Now listening/.test(out); i++) await sleep(200);
    if (!/Now listening/.test(out)) { child.kill(); throw new Error(`the Playground did not start:\n${out.slice(-500)}`); }
    return { origin: `http://127.0.0.1:${port}`, output: () => out, stop: () => { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL'); } };
}

// Count the SignalR frames of a page: bytes received (server to browser) and sent (browser to server), per phase.
async function watch(page) {
    const t = { recv: 0, sent: 0, recvFrames: 0, sentFrames: 0, closed: false, largestSent: 0, errors: [] };
    page.on(m => {
        const size = p => p.response?.payloadData ? (p.response.opcode === 2 ? Math.floor(p.response.payloadData.length * 3 / 4) : Buffer.byteLength(p.response.payloadData)) : 0;
        if (m.method === 'Network.webSocketFrameReceived') { t.recv += size(m.params); t.recvFrames++; }
        if (m.method === 'Network.webSocketFrameSent') { const s = size(m.params); t.sent += s; t.sentFrames++; t.largestSent = Math.max(t.largestSent, s); }
        if (m.method === 'Network.webSocketClosed') t.closed = true;
    });
    return { t, reset: () => Object.assign(t, { recv: 0, sent: 0, recvFrames: 0, sentFrames: 0, largestSent: 0 }) };
}
const until = (page, expr, ms = 60000) => page.eval(`await new Promise((res, rej) => { const end = Date.now() + ${ms}; const t = setInterval(() => { try { if (${expr}) { clearInterval(t); res(true); } else if (Date.now() > end) { clearInterval(t); rej(new Error('timed out waiting for: ' + ${JSON.stringify(expr)})); } } catch (e) { clearInterval(t); rej(e); } }, 25); })`);

async function tableCase(pg, browser, { runs }) {
    const rows = [];
    for (const n of [100, 1000, 5000]) {
        const acc = { recv: [], first: [], rerenderBytes: [], rerenderMs: [] }; let sel;
        for (let i = -1; i < runs; i++) {
            const page = await browser.newPage(); const w = await watch(page);
            const t0 = Date.now();
            await page.goto(`${pg.origin}/bench?rows=${n}&select=1`, { wait: 'dom' });
            await until(page, `document.querySelector('pk-table')?.shadowRoot?.querySelectorAll('tbody tr').length > 0`);
            const first = Date.now() - t0; await sleep(400);
            const recv = w.t.recv;
            w.reset(); const r0 = Date.now();
            await page.eval(`document.getElementById('bench-rerender').click()`);
            await until(page, `document.querySelector('#bench-rerender').textContent.includes('Re-render 1')`);
            const rerenderMs = Date.now() - r0; await sleep(200);
            const rerender = w.t.recv;
            if (i >= 0) { acc.recv.push(recv); acc.first.push(first); acc.rerenderBytes.push(rerender); acc.rerenderMs.push(rerenderMs); }
            if (i === runs - 1) { // select all: the browser sends the ids back to the server
                w.reset();
                await page.eval(`document.querySelector('pk-table').shadowRoot.querySelector('[data-select-all]').click()`);
                await sleep(2500);
                const serverSaw = await page.eval(`document.getElementById('out-selected')?.textContent ?? 'page gone'`).catch(() => 'circuit lost');
                const modal = await page.eval(`(document.getElementById('components-reconnect-modal') || document.querySelector('.components-reconnect-show, .components-reconnect-failed, .components-reconnect-rejected, dialog[open]')) ? 'reconnect UI shown' : 'none'`).catch(() => 'n/a');
                sel = { sent: w.t.largestSent, serverSaw, modal, closed: w.t.closed };
            }
            await page.close();
        }
        rows.push({ rows: n, 'render bytes recv': `${round(median(acc.recv) / 1024)} KB`, 'B/row': Math.round(median(acc.recv) / n), 'first row ms': round(median(acc.first), 0), 're-render bytes (no change)': median(acc.rerenderBytes), 're-render ms': round(median(acc.rerenderMs), 0), 'select-all msg sent': `${round(sel.sent / 1024)} KB`, 'server saw': sel.serverSaw, 'circuit': sel.closed ? 'CLOSED' : 'alive', 'client UI': sel.modal });
    }
    return [{ caption: 'PkTable<T> over Blazor Server (WebSocket frame bytes; median of runs; select-all measured on the last run)', rows, cols: Object.keys(rows[0]) }];
}

async function listCase(pg, browser) {
    const page = await browser.newPage();
    await page.goto(`${pg.origin}/datalist`, { wait: 'dom' });
    await until(page, `document.querySelector('#out-loads')?.textContent >= 1 && document.querySelector('pk-table')?.shadowRoot?.querySelectorAll('tbody tr').length > 0`);
    await sleep(500);
    const before = Number(await page.eval(`document.querySelector('#out-loads').textContent`));
    const typed = 'gracealanedsg';
    // Real keystrokes 30 ms apart into the pk-input search box, then wait past the debounce.
    await page.eval(`document.querySelector('#people').shadowRoot.querySelector('pk-input[type=search]')?.focus() ?? document.querySelector('pk-input[type=search]').focus()`);
    for (const ch of typed) { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(30); }
    await sleep(1500);
    const after = Number(await page.eval(`document.querySelector('#out-loads').textContent`));
    const cancelled = await page.eval(`document.querySelector('#out-cancelled').textContent`);
    const last = await page.eval(`document.querySelector('#out-request').textContent`);
    await page.close();
    return [{ caption: 'PkDataList: fast typing (13 keystrokes, 30 ms apart, default 300 ms debounce)', rows: [{ keystrokes: typed.length, 'Load calls caused': after - before, cancelled, 'last request': last }], cols: ['keystrokes', 'Load calls caused', 'cancelled', 'last request'] }];
}

// Caching and compression of what the package serves: response headers, and how many requests a WARM visit still makes (revalidations).
async function assetCase(pg, browser, publish) {
    const rows = [];
    const html = await (await fetch(`${pg.origin}/bench?buttons=1`)).text();
    const css = /href="([^"]*plainkit[^"]*\.css[^"]*)"/.exec(html)?.[1];
    for (const url of [css, '_content/PlainKit.Blazor/plainkit.blazor.js', '_content/PlainKit.Blazor/plainkit/js/plainkit.js', '_content/PlainKit.Blazor/plainkit/elements/button.js', '_content/PlainKit.Blazor/plainkit/elements/api.json'].filter(Boolean)) {
        const r = await fetch(new URL(url, pg.origin + '/'), { headers: { 'accept-encoding': 'br, gzip' } });
        const body = await r.arrayBuffer();
        rows.push({ url: url.replace('_content/PlainKit.Blazor/', ''), status: r.status, 'cache-control': r.headers.get('cache-control') ?? '(none)', etag: r.headers.get('etag') ? 'yes' : 'no', 'content-encoding': r.headers.get('content-encoding') ?? 'none', 'bytes on the wire': body.byteLength, versioned: /[?&]v=/.test(url) ? '?v=' : 'no' });
    }
    // Cold then warm visit of a page with three buttons: the requests the browser makes, and how many were conditional (304) or served from cache.
    const page = await browser.newPage(); const visits = [];
    for (const visit of ['cold', 'warm']) {
        const reqs = new Map();
        const off = page.on(m => {
            if (m.method === 'Network.responseReceived') { const p = m.params; if (!/^ws:/.test(p.response.url)) reqs.set(p.requestId, { url: p.response.url, status: p.response.status, cache: p.response.fromDiskCache ? 'cache' : 'net' }); }
        });
        await page.send('Network.setCacheDisabled', { cacheDisabled: false });
        await page.goto(`${pg.origin}/bench?buttons=3`, { wait: 'load' });
        await page.eval(`await new Promise(r => { const t = setInterval(() => customElements.get('pk-button') && (clearInterval(t), r()), 50); })`);
        await sleep(1500); off();
        const all = [...reqs.values()].filter(r => r.url.includes('/_content/') || r.url.includes('/_framework/blazor'));
        visits.push({ visit, 'asset requests': all.length, '200 from network': all.filter(r => r.status === 200 && r.cache === 'net').length, '304 revalidated': all.filter(r => r.status === 304).length, 'from disk cache': all.filter(r => r.cache === 'cache').length });
    }
    await page.close();
    return [{ caption: `Static asset response headers (Playground, ${publish ? 'published, Production' : 'Development'} environment)`, rows, cols: Object.keys(rows[0]) }, { caption: 'Cold and warm visit of a page with 3 buttons: requests to /_content and the Blazor script', rows: visits, cols: Object.keys(visits[0]) }];
}

export async function run({ only = null, runs = 3, publish = null } = {}) {
    const pg = await startPlayground(publish); let browser;
    try {
        browser = await launchChrome();
        const tables = [];
        if (!only || only === 'table') tables.push(...await tableCase(pg, browser, { runs }));
        if (!only || only === 'list') tables.push(...await listCase(pg, browser));
        if (!only || only === 'assets') tables.push(...await assetCase(pg, browser, publish));
        return { title: 'Blazor Server', tables };
    } finally { await browser?.close(); pg.stop(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ only: o.only ?? null, runs: Number(o.runs ?? 3), publish: o.publish ?? null });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
