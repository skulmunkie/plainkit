// js/field-conditions.js: the declarative condition syntax of a field spec (#1282).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluate } from '../js/field-conditions.js';

const run = (src, values) => parse(src).run(values);

test('comparisons: text equality like the data `when`, numbers compare as numbers', () => {
    assert.equal(run("status == 'paid'", { status: 'paid' }), true);
    assert.equal(run('status != "paid"', { status: 'open' }), true);
    assert.equal(run('qty == 3', { qty: '3' }), true, 'text and number meet as numbers');
    assert.equal(run('qty > 9', { qty: '10' }), true, 'numerically, not as text');
    assert.equal(run('qty >= 10 && qty <= 10', { qty: 10 }), true);
    assert.equal(run("name < 'b'", { name: 'a' }), true);
    assert.equal(run("status == ''", {}), true, 'an unset field is empty text');
});

test('in, not, and, or, parentheses and bare truthiness', () => {
    assert.equal(run("status in ['paid', 'sent']", { status: 'sent' }), true);
    assert.equal(run('n in [1, 2]', { n: '2' }), true);
    assert.equal(run("status in ['paid']", { status: 'x' }), false);
    assert.equal(run('rush', { rush: true }), true);
    assert.equal(run('rush', { rush: false }), false);
    assert.equal(run('!rush', {}), true);
    assert.equal(run('a || b && c', { a: 'x' }), true, '&& binds tighter than ||');
    assert.equal(run('(a || b) && c', { a: 'x' }), false);
    assert.equal(run('note', { note: 'false' }), false);
    assert.equal(run('qty', { qty: 0 }), false);
});

test('no code runs: calls, member access and unknown characters are syntax errors', () => {
    for (const bad of ['alert(1)', 'a.b.c(', 'a ==', '== a', 'a == b c', "'open", 'a ? b : c', 'a = 1', '(a', 'x in y', 'a;b']) assert.throws(() => parse(bad), Error, bad);
});

test('evaluate: an unknown field or a syntax error warns and gives the fallback', () => {
    const seen = [], warn = m => seen.push(m), known = new Set(['status']);
    assert.equal(evaluate("status == 'paid'", { status: 'paid' }, known, false, warn), true);
    assert.equal(evaluate("stat == 'paid'", { status: 'paid' }, known, true, warn), true);
    assert.equal(evaluate("stat == 'paid'", { status: 'paid' }, known, false, warn), false);
    assert.equal(evaluate('status ==', {}, known, true, warn), true);
    assert.equal(seen.length, 3);
    assert.match(seen[0], /unknown field "stat"/);
    assert.match(seen[2], /not valid/);
});
