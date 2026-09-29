// pk-container: a max-width, padded content region, optionally scrolling. CSS holds size/padding to the content and space tokens;
// the JS gives a scrolling region tabindex=0, role=region and its accessible name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./container.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css');
const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
const prop = name => meta.props.find(p => p.name === name);

test('every size value has a css rule (or is the default) and only uses --content-* tokens that exist', () => {
    const size = prop('size');
    for (const v of size.values) assert.ok(v === size.default || css.includes(`:host([size="${v}"])`), `size ${v} has a rule`);
    for (const [, tok] of css.matchAll(/var\((--content-\w+)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('every padding value has a css rule (or is the default) and only uses spacing tokens that exist', () => {
    const padding = prop('padding');
    for (const v of padding.values) assert.ok(v === padding.default || css.includes(`:host([padding="${v}"])`), `padding ${v} has a rule`);
    for (const [, tok] of css.matchAll(/var\((--space-\d+)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('it respects [hidden], uses logical properties and no literal colours, widths or heights', () => {
    assert.ok(css.includes(':host([hidden])'));
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|\b(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
});

test('no boolean prop defaults to true (fill is an attribute-presence prop)', () => {
    assert.equal(prop('fill').type, 'boolean'); assert.equal(prop('fill').default, false);
});

test('scroll adds overflow to the root part for y and both, and none has no rule beyond the default', () => {
    const scroll = prop('scroll');
    assert.equal(scroll.default, 'none');
    assert.match(css, /:host\(\[scroll="y"\]\) \[part="root"\] \{[^}]*overflow-y:\s*auto/);
    assert.match(css, /:host\(\[scroll="both"\]\) \[part="root"\] \{[^}]*overflow:\s*auto/);
});

test('align start removes the centering margin', () => {
    assert.match(css, /:host\(\[align="start"\]\) \[part="root"\] \{[^}]*margin-inline:\s*0/);
});

// Behaviour: stub base, no DOM (same approach as divider.test.mjs).
import behaviour from './container.js';
const make = props => {
    const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    const warnings = [];
    const el = new (behaviour(class { part() { return root; } warnOnce(key, message) { warnings.push({ key, message }); } }))();
    Object.assign(el, { scroll: 'none', label: '' }, props);
    return { el, root, warnings };
};

test('scroll none (the default) leaves the root plain: no tabindex, role or aria-label', () => {
    const { el, root } = make();
    el.updated();
    assert.deepEqual(root.attrs, {});
});

test('scroll y or both makes the root a labelled, focusable region', () => {
    for (const scroll of ['y', 'both']) {
        const { el, root } = make({ scroll, label: 'Example output' });
        el.updated();
        assert.equal(root.attrs.tabindex, '0');
        assert.equal(root.attrs.role, 'region');
        assert.equal(root.attrs['aria-label'], 'Example output');
    }
});

test('scroll set without a label warns once and leaves the region unnamed', () => {
    const { el, root, warnings } = make({ scroll: 'y', label: '' });
    el.updated();
    assert.equal(root.attrs['aria-label'], undefined);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].key, 'label');
    assert.match(warnings[0].message, /no accessible name/);
});

test('turning scroll back off clears tabindex, role and aria-label', () => {
    const { el, root } = make({ scroll: 'y', label: 'Log' });
    el.updated();
    assert.equal(root.attrs.role, 'region');
    el.scroll = 'none'; el.updated();
    assert.deepEqual(root.attrs, {});
});
