// pk-form-section is template and CSS only (no behaviour file), so this guards its API declaration: the meta file is valid, and every example
// uses only existing pk-* tags and props they declare.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateApi } from '../../tools/element-api.mjs';

const read = ext => fs.readFileSync(new URL(`./form-section.${ext}`, import.meta.url), 'utf8');
const meta = JSON.parse(read('meta.json'));
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const metaOf = tag => { const n = tag.slice(3); const f = new URL(`../${n}/${n}.meta.json`, import.meta.url); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };

test('the meta file passes the API validator against its template and stylesheet', () => {
    assert.deepEqual(validateApi(meta, { template: read('html'), css: read('css') }), []);
    assert.equal(meta.tag, 'pk-form-section');
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
