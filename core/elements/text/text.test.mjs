// pk-text is CSS with one line of script (the paragraph role): these tests hold its css to its API (every enum value has a rule
// on a token that exists), the role to the inline prop, and the meta to the decision that headings stay native.
// The computed styles are checked in the browser suite (tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour from './text.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./text.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css');
const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
const prop = name => meta.props.find(p => p.name === name);

test('every variant, font, size, tone and weight value has a css rule (or is the default) and only uses tokens that exist', () => {
    assert.equal(prop('variant').default, 'normal');
    for (const name of ['variant', 'font', 'size', 'tone', 'weight']) {
        const p = prop(name);
        if (name !== 'variant') assert.equal(p.default, 'inherit', `${name} inherits by default`);
        for (const v of p.values) assert.ok(v === p.default || css.includes(`:host([${name}="${v}"])`), `${name} ${v} has a rule`);
    }
    for (const [, tok] of css.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('a block by default, a run inside a line when inline, and it respects [hidden] with no literal colours or physical properties', () => {
    assert.ok(/^:host \{ display: block;/.test(css)); assert.ok(css.includes(':host([inline]) { display: inline;'));
    assert.ok(css.includes(':host([hidden])')); assert.ok(css.includes(':host([truncate])'));
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|(?<![\w-])(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
});

test('the host is a paragraph as a block and has no role inline', () => {
    const make = inline => { const seen = []; const el = new (behaviour(class { aria(m) { seen.push(m); } }))(); el.inline = inline; el.updated(); return seen.at(-1); };
    assert.deepEqual(make(false), { role: 'paragraph' });
    assert.deepEqual(make(true), { role: null });
});

test('the heading variants are a look on the heading token scale, and real headings stay native (an explicit decision, not an omission)', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) { assert.ok(prop('variant').values.includes(`h${n}`)); assert.ok(css.includes(`:host([variant="h${n}"]) { font-size: var(--text-h${n}); }`)); }
    assert.match(meta.a11y, /no heading role/); assert.match(meta.summary, /real headings stay native h1 to h6/);
});

test('size, tone and weight come after the variants in the css, so they override a variant', () => {
    const at = s => css.indexOf(s);
    for (const later of [':host([size="meta"])', ':host([tone="muted"])', ':host([weight="regular"])', ':host([inline])']) assert.ok(at(later) > at(':host([variant="eyebrow"])'), `${later} follows the variants`);
});
