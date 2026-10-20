// pk-grid is CSS-only layout: these tests hold its css to its API (every gap value maps to a spacing token) and its meta to the layout rules.
// The computed layout is checked in the browser suite (tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ratioColumns } from './grid.js';
import grid from './grid.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./grid.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css');
const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
const prop = name => meta.props.find(p => p.name === name);

test('every gap value has a css rule (or is the default) and only uses spacing tokens that exist', () => {
    const gap = prop('gap');
    for (const v of gap.values) assert.ok(v === gap.default || css.includes(`:host([gap="${v}"])`), `gap ${v} has a rule`);
    for (const [, tok] of css.matchAll(/var\((--space-\d+)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('it respects [hidden], uses logical properties and no literal colours', () => {
    assert.ok(css.includes(':host([hidden])'));
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|\b(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
});

test('auto-fit columns of at least min (capped to the container so a phone gets one column), optionally capped by columns', () => {
    assert.ok(/repeat\(auto-fit,\s*minmax\(max\(min\(var\(--pk-grid-min, 16rem\), 100%\)/.test(css));
    assert.equal(prop('min').default, '16rem'); assert.equal(prop('columns').default, 0);
});

// Issue #21: only equal columns; ratio="2:1" gives explicit proportional ones.
test('ratioColumns turns a ratio into minmax(0, nfr) columns and refuses anything else', () => {
    assert.equal(ratioColumns('2:1'), 'minmax(0, 2fr) minmax(0, 1fr)');
    assert.equal(ratioColumns(' 1 : 2 : 1 '), 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)');
    assert.equal(ratioColumns('1.5:1'), 'minmax(0, 1.5fr) minmax(0, 1fr)');
    for (const bad of ['', '2', '2:', ':1', 'a:b', '0:1', '2fr 1fr', '-1:1']) assert.equal(ratioColumns(bad), null, bad);
});

test('the ratio prop sets --pk-grid-ratio, warns once on a bad value and clears it again', () => {
    globalThis.CSS = { supports: () => true };
    const Grid = grid(class {}); const style = new Map(); const warned = [];
    const host = { min: '', columns: 0, ratio: '2:1', tracks: '', hasAttribute: () => false, style: { setProperty: (k, v) => style.set(k, v), removeProperty: k => style.delete(k) }, warnOnce: (k, m) => warned.push([k, m]) };
    Grid.prototype.updated.call(host);
    assert.equal(style.get('--pk-grid-ratio'), 'minmax(0, 2fr) minmax(0, 1fr)');
    host.ratio = 'wide'; Grid.prototype.updated.call(host);
    assert.ok(!style.has('--pk-grid-ratio'));
    assert.equal(warned.length, 1); assert.match(warned[0][1], /wide/);
    host.ratio = ''; Grid.prototype.updated.call(host);
    assert.equal(warned.length, 1);
});

test('the css uses --pk-grid-ratio when set and goes back to auto columns on a phone; the meta lists both', () => {
    assert.ok(css.includes('grid-template-columns: var(--pk-grid-ratio, var(--_cols));'));
    assert.match(css, /@media \(--phone\) \{ :host \{ grid-template-columns: var\(--_cols\); \}/);
    assert.equal(prop('ratio').default, '');
    assert.ok(meta.cssProperties.some(p => p.name === '--pk-grid-ratio'));
});

test('tracks sets --pk-grid-ratio over ratio, is checked with CSS.supports, and warns once on a list the browser refuses (#1666)', () => {
    globalThis.CSS = { supports: (prop, v) => prop === 'grid-template-columns' && !v.includes('nonsense') };
    const Grid = grid(class {}); const style = new Map(); const warned = [];
    const host = { min: '', columns: 0, ratio: '2:1', tracks: 'repeat(12, minmax(0, 1fr))', hasAttribute: () => false, style: { setProperty: (k, v) => style.set(k, v), removeProperty: k => style.delete(k) }, warnOnce: (k, m) => warned.push([k, m]) };
    Grid.prototype.updated.call(host);
    assert.equal(style.get('--pk-grid-ratio'), 'repeat(12, minmax(0, 1fr))');
    host.tracks = 'nonsense'; Grid.prototype.updated.call(host);
    assert.equal(style.get('--pk-grid-ratio'), 'minmax(0, 2fr) minmax(0, 1fr)', 'falls back to the ratio');
    assert.equal(warned.length, 1); assert.match(warned[0][1], /nonsense/);
    host.tracks = ''; host.ratio = ''; Grid.prototype.updated.call(host);
    assert.ok(!style.has('--pk-grid-ratio'));
});

test('col-span 2 to 12 and row-span 2 to 4 have a css rule each, and a phone drops them', () => {
    for (let n = 2; n <= 12; n++) assert.ok(css.includes(`::slotted([data-col-span="${n}"]) { grid-column: span ${n}; }`), `col-span ${n}`);
    for (let n = 2; n <= 4; n++) assert.ok(css.includes(`::slotted([data-row-span="${n}"]) { grid-row: span ${n}; }`), `row-span ${n}`);
    assert.match(css, /@media \(--phone\) \{[^}]*\} ::slotted\(\[data-col-span\]\) \{ grid-column: auto; \} ::slotted\(\[data-row-span\]\) \{ grid-row: auto; \}/);
    assert.match(prop('tracks').description, /col-span/);
});
