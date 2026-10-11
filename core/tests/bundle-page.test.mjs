// core/tools/bundle-page.mjs: a page's elements and shared core as one JS and one CSS file. Needs the generated dist (node scripts/bootstrap.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagsInHtml, entrySource, bundlePage, unbundledGraph } from '../tools/bundle-page.mjs';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const built = fs.existsSync(path.join(dist, 'elements', 'registry.js'));
const skip = built ? false : 'FIX: run node scripts/bootstrap.mjs first (core/dist is generated).';

test('tagsInHtml finds the distinct pk-* tags and ignores other tags and text', () => {
    const html = '<div><pk-button>Go</pk-button><PK-Input name=a/><pk-button></pk-button><pkx-no><button>pk-text</button></div>';
    assert.deepEqual(tagsInHtml(html), ['pk-button', 'pk-input']);
});

test('entrySource imports each element and re-exports the init entry', () => {
    const src = entrySource(['button.js'], { app: true });
    assert.match(src, /export \* from "\.\/js\/init\.js"/);
    assert.match(src, /js\/app\.js/);
    assert.match(src, /import "\.\/elements\/button\.js"/);
});

test('a fixture page bundles to one JS and one CSS file, defines pk-button, and is smaller than the unbundled graph', { skip }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-bundle-'));
    try {
        const page = path.join(tmp, 'page.html');
        fs.writeFileSync(page, '<!doctype html><pk-button>Save</pk-button><pk-input name="q"></pk-input>');
        const tags = tagsInHtml(fs.readFileSync(page, 'utf8'));
        const out = path.join(tmp, 'out');
        const r = await bundlePage({ tags, dist, out });
        assert.deepEqual(fs.readdirSync(out).sort(), ['plainkit.bundle.css', 'plainkit.bundle.js']);
        const js = fs.readFileSync(path.join(out, 'plainkit.bundle.js'), 'utf8');
        assert.match(js, /pk-button/, 'the bundle keeps the pk-button registration');
        assert.match(js, /pk-input/);
        assert.doesNotMatch(js, /\nimport |^import /, 'no import statements left: it is self-contained');
        const u = await unbundledGraph({ tags, dist });
        assert.ok(u.files > 10, `the unbundled graph is many files (${u.files})`);
        assert.ok(r.js.gzip < u.gzip, `bundle ${r.js.gzip} B gzip must be smaller than the unbundled sum ${u.gzip} B`);
        assert.ok(r.css.raw > 0);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('an unknown tag is refused with a FIX line', { skip }, async () => {
    await assert.rejects(bundlePage({ tags: ['pk-buton'], dist, out: path.join(os.tmpdir(), 'pk-bundle-none') }), /pk-buton[\s\S]*FIX/);
});
