// The static request graph of a page served from core/ (no browser): the HTML, the stylesheets and modulepreload hints it links, every module
// imported statically, the element registry, and the module of each pk-* tag the markup names (elements an element creates itself at run time are not
// followed: a lower bound, and a stable one). Deterministic: bytes and counts only. Used by core/tests/page-weight.test.mjs and scripts/bench/wire.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { coreDir } from './lib.mjs';

export const gzipSize = b => zlib.gzipSync(b, { level: 9 }).length;
export const brotliSize = b => zlib.brotliCompressSync(b).length;
const read = url => { const f = path.join(coreDir, url); return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null; };
const resolve = (from, spec) => new URL(spec, 'http://x' + from).pathname;
const REGISTRY = '/dist/elements/registry.js';

export function pageGraph(html, pagePath) {
    const files = new Map([[pagePath, Buffer.from(html)]]);
    const queue = [];
    const add = url => { const b = !files.has(url) && read(url); if (b) { files.set(url, b); if (url.endsWith('.js')) queue.push(url); } };
    for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) add(m[1]);
    for (const m of html.matchAll(/from '([^']+)'/g)) add(m[1]);
    add(REGISTRY);
    const registry = Object.fromEntries([...read(REGISTRY).toString().matchAll(/"(pk-[\w-]+)": "([^"]+)"/g)].map(m => [m[1], m[2]]));
    const tags = new Set([...html.matchAll(/<(pk-[\w-]+)/g)].map(m => m[1]));
    const loaded = new Set();
    for (;;) {
        for (const t of tags) if (!loaded.has(t) && registry[t]) { loaded.add(t); add(resolve(REGISTRY, registry[t])); }
        while (queue.length) {
            const url = queue.pop(), src = files.get(url).toString();
            for (const m of src.matchAll(/(?:\bfrom|\bimport)\s*["'](\.[^"']+)["']/g)) add(resolve(url, m[1]));
        }
        if ([...tags].every(t => loaded.has(t) || !registry[t])) break;
    }
    const entries = [...files].sort(([a], [b]) => (a < b ? -1 : 1));
    return {
        requests: entries.length,
        raw: entries.reduce((s, [, b]) => s + b.length, 0),
        gzip: entries.reduce((s, [, b]) => s + gzipSize(b), 0),
        brotli: entries.reduce((s, [, b]) => s + brotliSize(b), 0),
        files: entries.map(([u]) => u),
    };
}
