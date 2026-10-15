// The app page preloads its module graph (#1076): on a cold, slow connection the browser only discovers a static import after its parent has
// downloaded, so the entry graph arrived as six serial round trips before the first paint. <link rel="modulepreload"> lists the files up front.
// The list is plain HTML (the CSP allows it: no inline script or style), so this test keeps it honest: every link names a real file, and the whole
// static import graph of app.js is listed, so a new import cannot silently put a round trip back. The element part of the list is checked too (#1125): the
// elements the shell draws at first paint, and the elements those draw, are loaded by js/loader.js through the registry (a dynamic import, which the static
// graph does not see), so they are derived here from the tags the shell names and the registry that maps them to files.
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

// Tags the scan below finds in those sources that are NOT loaded at first paint (each with the reason). The list may only shrink: a tag that is preloaded
// anyway, or that the scan no longer reaches, fails the last test, so the entries cannot rot either.
const NOT_AT_FIRST_PAINT = {
    'pk-select': 'also an event name (pk-select on a menu item); the pk-select element is a form control the shell never draws',
    'pk-tooltip': 'pk-button makes one only for a tooltip attribute',
    'pk-toast': 'pk-toast-stack makes one when a toast is shown',
    'pk-nav-item': 'js/app/nav.js builds rows only for a module with a nav tree; the default screen has none',
};

// The elements loaded at first paint: the pk-* tags named in the shell and the menu builder (js/app/shell.js, nav.js) that the registry knows, then the registry
// tags each element's own js and html name (what it draws inside itself), and the files those import. A tag an element only draws later (a dialog) would be a
// false demand; the sources scanned are the ones that build the first screen, so a new tag in them is a real one.
test('every element the shell loads at first paint is preloaded, with what it draws and imports', () => {
    const registryFile = path.join(root, 'elements', 'registry.js');
    assert.ok(fs.existsSync(registryFile), 'FIX: run node scripts/bootstrap.mjs (elements/registry.js is generated)');
    const registry = {};
    for (const m of fs.readFileSync(registryFile, 'utf8').matchAll(/"(pk-[a-z0-9-]+)":\s*"([^"]+)"/g)) registry[m[1]] = path.posix.join('elements', m[2]);
    const tagsIn = src => [...src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '').matchAll(/\bpk-[a-z][a-z0-9-]*/g)].map(m => m[0]).filter(t => registry[t]);
    const tags = new Set();
    const need = new Set();
    const reached = new Set();
    const visit = tag => {
        if (NOT_AT_FIRST_PAINT[tag]) { reached.add(tag); return; }
        if (tags.has(tag)) return;
        tags.add(tag);
        const file = path.posix.normalize(registry[tag]);
        need.add(file);
        for (const f of closure(file)) need.add(f);
        const base = file.replace(/\.element\.js$/, '');
        for (const ext of ['.js', '.html']) if (fs.existsSync(path.join(root, base + ext))) tagsIn(fs.readFileSync(path.join(root, base + ext), 'utf8')).forEach(visit);
    };
    for (const f of ['js/app/shell.js', 'js/app/nav.js']) tagsIn(fs.readFileSync(path.join(root, f), 'utf8')).forEach(visit);
    assert.ok(tags.size >= 8, 'FIX: the shell names fewer than 8 registry elements; this test lost its source (js/app/shell.js)');
    const missing = [...need].filter(f => !links.includes(f));
    for (const tag of Object.keys(NOT_AT_FIRST_PAINT)) {
        assert.ok(reached.has(tag), `FIX: ${tag} is no longer found in the shell sources; remove it from NOT_AT_FIRST_PAINT`);
        assert.ok(!links.includes(registry[tag]), `FIX: app.html preloads ${registry[tag]}, so ${tag} is loaded at first paint; remove it from NOT_AT_FIRST_PAINT`);
    }
    assert.deepEqual(missing, [], `FIX: add <link rel="modulepreload" href="..."> for these files to app.html (the first paint loads them through the registry): ${missing.join(', ')}`);
});

// The demo app (samples/app/index.html) is what the browser suite measures the first-page waterfall on (cases-app-shell.js, #1247): it measured 5 sequential module round
// trips with 8 hints and 3 once the static graph of the entry is hinted. Keep that list whole, or the case fails on the depth.
test('samples/app/index.html preloads the static import graph of its entry and every hint is a real file', () => {
    const dir = path.join(root, 'samples', 'app');
    const sample = [...fs.readFileSync(path.join(dir, 'index.html'), 'utf8').matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => path.posix.normalize(path.posix.join('samples/app', m[1])));
    for (const l of sample) assert.ok(fs.existsSync(path.join(root, l)), `FIX: samples/app/index.html preloads ${l}, which does not exist`);
    const missing = [...closure('samples/app/app.js')].filter(f => f !== 'samples/app/app.js' && !sample.includes(f));
    assert.deepEqual(missing, [], `FIX: add <link rel="modulepreload" href="../../..."> for these files to samples/app/index.html: ${missing.join(', ')}`);
});
