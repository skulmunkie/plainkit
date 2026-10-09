// pk-record-form: the behaviour is in the browser cases (tests/browser/cases-record-form.js); this guards its API declaration, the examples and the toolbar template.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateApi } from '../../tools/element-api.mjs';
import { findElementFolder } from '../../tools/element-folders.mjs';

const read = ext => fs.readFileSync(new URL(`./record-form.${ext}`, import.meta.url), 'utf8');
const meta = JSON.parse(read('meta.json'));
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const metaOf = tag => { const n = tag.slice(3); const e = findElementFolder(n); return e ? JSON.parse(fs.readFileSync(path.join(e.dir, `${n}.meta.json`), 'utf8')) : null; };

test('the meta file passes the API validator against its template and stylesheet', () => {
    assert.deepEqual(validateApi(meta, { template: read('html'), css: read('css') }), []);
    assert.equal(meta.tag, 'pk-record-form');
});

test('every example is non-empty markup that uses only existing pk-* elements and their declared attributes', () => {
    assert.ok(meta.examples.length > 0);
    const globals = new Set(['class', 'id', 'slot', 'hidden', 'title', 'role', 'name', 'type', 'value', 'placeholder', 'for', 'href']);
    for (const ex of meta.examples) {
        assert.ok(ex.html.trim().length > 0, `${ex.title} is empty`);
        assert.doesNotMatch(ex.html, /\sstyle\s*=/, `${ex.title} uses a style attribute`);
        for (const [, tag, attrs] of ex.html.matchAll(/<(pk-[a-z0-9-]+)((?:\s+[^>]*?)?)>/g)) {
            const m = metaOf(tag);
            assert.ok(m, `${ex.title}: <${tag}> is not an element in this repository`);
            const declared = new Set(m.props.map(p => kebab(p.name)));
            for (const [, attr] of attrs.replace(/"[^"]*"/g, '""').matchAll(/\s([a-z][a-z0-9-]*)(?==|\s|$)/g)) {
                assert.ok(globals.has(attr) || attr.startsWith('aria-') || attr.startsWith('data-') || declared.has(attr), `${ex.title}: <${tag} ${attr}> is not a declared prop`);
            }
        }
    }
});

test('the toolbar buttons carry icons and fold to them on a phone; the events and submit() are declared', () => {
    const tpl = read('html');
    for (const part of ['cancel', 'delete', 'save']) assert.match(tpl, new RegExp(`part="${part}"[^>]*icon-name="[a-z-]+"[^>]*collapse="phone"`), `${part} folds to its icon`);
    assert.deepEqual(meta.events.map(e => e.name).sort(), ['pk-record-cancel', 'pk-record-delete', 'pk-record-save']);
    assert.ok(meta.methods.some(m => m.name === 'submit()'));
});
