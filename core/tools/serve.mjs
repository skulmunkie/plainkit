// A dependency-free static file server for the SDK folder: node core/tools/serve.mjs [port]  (default 5310).
// Any static server works; this exists so the gallery can be opened with one command and nothing installed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The site imports generated files (element modules, gallery data, dist/), which are not in git: generate them on a fresh clone. In the repository that is
// node scripts/bootstrap.mjs (every generator); a copy of core/ alone (no scripts/ next to it) runs its own build, so this file stays self-contained.
if (!['plainkit.css', 'dist/manifest.json', 'site/gallery/gallery.data.js', 'elements/registry.js'].every(f => fs.existsSync(path.join(root, f)))) {
    const bootstrap = path.resolve(root, '..', 'scripts', 'bootstrap.mjs');
    const script = fs.existsSync(bootstrap) ? bootstrap : path.join(root, 'tools', 'build.mjs');
    console.log(`generated files are missing: running node ${path.relative(process.cwd(), script) || script} ...`);
    const r = spawnSync(process.execPath, [script, ...(script === bootstrap ? ['--quiet'] : [])], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('generating the site failed'); process.exit(r.status ?? 1); }
}
const port = Number(process.argv.find(a => /^\d+$/.test(a))) || 5310;
// --csp (alias --csp=strict) serves script-src 'self' and style-src 'self': no inline scripts, no inline styles, no style elements. The scanner
// (tools/security.mjs) and tests/security.test.mjs enforce it in source, and the carve-out test serves the whole site under it.
const csp = process.argv.some(a => a === '--csp' || a === '--csp=strict') ? "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'self'" : null;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

// --base=/sdk/1.0.0/ serves the folder under a prefix, as a CDN or a subfolder would: the site uses only relative paths, so it works.
const baseArg = process.argv.find(a => a.startsWith('--base='));
const base = baseArg ? '/' + baseArg.slice(7).replace(/^\/+|\/+$/g, '') : '';
const writeReports = process.argv.includes('--write-reports');
// A development server: it listens on the loopback address only (--host=0.0.0.0 to reach it from a phone on the same network) and answers only requests whose Host
// header names this machine, so a web page on another site cannot reach it through the visitor's browser (DNS rebinding).
const hostArg = process.argv.find(a => a.startsWith('--host='));
const host = hostArg ? hostArg.slice(7) : '127.0.0.1';
const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// The file a URL path names, or null when it would leave the SDK folder: the path is resolved and must stay inside root (a sibling folder that merely starts with
// the same characters, such as core-old, is outside), and a backslash or NUL is refused before the file system sees it.
function fileFor(pathname) {
    if (/[\\\0]/.test(pathname)) return null;
    const file = path.resolve(root, '.' + pathname);
    const relative = path.relative(root, file);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? file : null;
}

http.createServer((req, res) => {
    if (!hostArg && !localHost.test(req.headers.host ?? '')) { res.writeHead(403).end('forbidden host'); return; }
    // Dev only: --write-reports lets the scorecard page store its sweep results next to the other reports.
    if (writeReports && req.method === 'POST' && req.url.startsWith('/__report')) {
        // Same origin only: a form or fetch from another site carries its own Origin and must not write into the repository.
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end('cross-origin'); return; }
        let body = '';
        req.on('data', c => { body += c; if (body.length > 5_000_000) req.destroy(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body); const q = new URL(req.url, 'http://x').searchParams; const dir = path.join(root, 'site', 'scorecard');
                if (q.get('kind') === 'browser') { fs.writeFileSync(path.join(root, 'tests', 'browser', 'report.json'), JSON.stringify(data, null, 1) + '\n'); res.writeHead(204).end(); return; }
                const parts = path.join(dir, '.sweep-parts'); fs.mkdirSync(parts, { recursive: true });
                if (q.get('part')) fs.writeFileSync(path.join(parts, q.get('part').replace(/[^\w-]/g, '_') + '.json'), body);
                if (q.get('final') === '1' || !q.get('part')) {
                    // A finished run: parts are merged into one report (the whole sweep, in stages).
                    const list = fs.existsSync(parts) ? fs.readdirSync(parts).map(f => JSON.parse(fs.readFileSync(path.join(parts, f), 'utf8'))) : [data];
                    const merged = { partial: false, checked: list.reduce((n, p) => n + p.checked, 0), failures: list.flatMap(p => p.failures), widths: data.widths ?? [320, 375, 640, 1024, 1280, 1920], themes: data.themes ?? ['dark', 'light'] };
                    fs.writeFileSync(path.join(dir, 'sweep-report.json'), JSON.stringify(merged, null, 1));
                    if (fs.existsSync(parts)) fs.rmSync(parts, { recursive: true });
                }
                res.writeHead(204).end();
            } catch { res.writeHead(400).end(); }
        });
        return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('bad request'); return; }
    if (base) {
        if (pathname !== base && !pathname.startsWith(base + '/')) { res.writeHead(404).end('not found'); return; }
        pathname = pathname.slice(base.length) || '/';
    }
    let file = fileFor(pathname);
    if (!file) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...(csp ? { 'content-security-policy': csp } : {}) }).end(data);
    });
}).listen(port, host, () => console.log(`SDK site on http://${host === '127.0.0.1' ? 'localhost' : host}:${port}/`));
