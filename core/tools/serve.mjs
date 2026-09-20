// A dependency-free static file server for the SDK folder: node core/tools/serve.mjs [port]  (default 5310).
// Any static server works; this exists so the gallery can be opened with one command and nothing installed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv.find(a => /^\d+$/.test(a))) || 5310;
// --csp (alias --csp=strict) serves script-src 'self' and style-src 'self': no inline scripts, no inline styles, no style elements. The scanner
// (tools/security.mjs) and tests/security.test.mjs enforce it in source, and the carve-out test serves the whole site under it.
const csp = process.argv.some(a => a === '--csp' || a === '--csp=strict') ? "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'self'" : null;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

// --base=/sdk/1.0.0/ serves the folder under a prefix, as a CDN or a subfolder would: the site uses only relative paths, so it works.
const baseArg = process.argv.find(a => a.startsWith('--base='));
const base = baseArg ? '/' + baseArg.slice(7).replace(/^\/+|\/+$/g, '') : '';
const writeReports = process.argv.includes('--write-reports');

http.createServer((req, res) => {
    // Dev only: --write-reports lets the scorecard page store its sweep results next to the other reports.
    if (writeReports && req.method === 'POST' && req.url.startsWith('/__report')) {
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
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (base) {
        if (pathname !== base && !pathname.startsWith(base + '/')) { res.writeHead(404).end('not found'); return; }
        pathname = pathname.slice(base.length) || '/';
    }
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', ...(csp ? { 'content-security-policy': csp } : {}) }).end(data);
    });
}).listen(port, () => console.log(`SDK site on http://localhost:${port}/`));
