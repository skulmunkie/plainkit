import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closureOf, createCache, importsOf, tagsIn, unitKey } from '../ui-review-cache.mjs';
import { parseArgs } from '../ui-review.mjs';

test('tagsIn lists the known elements a text mentions', () => {
    assert.deepEqual(tagsIn('<pk-a></pk-a> <pk-b-c> pk-zz', new Set(['a', 'b-c'])), ['a', 'b-c']);
});

test('importsOf finds static and dynamic relative imports only', () => {
    assert.deepEqual(importsOf(`import x from './a.js'; import './b.js'; const m = await import("../c.js"); import y from 'node:fs';`), ['./a.js', './b.js', '../c.js']);
});

test('closureOf follows uses transitively and widens for a dynamic tag', () => {
    const known = new Set(['a', 'b', 'c', 'd']);
    assert.deepEqual(closureOf(['a'], { a: ['b'], b: ['c'], c: [], d: [] }, new Set(), known), ['a', 'b', 'c']);
    assert.deepEqual(closureOf(['a'], { a: ['b'], b: [] }, new Set(['b']), known), ['a', 'b', 'c', 'd']);
});

test('unitKey changes with any part', () => {
    const k = unitKey({ a: 1, b: 'x' });
    assert.equal(k, unitKey({ a: 1, b: 'x' }));
    assert.notEqual(k, unitKey({ a: 1, b: 'y' }));
});

test('--cache is opt-in and --no-cache wins', () => {
    assert.equal(parseArgs([]).cache, false);
    assert.equal(parseArgs(['--cache']).cache, true);
    assert.equal(parseArgs(['--cache', '--no-cache']).cache, false);
    assert.equal(parseArgs(['--no-cache', '--cache']).cache, false);
});

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-cache-'));
    const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
    for (const n of ['a', 'b', 'c']) w(`core/elements/${n}/${n}.css`, `.${n}{}`);
    w('core/elements/a/a.html', '<pk-b></pk-b>');
    w('core/tokens/tokens.css', ':root{}');
    w('core/js/x.js', '1');
    w('core/tests/review/review.js', '1');
    w('core/tests/review/scenarios/s.js', "import '../../../js/x.js';");
    w('core/notes.md', 'unrelated');
    w('scripts/ui-review.mjs', '1');
    return { root, w, cache: (chrome = 'Chrome/1') => createCache({ root, dir: path.join(root, 'review-cache'), chrome, known: new Set(['a', 'b', 'c']) }) };
}
const vp = { name: 'desktop', width: 1280, height: 900 };
const key = (c, name) => c.keyFor({ kind: 'example', name, vp, theme: 'light' });

test('a changed input changes the key of the units that load it, an unrelated file changes nothing', () => {
    const f = fixture();
    const before = Object.fromEntries(['a', 'b', 'c'].map(n => [n, key(f.cache(), n)]));
    f.w('core/notes.md', 'changed');
    assert.deepEqual(Object.fromEntries(['a', 'b', 'c'].map(n => [n, key(f.cache(), n)])), before);
    f.w('core/elements/b/b.css', '.b{color:red}');
    const afterB = Object.fromEntries(['a', 'b', 'c'].map(n => [n, key(f.cache(), n)]));
    assert.notEqual(afterB.a, before.a); // a composes b
    assert.notEqual(afterB.b, before.b);
    assert.equal(afterB.c, before.c);
    f.w('core/tokens/tokens.css', ':root{--x:1}');
    for (const n of ['a', 'b', 'c']) assert.notEqual(key(f.cache(), n), afterB[n]);
    assert.notEqual(key(f.cache('Chrome/2'), 'c'), key(f.cache(), 'c'));
    assert.notEqual(f.cache().keyFor({ kind: 'example', name: 'c', vp: { ...vp, width: 375 }, theme: 'light' }), key(f.cache(), 'c'));
    assert.notEqual(f.cache().keyFor({ kind: 'example', name: 'c', vp, theme: 'dark' }), key(f.cache(), 'c'));
});

test('a scenario key follows the scenario file and its imports', () => {
    const f = fixture();
    const k = () => f.cache().keyFor({ kind: 'scenario', name: 's', sc: { name: 's', elements: ['c'] }, vp, theme: 'light' });
    const k0 = k();
    f.w('core/tests/review/scenarios/s.js', "import '../../../js/x.js'; // edited");
    assert.notEqual(k(), k0);
});

test('a unit with an error finding or an unseen state is not stored', async () => {
    const f = fixture();
    const out = path.join(f.root, 'out'); fs.mkdirSync(out);
    const manifest = { shots: [], notSeen: [] };
    const c = f.cache();
    await c.unit({ kind: 'example', name: 'c', vp, theme: 'light' }, { manifest, out }, async () => { manifest.shots.push({ file: null, findings: [{ severity: 'error' }] }); });
    await c.unit({ kind: 'example', name: 'b', vp, theme: 'light' }, { manifest, out }, async () => { manifest.notSeen.push({}); });
    assert.equal(fs.existsSync(path.join(f.root, 'review-cache')), false);
});

test('a hit restores the shots and files, a corrupt entry is rendered again', async () => {
    const f = fixture();
    const out = path.join(f.root, 'out'); fs.mkdirSync(out);
    const manifest = { shots: [], notSeen: [] };
    const run = (cache, content) => cache.unit({ kind: 'example', name: 'c', vp, theme: 'light' }, { manifest, out }, async () => {
        fs.writeFileSync(path.join(out, 'c.png'), content);
        manifest.shots.push({ file: 'c.png', findings: [{ rule: 'r' }] });
    });
    const c1 = f.cache(); await run(c1, 'one');
    assert.deepEqual(c1.stats, { hits: 0, misses: 1, corrupt: 0 });
    fs.rmSync(path.join(out, 'c.png')); manifest.shots.length = 0;
    const c2 = f.cache(); await run(c2, 'never rendered');
    assert.deepEqual(c2.stats, { hits: 1, misses: 0, corrupt: 0 });
    assert.equal(fs.readFileSync(path.join(out, 'c.png'), 'utf8'), 'one');
    assert.deepEqual(manifest.shots, [{ file: 'c.png', findings: [{ rule: 'r' }] }]);
    fs.writeFileSync(path.join(f.root, 'review-cache', key(c1, 'c'), 'c.png'), 'tampered');
    manifest.shots.length = 0;
    const c3 = f.cache(); const quiet = console.error; console.error = () => {};
    try { await run(c3, 'two'); } finally { console.error = quiet; }
    assert.deepEqual(c3.stats, { hits: 0, misses: 1, corrupt: 1 });
    assert.equal(fs.readFileSync(path.join(out, 'c.png'), 'utf8'), 'two');
});
