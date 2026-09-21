// pk-grid is CSS-only layout: these tests hold its css to its API (every gap value maps to a spacing token) and its meta to the layout rules.
// The computed layout is checked in the browser suite (tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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

test('the blazor block maps every prop and the default slot', () => {
    assert.equal(meta.blazor.component, 'PkGrid');
    for (const p of meta.props) assert.ok(meta.blazor.params.some(x => x.prop === p.name), p.name);
    assert.ok(meta.blazor.params.some(x => x.slot === ''));
});

test('auto-fit columns of at least min (capped to the container so a phone gets one column), optionally capped by columns', () => {
    assert.ok(/repeat\(auto-fit,\s*minmax\(max\(min\(var\(--pk-grid-min, 16rem\), 100%\)/.test(css));
    assert.equal(prop('min').default, '16rem'); assert.equal(prop('columns').default, 0);
});
