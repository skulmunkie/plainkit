// Size comparison (#979): builds the same page in every stack, loads each cold in headless Chrome and records the bytes of every file the page requests
// (gzip level 9 and brotli quality 11, computed from the built files; headers are not counted). Writes results.json and results.md.
//   npm install && node run.mjs [--only react,vue] [--no-build] [--shots]
// It reads core/dist (run `node scripts/bootstrap.mjs` in the repository first) and borrows the browser and server plumbing of scripts/bench/lib.mjs.
// Nothing here is shipped in the npm or NuGet package, and nothing here runs in CI or in scripts/verify.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const dist = path.join(repo, 'core', 'dist');
const out = path.join(here, 'out');
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const only = (args.find(a => a.startsWith('--only='))?.slice(7) ?? args[args.indexOf('--only') + 1] ?? '').split(',').filter(Boolean);
if (!args.includes('--only')) only.length = 0;

const gz = b => zlib.gzipSync(b, { level: 9 }).length;
const br = b => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }).length;
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const version = pkg => JSON.parse(fs.readFileSync(path.join(here, 'node_modules', ...pkg.split('/'), 'package.json'), 'utf8')).version;
const plainkitVersion = fs.readFileSync(path.join(repo, 'core', 'VERSION'), 'utf8').trim();

/** The page name -> how it is built, what it is, and the versions it uses. */
const vite = name => () => {
    const r = spawnSync(process.execPath, [path.join(here, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join('apps', name, 'vite.config.js')], { cwd: here, stdio: 'inherit' });
    if (r.status) throw new Error(`vite build failed for ${name}`);
};
// The Plainkit files a page needs from core/dist when it is served unbundled (only the files the page requests are counted).
const copyDist = to => {
    copy(path.join(dist, 'js'), path.join(to, 'plainkit', 'js'));
    copy(path.join(dist, 'elements'), path.join(to, 'plainkit', 'elements'));
    fs.copyFileSync(path.join(dist, 'plainkit.min.css'), path.join(to, 'plainkit', 'plainkit.min.css'));
};
const copyApp = (name, to) => {
    for (const f of fs.readdirSync(path.join(here, 'apps', name))) if (/\.(html|js)$/.test(f)) fs.copyFileSync(path.join(here, 'apps', name, f), path.join(to, f));
    fs.copyFileSync(path.join(here, 'shared', 'rows.js'), path.join(to, 'rows.js'));
};

export const APPS = [
    { id: 'plainkit-elements', label: 'Plainkit, per element', pkg: [], build() { const to = path.join(out, this.id); copyDist(to); copyApp('plainkit-elements', to); } },
    {
        id: 'plainkit-bundle', label: 'Plainkit, one page bundle', pkg: ['esbuild'],
        async build() {
            const to = path.join(out, this.id), pk = path.join(to, 'plainkit');
            const { bundlePage, tagsInHtml } = await import(pathToFileURL(path.join(repo, 'core', 'tools', 'bundle-page.mjs')).href);
            const html = fs.readFileSync(path.join(here, 'apps', 'plainkit-elements', 'index.html'), 'utf8');
            await bundlePage({ tags: tagsInHtml(html), dist, out: pk });
            // the page's own code, minified with the same esbuild, importing the bundle
            const esbuild = createRequire(path.join(repo, 'package.json'))('esbuild');
            const src = fs.readFileSync(path.join(here, 'apps', 'plainkit-elements', 'app.js'), 'utf8').replace('./plainkit/js/init.js', './plainkit/plainkit.bundle.js').replace('./rows.js', path.join(here, 'shared', 'rows.js').replaceAll('\\', '/'));
            const res = await esbuild.build({ stdin: { contents: src, resolveDir: path.join(here, 'apps', 'plainkit-elements'), loader: 'js' }, external: ['./plainkit/*'], bundle: true, minify: true, format: 'esm', write: false });
            write(path.join(to, 'app.js'), res.outputFiles[0].text);
            write(path.join(to, 'index.html'), html.replace(/<link rel="stylesheet"[^>]*>/, '<link rel="stylesheet" href="plainkit/plainkit.bundle.css">').replace(/\s*<link rel="modulepreload"[^>]*>/g, ''));
        },
    },
    { id: 'plainkit-app', label: 'Plainkit, mountApp', pkg: [], expect: ['Team directory', 'Ada Lovelace'], noPaging: true, build() { const to = path.join(out, this.id); copyDist(to); copyApp('plainkit-app', to); } },
    { id: 'lit', label: 'Lit', pkg: ['lit', 'vite'], build: vite('lit') },
    { id: 'svelte', label: 'Svelte', pkg: ['svelte', 'vite', '@sveltejs/vite-plugin-svelte'], build: vite('svelte') },
    { id: 'vue', label: 'Vue 3', pkg: ['vue', 'vite', '@vitejs/plugin-vue'], build: vite('vue') },
    { id: 'react', label: 'React', pkg: ['react', 'react-dom', 'vite', '@vitejs/plugin-react'], build: vite('react') },
    {
        id: 'angular', label: 'Angular', pkg: ['@angular/core', '@angular/build', '@angular/cli', 'typescript'],
        build() {
            const r = spawnSync(process.execPath, [path.join(here, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build'], { cwd: path.join(here, 'apps', 'angular'), stdio: 'inherit', env: { ...process.env, NG_CLI_ANALYTICS: 'false' } });
            if (r.status) throw new Error('ng build failed');
        },
    },
    { id: 'shoelace', label: 'Shoelace', pkg: ['@shoelace-style/shoelace', 'vite'], build: vite('shoelace') },
    {
        // Not the same page: the repository's own sample app (an app shell with a note page), the first load of a standalone Blazor WebAssembly app with PlainKit.Blazor. It is the runtime floor.
        id: 'blazor-wasm', label: 'Blazor WebAssembly (sample app)', pkg: [], start: '/', expect: ['Overview', 'About this page'], noPaging: true,
        build() {
            const tmp = path.join(out, '_blazor-wasm-publish');
            const r = spawnSync('dotnet', ['publish', path.join(repo, 'blazor', 'samples', 'PlainKit.AppSample.Wasm'), '-c', 'Release', '-o', tmp], { stdio: 'inherit' });
            if (r.status) throw new Error('dotnet publish failed');
            fs.rmSync(path.join(out, this.id), { recursive: true, force: true });
            copy(path.join(tmp, 'wwwroot'), path.join(out, this.id));
            fs.rmSync(tmp, { recursive: true, force: true });
        },
    },
    {
        id: 'blazor-server', label: 'Blazor Server (sample app)', pkg: [], host: 'PlainKit.AppSample.dll', start: '/', expect: ['Overview'], noPaging: true,
        build() {
            fs.rmSync(path.join(out, this.id), { recursive: true, force: true });
            const r = spawnSync('dotnet', ['publish', path.join(repo, 'blazor', 'samples', 'PlainKit.AppSample'), '-c', 'Release', '-o', path.join(out, this.id)], { stdio: 'inherit' });
            if (r.status) throw new Error('dotnet publish failed');
        },
    },
];

// ---- measuring ----
const DEEP = `(() => { const t = []; const walk = n => { if (n.nodeType === 3) t.push(n.data); for (const c of n.childNodes ?? []) walk(c); if (n.shadowRoot) walk(n.shadowRoot); }; walk(document.documentElement); return t.join(' ').replace(/\\s+/g, ' '); })()`;
const CLICK = label => `(() => { const hit = []; const walk = n => { if (n.nodeType === 1 && /^(button|pk-button|sl-button)$/i.test(n.localName) && n.textContent.trim() === ${JSON.stringify(label)}) hit.push(n); for (const c of n.children ?? []) walk(c); if (n.shadowRoot) walk(n.shadowRoot); }; walk(document.documentElement); if (!hit[0]) return false; hit[0].click(); return true; })()`;

const kindOf = (file, type) => /\.html?$/.test(file) ? 'html' : /\.m?js$/.test(file) ? 'js' : /\.css$/.test(file) ? 'css' : /\.(woff2?|ttf|otf)$/.test(file) ? 'font' : 'other';

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); });

// A logging reverse proxy in front of a running host (Blazor Server): it asks the host for identity encoding, records every body so the sizes can be compressed offline like the static ones,
// and counts the bytes of the WebSocket (the circuit) separately. Its log has the same shape as startServer's.
async function startProxy(target) {
    const log = [], ws = { up: 0, down: 0 };
    const server = http.createServer((req, res) => {
        const p = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: { ...req.headers, 'accept-encoding': 'identity' } }, r => {
            const chunks = [];
            r.on('data', c => chunks.push(c));
            r.on('end', () => { const body = Buffer.concat(chunks); log.push({ url: req.url.split('?')[0], status: r.statusCode, raw: body.length, body }); res.writeHead(r.statusCode, r.headers); res.end(body); });
        });
        req.pipe(p);
    });
    server.on('upgrade', (req, sock, head) => {
        const t = net.connect(target, '127.0.0.1', () => {
            const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
            t.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
            t.write(head);
            sock.pipe(t);
            t.pipe(sock);
        });
        sock.on('data', d => { ws.up += d.length; });
        t.on('data', d => { ws.down += d.length; });
        sock.on('error', () => t.destroy());
        t.on('error', () => sock.destroy());
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return { origin: `http://127.0.0.1:${server.address().port}`, log, ws, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) };
}

async function measure(browser, startServer, app, shots) {
    if (app.host) {
        const dir = path.join(out, app.id), port = await freePort();
        const child = spawn('dotnet', [path.join(dir, app.host)], { cwd: dir, stdio: 'ignore', env: { ...process.env, ASPNETCORE_URLS: `http://127.0.0.1:${port}`, ASPNETCORE_ENVIRONMENT: 'Production' } });
        const proxy = await startProxy(port);
        try {
            for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 300)); } }
            const m = await measureOn(browser, proxy, app, shots);
            m.circuitBytes = { sent: proxy.ws.up, received: proxy.ws.down };
            return m;
        } finally {
            await proxy.close();
            if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL');
        }
    }
    const server = await startServer({ compress: 'none', dir: path.join(out, app.id) }); // one origin per app: some (Blazor) assume they sit at the root
    try { return await measureOn(browser, server, app, shots); } finally { await server.close(); }
}

async function measureOn(browser, server, app, shots) {
    const page = await browser.newPage();
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    const errors = [];
    page.on(m => {
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    });
    server.log.length = 0;
    await page.goto(`${server.origin}${app.start ?? '/index.html'}`);
    const expect = app.expect ?? ['Team directory', 'Ada Lovelace', 'Page 1 of 5'];
    let text = '';
    for (let i = 0; i < 200; i++) { text = await page.eval(DEEP); if (expect.every(e => text.includes(e))) break; await new Promise(r => setTimeout(r, 100)); }
    const missing = expect.filter(e => !text.includes(e));
    if (missing.length) throw new Error(`${app.id}: the page did not show ${JSON.stringify(missing)} (shows: ${text.slice(0, 200)})`);
    await new Promise(r => setTimeout(r, 800)); // anything lazy still in flight
    const logged = server.log.map(e => ({ ...e })); // the cold load ends here; what the click below fetches is not counted
    let paged = null;
    if (!app.noPaging) {
        if (!await page.eval(CLICK('Next'))) throw new Error(`${app.id}: no Next button`);
        for (let i = 0; i < 50 && !paged; i++) { paged = (await page.eval(DEEP)).includes('Page 2 of 5'); await new Promise(r => setTimeout(r, 100)); }
        if (!paged) throw new Error(`${app.id}: Next did not move to page 2`);
    }
    if (shots) { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(out, 'shots'), { recursive: true }); fs.writeFileSync(path.join(out, 'shots', `${app.id}.png`), Buffer.from(data, 'base64')); }
    await page.close();
    const files = new Map();
    for (const e of logged) {
        if (e.status !== 200 || files.has(e.url)) continue;
        const file = path.join(out, app.id, decodeURIComponent(e.url === '/' ? '/index.html' : e.url));
        const buf = e.body ?? fs.readFileSync(file);
        files.set(e.url, { url: e.url.replace(/^\//, ''), kind: kindOf(file), raw: buf.length, gzip: gz(buf), brotli: br(buf) });
    }
    const list = [...files.values()];
    const sum = (k, f) => list.filter(x => !k || x.kind === k).reduce((s, x) => s + x[f], 0);
    const row = { requests: list.length, errors: errors.filter(e => !/favicon/.test(e)) };
    for (const f of ['raw', 'gzip', 'brotli']) { row[f] = {}; for (const k of ['html', 'js', 'css', 'font', 'other']) row[f][k] = sum(k, f); row[f].total = sum(null, f); }
    row.files = list;
    return row;
}

async function main() {
    if (!fs.existsSync(path.join(dist, 'plainkit.min.css'))) throw new Error('core/dist is missing. FIX: run `node scripts/bootstrap.mjs` in the repository root first.');
    if (!fs.existsSync(path.join(here, 'node_modules', 'vite'))) throw new Error('FIX: run `npm install` in bench/size-comparison first.');
    const apps = APPS.filter(a => !only.length || only.includes(a.id));
    if (!flag('no-build')) {
        fs.mkdirSync(out, { recursive: true });
        for (const a of apps) { fs.rmSync(path.join(out, a.id), { recursive: true, force: true }); console.log(`build ${a.id}`); await a.build(); }
    }
    const { startServer, launchChrome } = await import(pathToFileURL(path.join(repo, 'scripts', 'bench', 'lib.mjs')).href);
    const browser = await launchChrome({ width: 1280, height: 900 });
    const results = [];
    try {
        for (const a of apps) {
            console.log(`measure ${a.id}`);
            const m = await measure(browser, startServer, a, flag('shots'));
            results.push({ id: a.id, label: a.label, versions: Object.fromEntries(a.pkg.map(p => [p, p === 'esbuild' ? createRequire(path.join(repo, 'package.json'))('esbuild/package.json').version : version(p)])), ...m });
        }
    } finally { await browser.close(); }
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(path.join(here, 'results.json'), 'utf8')); } catch { /* the first run */ }
    const merged = [...(prev.results ?? []).filter(r => !results.some(n => n.id === r.id)), ...results];
    const order = APPS.map(a => a.id);
    merged.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    const meta = { plainkit: plainkitVersion, node: process.version, vite: version('vite'), dotnet: spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).stdout?.trim() || null, measuredWith: 'headless Chrome over DevTools, cache disabled, 1280x900, files served uncompressed from a local static server and compressed offline (gzip -9, brotli q11); response headers are not counted' };
    fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify({ meta, results: merged }, null, 2) + '\n');
    fs.writeFileSync(path.join(here, 'results.md'), markdown(meta, merged));
    console.log(markdown(meta, merged));
    const bad = merged.filter(r => r.errors?.length);
    if (bad.length) { console.error(`console errors in: ${bad.map(r => `${r.id}: ${r.errors[0]}`).join('; ')}`); return 1; }
    return 0;
}

const kb = n => (n / 1024).toFixed(1);
export function markdown(meta, results) {
    const lines = [
        `Plainkit ${meta.plainkit}, Node ${meta.node}, Vite ${meta.vite}, .NET SDK ${meta.dotnet}. Sizes in KB (1 KB = 1024 bytes), cold load, cache disabled. JS, CSS and other are brotli; the totals are given for gzip and brotli.`,
        '',
        '| Stack | Requests | HTML | JS | CSS | Other | Total gzip | Total brotli |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...results.map(r => `| ${r.label} | ${r.requests} | ${kb(r.brotli.html)} | ${kb(r.brotli.js)} | ${kb(r.brotli.css)} | ${kb(r.brotli.font + r.brotli.other)} | ${kb(r.gzip.total)} | ${kb(r.brotli.total)} |`),
        '',
    ];
    return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main());
