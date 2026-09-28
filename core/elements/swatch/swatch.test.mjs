// Tests for the swatch logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRatio, passesAA, resolveColour } from './swatch.js';

test('formatRatio reads as a ratio label, or n/a when unmeasured', () => {
    assert.equal(formatRatio(4.632), '4.63:1');
    assert.equal(formatRatio(21), '21.00:1');
    assert.equal(formatRatio(null), 'n/a');
    assert.equal(formatRatio(undefined), 'n/a');
});

test('passesAA grades against the normal-text and large-text WCAG thresholds', () => {
    assert.equal(passesAA(4.5), true);
    assert.equal(passesAA(4.49), false);
    assert.equal(passesAA(3, true), true);
    assert.equal(passesAA(2.99, true), false);
    assert.equal(passesAA(null), false);
    assert.equal(passesAA(undefined), false);
});

test('resolveColour passes a literal colour through unchanged', () => {
    assert.equal(resolveColour({}, '#4e93e3'), '#4e93e3');
    assert.equal(resolveColour({}, 'rgb(78, 147, 227)'), 'rgb(78, 147, 227)');
});

test('resolveColour reads a custom property from the host element\'s computed style', () => {
    const host = { seen: null };
    const fakeWindow = { getComputedStyle: el => ({ getPropertyValue: name => { host.seen = { el, name }; return '  #1e1e1e  '; } }) };
    const original = globalThis.getComputedStyle;
    globalThis.getComputedStyle = fakeWindow.getComputedStyle;
    try {
        assert.equal(resolveColour(host, '--color-bg'), '#1e1e1e');
        assert.deepEqual(host.seen, { el: host, name: '--color-bg' });
    } finally {
        globalThis.getComputedStyle = original;
    }
});

test('resolveColour returns an empty string for an empty or missing source', () => {
    assert.equal(resolveColour({}, ''), '');
    assert.equal(resolveColour({}, undefined), '');
});
