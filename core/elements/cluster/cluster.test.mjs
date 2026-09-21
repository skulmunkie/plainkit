// pk-cluster is CSS-only layout: these tests hold its css to its API (every gap value maps to a spacing token) and its meta to the layout rules.
// The computed layout is checked in the browser suite (tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./cluster.${ext}`, import.meta.url)), 'utf8');
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

test('it wraps by default, all alignments and justifications, vertical and nowrap', () => {
    assert.equal(prop('direction').default, 'horizontal'); assert.equal(prop('nowrap').default, false);
    for (const v of ['start', 'center', 'end', 'stretch']) assert.ok(prop('align').values.includes(v));
    for (const v of ['start', 'center', 'end', 'between']) assert.ok(prop('justify').values.includes(v));
    assert.ok(/flex-wrap:\s*wrap/.test(css)); assert.ok(css.includes(':host([nowrap])')); assert.ok(css.includes(':host([direction="vertical"])'));
});
