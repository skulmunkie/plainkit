import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, parseMoney, formatMoney, moneyProblem, stepValue, copyValue } from './input.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});

test('parseMoney reads free-form amounts, negatives in parentheses or with a minus, and refuses junk', () => {
    assert.equal(parseMoney('$1,234.5'), 1234.5);
    assert.equal(parseMoney(' 19.99 '), 19.99);
    assert.equal(parseMoney('(12)'), -12);
    assert.equal(parseMoney('-3.50'), -3.5);
    assert.equal(parseMoney('.5'), 0.5);
    assert.equal(parseMoney(''), null);
    assert.equal(parseMoney('abc'), null);
    assert.equal(parseMoney('1.2.3'), null);
});

test('formatMoney pads to the decimals, groups thousands and can skip grouping', () => {
    assert.equal(formatMoney(1234.5), '1,234.50');
    assert.equal(formatMoney(7), '7.00');
    assert.equal(formatMoney(1234.5, { group: false }), '1234.50');
    assert.equal(formatMoney(1234.5, { decimals: 0 }), '1,235');
});

test('moneyProblem is empty for blank or good values and names the failed rule otherwise', () => {
    assert.equal(moneyProblem(null, '', null, null), '');
    assert.equal(moneyProblem(5, '5', 0, 10), '');
    assert.match(moneyProblem(null, 'abc', null, null), /amount/);
    assert.match(moneyProblem(-1, '-1', 0, null), /At least/);
    assert.match(moneyProblem(11, '11', null, 10), /At most/);
});

test('stepValue steps, rounds float noise, clamps and treats empty as zero', () => {
    assert.equal(stepValue(5, 1, 1), 6);
    assert.equal(stepValue(0.1, 0.1, 1), 0.2);
    assert.equal(stepValue(1.1, 0.1, 1), 1.2);
    assert.equal(stepValue(9, 5, 1, 0, 10), 10);
    assert.equal(stepValue(1, 5, -1, 0, 10), 0);
    assert.equal(stepValue(NaN, 1, 1), 1);
    assert.equal(stepValue(3, 0, 1), 4);
});
test('copyValue resolves true once writeText resolves, and never throws when it is missing or rejects', async () => {
    assert.equal(await copyValue('x', { writeText: async () => {} }), true);
    assert.equal(await copyValue('x', undefined), false);
    assert.equal(await copyValue('x', {}), false);
    assert.equal(await copyValue('x', { writeText: async () => { throw new DOMException('denied', 'NotAllowedError'); } }), false);
});

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./input.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: the label was aria-only; showLabel renders it as visible text linked to the control.
test('showLabel renders a label element for the control, off by default and not shown with a floating label', () => {
    assert.equal(prop('showLabel').type, 'boolean'); assert.equal(prop('showLabel').default, false);
    const html = read('html'); const css = read('css');
    assert.match(html, /<label part="label" for="c">\{\{label\}\}<\/label>/);
    assert.match(html, /<input part="control" id="c" /);
    assert.ok(meta.parts.some(p => p.name === 'label'), 'the label part is documented');
    assert.ok(css.includes(':host([show-label]:not([floating])) label { display: block; }'));
});

// Issue #209: masked, revealable, sensitive-but-readable values (client id, API key) need a copy action too.
test('copyable adds a disabled-while-empty copy button, off by default', () => {
    assert.equal(prop('copyable').type, 'boolean'); assert.equal(prop('copyable').default, false);
    const html = read('html'); const css = read('css');
    assert.match(html, /<button part="copy" class="ib copy" type="button" aria-label="Copy">/);
    assert.ok(meta.parts.some(p => p.name === 'copy'), 'the copy part is documented');
    assert.ok(css.includes(':host([copyable]) .copy { display: grid; }'));
});
