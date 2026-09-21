// Elements warn on invalid input (issue #16): coerce() reports what it could not use, PkElement logs it once per element and prop, and
// the debug switch (isLogEnabled) keeps lifecycle lines out of the noise at the default level. The DOM parts are in tests/browser/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coerce } from '../js/element-core.js';
import { getLogBuffer, clearLogBuffer, isLogEnabled, setLogLevel, getLogLevel, configureLogging } from '../js/log.js';
import { symbolIds } from '../elements/icon/icon.js';

globalThis.HTMLElement ??= class {};
const { PkElement } = await import('../js/element.js');

const reports = (def, raw, fromAttr) => { const seen = []; const value = coerce(def, raw, fromAttr, (problem, fallback) => seen.push({ problem, fallback })); return { value, seen }; };

test('coerce reports an enum outside its values, a NaN number and json that does not parse', () => {
    const e = { type: 'enum', values: ['a', 'b'], default: 'a' };
    assert.deepEqual(reports(e, 'z').seen.map(r => r.fallback), ['a']);
    assert.match(reports(e, 'z').seen[0].problem, /one of a,b/);
    assert.equal(reports(e, 'z').value, 'a');
    const n = { type: 'number', default: 5 };
    assert.equal(reports(n, 'abc', true).seen.length, 1);
    assert.equal(reports(n, 'abc', true).value, 5);
    const j = { type: 'json', default: [] };
    const bad = reports(j, '{nope', true);
    assert.equal(bad.seen.length, 1); assert.match(bad.seen[0].problem, /valid JSON/); assert.deepEqual(bad.value, []);
});

test('coerce stays quiet for a prop that is simply unset or valid', () => {
    const e = { type: 'enum', values: ['a', 'b'], default: 'a' };
    for (const raw of [null, undefined, 'b']) assert.equal(reports(e, raw, true).seen.length, 0);
    const n = { type: 'number', default: 5 };
    for (const raw of [null, undefined, '', '7', 0]) assert.equal(reports(n, raw, true).seen.length, 0);
    const j = { type: 'json', default: [] };
    for (const [raw, attr] of [[null, true], ['[1]', true], [{ a: 1 }, false], [undefined, false]]) assert.equal(reports(j, raw, attr).seen.length, 0);
    assert.equal(reports({ type: 'boolean', default: false }, 'x', true).seen.length, 0);
    assert.equal(coerce(e, 'z'), 'a'); // the report argument is optional
});

function fakeElement(tag) {
    const el = Object.create(PkElement.prototype);
    Object.defineProperty(el, 'constructor', { value: { tag } });
    return el;
}

test('PkElement warns once per element and prop, with the tag as the scope', () => {
    clearLogBuffer();
    const el = fakeElement('pk-widget'); const def = { type: 'enum', values: ['sm', 'lg'], default: 'sm' };
    for (let i = 0; i < 5; i++) el.coerceProp('size', def, 'huge', true);
    const entries = getLogBuffer().filter(e => e.scope === 'pk-widget');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 'warn');
    assert.match(entries[0].message, /size="huge" is not one of sm,lg: using "sm"/);
    assert.deepEqual(entries[0].detail, { prop: 'size', value: 'huge', fallback: 'sm' });
    fakeElement('pk-widget').coerceProp('size', def, 'huge', true); // a different instance says it again
    assert.equal(getLogBuffer().filter(e => e.scope === 'pk-widget').length, 2);
    clearLogBuffer();
});

test('warnOnce keys are independent', () => {
    clearLogBuffer();
    const el = fakeElement('pk-widget2');
    el.warnOnce('a', 'one'); el.warnOnce('b', 'two'); el.warnOnce('a', 'one again');
    assert.deepEqual(getLogBuffer().filter(e => e.scope === 'pk-widget2').map(e => e.message), ['one', 'two']);
    clearLogBuffer();
});

test('isLogEnabled follows the level and a per-scope override', () => {
    const before = getLogLevel();
    try {
        setLogLevel('warn');
        assert.equal(isLogEnabled('debug', 'pk-x'), false);
        assert.equal(isLogEnabled('warn', 'pk-x'), true);
        configureLogging({ scopes: { 'pk-x': 'debug' } });
        assert.equal(isLogEnabled('debug', 'pk-x'), true);
        assert.equal(isLogEnabled('debug', 'pk-y'), false);
    } finally { setLogLevel(before); configureLogging({ scopes: { 'pk-x': before } }); }
});

test('symbolIds lists the ids of the symbols in a sprite', () => {
    const ids = symbolIds('<svg><symbol id="a" viewBox="0 0 1 1"/><symbol viewBox="0 0 1 1" id="b"></symbol><g id="not"/></svg>');
    assert.deepEqual([...ids].sort(), ['a', 'b']);
});
