// pk-heading: a real h1..h6 in the shadow tree (level), with variant/tone/weight/truncate a look only. The css-to-api
// coverage and the level clamp are checked here; the rendered tag and computed styles are checked in the browser suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { clampLevel } from './heading.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./heading.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const html = read('html');
const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
const prop = name => meta.props.find(p => p.name === name);

test('every variant, tone and weight value has a css rule (or is the default) and only uses tokens that exist', () => {
    for (const name of ['variant', 'tone', 'weight']) {
        const p = prop(name);
        assert.equal(p.default, 'inherit', `${name} inherits by default`);
        for (const v of p.values) assert.ok(v === p.default || css.includes(`[variant="${v}"]`) || css.includes(`[tone="${v}"]`) || css.includes(`[weight="${v}"]`), `${name} ${v} has a rule`);
    }
    for (const [, tok] of css.matchAll(/var\((--[\w-]+)[,)]/g)) if (!tok.startsWith('--pk-')) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('a block, level defaults to 2, and it respects [hidden] with no literal colours or physical properties', () => {
    assert.ok(/^:host \{ display: block;/.test(css));
    assert.equal(prop('level').default, 2);
    assert.ok(css.includes(':host([hidden])')); assert.ok(css.includes(':host([truncate])'));
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|(?<![\w-])(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
});

test('the default control is an h2 (level default 2)', () => {
    assert.ok(html.includes('<h2 part="heading">'));
});

test('clampLevel keeps 1..6, rounds fractional levels, and falls back to 2 for anything else', () => {
    for (let n = 1; n <= 6; n++) assert.equal(clampLevel(n), n);
    assert.equal(clampLevel(2.4), 2); assert.equal(clampLevel(2.6), 3);
    assert.equal(clampLevel(0), 2); assert.equal(clampLevel(7), 2); assert.equal(clampLevel(-1), 2);
    assert.equal(clampLevel(NaN), 2); assert.equal(clampLevel(undefined), 2); assert.equal(clampLevel('x'), 2);
});

test('updated() swaps the control to the level\'s tag, keeps the slot, sets the size custom property, and warns once on an out-of-range level', () => {
    // No DOM in a node:test run: stub document.createElement, the only DOM global heading.js touches.
    const savedDocument = globalThis.document;
    globalThis.document = { createElement: tag => ({ localName: tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, childNodes: [], replaceChildren(...c) { this.childNodes = c; } }) };
    const make = () => {
        const warned = [];
        class Host {
            constructor() { this.shadowRoot = { querySelector: () => this.$node }; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; }
            part(name) { return name === 'heading' ? this.$node : null; }
            warnOnce(key, message) { warned.push({ key, message }); }
        }
        const el = new (behaviour(Host))();
        const slot = { tag: 'slot' };
        el.$node = { localName: 'h2', childNodes: [slot], replaceChildren(...c) { this.childNodes = c; }, replaceWith(n) { el.$node = n; n.replacedFrom = this; } };
        return { el, warned };
    };

    const a = make(); a.el.level = 3; a.el.updated();
    assert.equal(a.el.$node.localName, 'h3');
    assert.deepEqual(a.el.$node.childNodes, [{ tag: 'slot' }]);
    assert.equal(a.el.style.props['--pk-heading-size'], 'var(--text-h3)');
    assert.equal(a.warned.length, 0);

    const b = make(); b.el.level = 9; b.el.updated();
    assert.equal(b.el.$node.localName, 'h2');
    assert.equal(b.warned.length, 1);
    assert.match(b.warned[0].message, /level=9 must be 1 to 6: using 2/);

    const c = make(); c.el.level = 4; c.el.updated();
    const before = c.el.$node;
    c.el.updated(); // same level again: no swap (localName already matches)
    assert.equal(c.el.$node, before);

    globalThis.document = savedDocument;
});

test('a11y: a real heading in the shadow tree, decoupled from the look, and pk-text stays the look-only case', () => {
    assert.match(meta.a11y, /real h1 to h6/);
    assert.match(meta.summary, /look-only h1 to h6 variants/);
});
