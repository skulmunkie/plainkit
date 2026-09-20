import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, parseMoney, formatMoney, moneyProblem, stepValue } from './input.js';

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
