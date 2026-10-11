// The app page preloads its module graph (#1076): on a cold, slow connection the browser only discovers a static import after its parent has
// downloaded, so the entry graph arrived as six serial round trips before the first paint. <link rel="modulepreload"> lists the files up front.
// The list is plain HTML (the CSP allows it: no inline script or style), so this test keeps it honest: every link names a real file, and the whole
// static import graph of app.js is listed, so a new import cannot silently put a round trip back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const links = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);

function closure(entry) {
    const seen = new Set();
    const walk = f => {
        if (seen.has(f)) return;
        seen.add(f);
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'|(?:^|\n)\s*import\s+'(\.[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] ?? m[2])));
    };
    walk(entry);
    return seen;
}

test('app.html preloads modules, with no duplicate and no file that does not exist', () => {
    assert.ok(links.length > 0, 'FIX: app.html lost its <link rel="modulepreload"> list (#1076)');
    assert.equal(new Set(links).size, links.length, 'FIX: a modulepreload link is listed twice in app.html');
    for (const l of links) assert.ok(fs.existsSync(path.join(root, l)), `FIX: app.html preloads ${l}, which does not exist; remove or correct the link`);
});

test('every file in the static import graph of app.js is preloaded', () => {
    const missing = [...closure('app.js')].filter(f => f !== 'app.js' && !links.includes(f));
    assert.deepEqual(missing, [], `FIX: add <link rel="modulepreload" href="..."> for these files to app.html: ${missing.join(', ')}`);
});

test('the preloads stay same-origin relative paths under the CSP (no inline script or style)', () => {
    for (const l of links) assert.ok(!/^[a-z]+:|^\/\//i.test(l), `${l} must be a relative same-origin path`);
    assert.ok(!/<style|<script(?![^>]*\bsrc=)|\sstyle=/i.test(html), 'app.html must stay free of inline script and style');
});
