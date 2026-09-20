// Carve-out test: the SDK must work when this folder is copied anywhere. It copies the whole sdk/ folder to a temp directory OUTSIDE the
// repository, then in the copy: rebuilds dist/ byte-for-byte, runs the tests, the security scanner and the static audit, and serves the
// site (plain, with --csp, and under a /sdk/1.0.0/ prefix) fetching every page, template and component fragment plus their local
// sub-resources. It also checks nothing references the repository layout. Run: node --test tests/carveout.test.mjs
// (The copy runs the other tests with CARVEOUT_CHILD=1 so this file does not recurse.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = process.env.CARVEOUT_CHILD === '1';
const skip = child ? 'runs once, from the repository copy' : false;

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
let copy;

test('copy the Plainkit folder outside the repository', { skip }, () => {
    copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-carve-'));
    assert.ok(!path.resolve(copy).startsWith(path.resolve(source, '..')), 'the copy must be outside the repo');
    fs.cpSync(source, copy, { recursive: true });
    assert.ok(fs.existsSync(path.join(copy, 'tools', 'build.mjs')));
});

test('the copy rebuilds dist/, plainkit.css and the gallery data byte-for-byte', { skip }, () => {
    const r = spawnSync(process.execPath, ['tools/build.mjs'], { cwd: copy, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const files = [...walk(path.join(source, 'dist')).map(f => rel(source, f)), 'plainkit.css', 'site/gallery/gallery.data.js'];
    const different = files.filter(f => !fs.readFileSync(path.join(source, f)).equals(fs.readFileSync(path.join(copy, f))));
    assert.deepEqual(different, [], 'a rebuild in the copy differs from the committed output: run node tools/build.mjs');
    const extra = walk(path.join(copy, 'dist')).map(f => rel(copy, f)).filter(f => !fs.existsSync(path.join(source, f)));
    assert.deepEqual(extra, []);
});

test('the copy passes its own tests, security scanner and static audit', { skip }, () => {
    const env = { ...process.env, CARVEOUT_CHILD: '1' };
    const t = spawnSync(process.execPath, ['--test'], { cwd: copy, encoding: 'utf8', env });
    assert.equal(t.status, 0, (t.stdout + t.stderr).split('\n').filter(l => /✖|fail|Error/.test(l)).slice(0, 12).join('\n'));
    assert.equal(spawnSync(process.execPath, ['tools/security.mjs'], { cwd: copy, encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync(process.execPath, ['site/scorecard/static-audit.mjs'], { cwd: copy, encoding: 'utf8' }).status, 0);
});

test('nothing in the copy depends on the repository layout, the host app or an absolute path', { skip }, () => {
    const banned = [/wwwroot/, /_content\//, /Backend\.(UI|Web|Core|Data)\b/, /dotnet[\\/]src/, /[A-Za-z]:[\\/]Users[\\/]/, /\/Users\/[a-z]+\//, /(href|src)=["']\/(?!\/)/];
    const ignore = new Set(['site/files/snapshot.json', 'tests/carveout.test.mjs', 'site/scorecard/sweep-report.json', 'site/scorecard/report.json', 'site/scorecard/security-report.json']);
    const hits = [];
    for (const f of walk(copy)) {
        const r = rel(copy, f);
        if (ignore.has(r) || r.startsWith('dist/') || !/\.(html|css|js|mjs|json|md|svg)$/.test(r)) continue;
        // The generated PARAMS block quotes Blazor component doc text; it is data, not a dependency.
        const text = fs.readFileSync(f, 'utf8').replace(/\/\/ <generated:params>[\s\S]*?\/\/ <\/generated:params>/, '');
        for (const rx of banned) if (rx.test(text.split('\n').filter(l => !/Blazor|blazor|Razor/.test(l)).join('\n'))) hits.push(`${r}: ${rx}`);
    }
    assert.deepEqual(hits, [], 'files that know about the repository or an absolute path');
});

const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

async function serve(args) {
    const port = await freePort();
    const proc = spawn(process.execPath, ['tools/serve.mjs', String(port), ...args], { cwd: copy, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${port}/`); return { port, proc }; } catch { await new Promise(r => setTimeout(r, 100)); } }
    proc.kill(); throw new Error('server did not start');
}

// Every local sub-resource a page or module pulls in: href/src attributes, static imports, css @imports.
function references(text, kind) {
    const out = [];
    if (kind === 'html') for (const m of text.matchAll(/\s(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) out.push(m[1]);
    if (kind === 'js') for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1] ?? m[2]);
    if (kind === 'css') for (const m of text.matchAll(/@import\s+url\("([^"]+)"\)/g)) out.push(m[1]);
    return out.filter(r => !/^(https?:|data:|mailto:|#|javascript:)/.test(r) && !r.includes('${'));
}

async function crawl(base, start) {
    const seen = new Set(); const failures = []; const queue = [start];
    while (queue.length) {
        const url = queue.pop(); if (seen.has(url)) continue; seen.add(url);
        const res = await fetch(url);
        if (res.status !== 200) { failures.push(`${res.status} ${url}`); continue; }
        const kind = /\.html$|\/$/.test(url.split('?')[0]) ? 'html' : /\.css$/.test(url) ? 'css' : /\.m?js$/.test(url) ? 'js' : null;
        if (!kind) continue;
        // Component html files are fragments (not pages): their icon paths are written for the frame they render in, so only the fragment itself is checked.
        if (url.includes('/components/')) continue;
        for (const r of references(await res.text(), kind)) queue.push(new URL(r, url).href);
    }
    return { count: seen.size, failures };
}

for (const [name, args, prefix] of [['plain', [], ''], ['under a CSP header', ['--csp'], ''], ['under a /sdk/1.0.0/ prefix', ['--base=/sdk/1.0.0/'], '/sdk/1.0.0']]) {
    test(`the copy serves every page, template and fragment (${name}) with no failed sub-request`, { skip }, async () => {
        const { port, proc } = await serve(args);
        try {
            const origin = `http://localhost:${port}${prefix}`;
            const pages = walk(copy).map(f => rel(copy, f)).filter(r => /\.html$/.test(r) && !r.startsWith('dist/'));
            assert.ok(pages.length > 40);
            let total = 0; const failures = [];
            for (const p of pages) { const c = await crawl(origin, `${origin}/${p}`); total += c.count; failures.push(...c.failures); }
            assert.deepEqual([...new Set(failures)], []);
            assert.ok(total > 300, `crawled ${total} resources`);
            if (args.includes('--csp')) { const header = (await fetch(`${origin}/index.html`)).headers.get('content-security-policy') ?? ''; assert.match(header, /script-src 'self'/); assert.match(header, /style-src 'self'(?!\s+'unsafe-inline')/); assert.doesNotMatch(header, /unsafe-inline/); }
            if (prefix) assert.equal((await fetch(`http://localhost:${port}/site/gallery/index.html`)).status, 404, 'outside the prefix nothing is served');
        } finally { const gone = new Promise(r => proc.once('exit', r)); proc.kill(); await Promise.race([gone, new Promise(r => setTimeout(r, 2000))]); }
    });
}

test('clean up the copy', { skip }, () => { if (copy) fs.rmSync(copy, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
