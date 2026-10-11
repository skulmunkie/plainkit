// Shared by the carveout-*.test.mjs files (issue #1107): each file makes its own copy of core/ outside the repository, so `node --test`
// runs them in parallel, and removes it in its own cleanup test. Not a test itself (no .test.mjs suffix).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The copy runs the other tests with CARVEOUT_CHILD=1 so the carveout files do not recurse.
export const skip = process.env.CARVEOUT_CHILD === '1' ? 'runs once, from the repository copy' : false;

export const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
export const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

export function makeCopy() {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-carve-'));
    if (path.resolve(copy).startsWith(path.resolve(source, '..'))) throw new Error('the copy must be outside the repo');
    fs.cpSync(source, copy, { recursive: true });
    if (!fs.existsSync(path.join(copy, 'tools', 'build.mjs'))) throw new Error('the copy has no tools/build.mjs');
    // tools/build.mjs (issue #600) imports esbuild, a devDependency of the repository ROOT package.json, not something core/ ships or installs
    // on its own (core/package.json, the published npm manifest, still has zero runtime dependencies). The copy is a real, separate folder
    // ("this folder copied anywhere"), so it needs its own way to resolve that import; a junction/symlink to the repository's already-installed
    // node_modules (not a copy of it: esbuild ships a native binary per platform, and this only needs to run on the machine that installed it)
    // stands in for what a real fork of this repository would get from its own `npm ci`.
    const rootNodeModules = path.resolve(source, '..', 'node_modules');
    if (fs.existsSync(rootNodeModules)) fs.symlinkSync(rootNodeModules, path.join(copy, 'node_modules'), 'junction');
    return copy;
}

export function removeCopy(copy) { if (copy) fs.rmSync(copy, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

export async function serve(copy, args) {
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

export async function crawl(base, start) {
    const seen = new Set(); const failures = []; const queue = [start];
    while (queue.length) {
        const url = queue.pop(); if (seen.has(url)) continue; seen.add(url);
        const res = await fetch(url);
        if (res.status !== 200) { failures.push(`${res.status} ${url}`); continue; }
        const kind = /\.html$|\/$/.test(url.split('?')[0]) ? 'html' : /\.css$/.test(url) ? 'css' : /\.m?js$/.test(url) ? 'js' : null;
        if (!kind) continue;
        for (const r of references(await res.text(), kind)) queue.push(new URL(r, url).href);
    }
    return { count: seen.size, failures };
}
