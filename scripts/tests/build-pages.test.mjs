// scripts/build-pages.mjs (#1123): every local reference from the Pages entry pages, and every import in the graph behind them, exists in the artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isLocal = s => s && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(s);

test('the Pages artifact contains everything index.html and app.html load', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-pages-'));
    try {
        const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-pages.mjs'), out], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        const missing = [], seen = new Set(), queue = [];
        const need = (from, ref) => {
            const clean = ref.split('#')[0].split('?')[0];
            if (!clean || !isLocal(clean)) return;
            const file = path.resolve(path.dirname(from), clean);
            if (seen.has(file)) return;
            seen.add(file);
            if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { missing.push(`${path.relative(out, from)} -> ${ref}`); return; }
            if (file.endsWith('.js') && !file.endsWith('.data.js')) queue.push(file);
        };
        for (const page of ['index.html', 'app.html']) {
            const html = path.join(out, page);
            assert.ok(fs.existsSync(html), `${page} is missing from the artifact`);
            for (const m of fs.readFileSync(html, 'utf8').matchAll(/<(?:link|script|img)\b[^>]*?\b(?:href|src)="([^"]*)"/g)) need(html, m[1]);
        }
        while (queue.length) {
            const f = queue.pop();
            // comments are dropped: doc comments hold sample imports that are not part of the graph
            const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            for (const m of src.matchAll(/^[ \t]*(?:import\b[^'"\n;(]*?|export\b[^'"\n;]*?\bfrom\s*)['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
                const ref = m[1] ?? m[2];
                if (ref.startsWith('.')) need(f, ref);
            }
        }
        assert.deepEqual(missing, [], `FIX: add the missing files to INCLUDE in scripts/build-pages.mjs:\n${missing.join('\n')}`);
        assert.ok(seen.size > 100, 'the walk should reach the app graph');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
