// The loader names the extra that holds a tag when that extra is not in the folder (#1656, phase 2 loader side): the shipped registry carries `extras` (derived from
// packages.json) and the shipped (by-name) loader turns a failed import of such a tag into one actionable log line instead of the generic "could not load".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTempDir } from '../tools/tempdir.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(core, 'dist');
const built = fs.existsSync(path.join(dist, 'elements', 'registry.js'));
const opts = { skip: built ? false : 'FIX: run node scripts/bootstrap.mjs (core/dist is generated)' };
const expected = () => Object.fromEntries(JSON.parse(fs.readFileSync(path.join(core, '..', 'packages.json'), 'utf8')).packages
    .filter(p => p.built && p.id !== 'plainkit').flatMap(p => (p.elements ?? []).map(t => [t, p.id])));

test('tools/extras.map.json equals the built extras of packages.json', () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(core, 'tools', 'extras.map.json'), 'utf8')), expected(), 'FIX: core/tools/extras.map.json (read by the build, which cannot see packages.json in a carve-out copy) must list every element of every built extra in packages.json');
});

test('the source and the shipped registry export extras: every tag of a built extra -> its id, plus the version for the zip name', opts, async () => {
    const want = expected(), version = fs.readFileSync(path.join(core, 'VERSION'), 'utf8').trim();
    assert.ok(Object.keys(want).includes('pk-canvas') && Object.keys(want).includes('pk-markdown'), 'FIX: packages.json lost the canvas or markdown elements');
    for (const file of [path.join(dist, 'elements', 'registry.js'), path.join(core, 'elements', 'registry.js')]) {
        const m = await import(pathToFileURL(file).href);
        assert.deepEqual({ ...m.extras }, want, `FIX: ${file} extras differs from packages.json; run node scripts/bootstrap.mjs`);
        assert.equal(m.extrasVersion, version);
        for (const tag of Object.keys(want)) assert.ok(m.default[tag], `${tag} is in extras but not in the registry`);
    }
});

test('the shipped loader on a core-only folder: a missing extra module logs one message naming the extra, the zip and the Pages path', opts, async () => {
    const dir = makeTempDir('pk-loader-extras-');
    try {
        fs.mkdirSync(path.join(dir, 'js')); fs.mkdirSync(path.join(dir, 'elements'));
        for (const f of ['loader.js', 'loader-missing.js', 'log.js']) fs.copyFileSync(path.join(dist, 'js', f), path.join(dir, 'js', f));
        fs.copyFileSync(path.join(dist, 'elements', 'registry.js'), path.join(dir, 'elements', 'registry.js'));
        const lines = [], realError = console.error;
        console.error = (...a) => lines.push(a.map(String).join(' '));
        const tags = ['pk-canvas', 'pk-canvas', 'pk-markdown'];
        const root = { matches: () => false, querySelectorAll: () => tags.map(localName => ({ localName })) };
        const { loadElements } = await import(pathToFileURL(path.join(dir, 'js', 'loader.js')).href);
        try { await loadElements(root); await loadElements(root); } finally { console.error = realError; }
        const canvas = lines.filter(l => l.includes('<pk-canvas>')), md = lines.filter(l => l.includes('<pk-markdown>'));
        assert.equal(canvas.length, 1, `one message for <pk-canvas>, not one per tag or per scan: ${lines.join(' | ')}`);
        assert.match(canvas[0], /plainkit\.canvas-\d+\.\d+\.\d+\S*\.zip/);
        assert.match(canvas[0], /packages\/plainkit\.canvas\//);
        assert.equal(md.length, 1);
        assert.match(md[0], /plainkit\.markdown/);
        assert.ok(!lines.some(l => l.includes('could not load <pk-')), 'the generic line is not written for a known extra');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
