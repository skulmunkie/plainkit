// Tests for the specimen logic. Run: node --test core/elements/specimen/specimen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inferKind, resolveToken } from './specimen.js';

test('inferKind reads the kind from the token prefix', () => {
    assert.equal(inferKind('--space-4'), 'space');
    assert.equal(inferKind('--radius-md'), 'radius');
    assert.equal(inferKind('--shadow-card'), 'shadow');
    assert.equal(inferKind('--z-sticky'), 'layer');
    assert.equal(inferKind('--touch-target'), 'size');
    assert.equal(inferKind(' --space-2 '), 'space');
});

test('inferKind is empty for an unknown prefix or a missing token', () => {
    assert.equal(inferKind('--color-accent'), '');
    assert.equal(inferKind(''), '');
    assert.equal(inferKind(undefined), '');
});

test('resolveToken reads a custom property from the host computed style, trimmed', () => {
    const original = globalThis.getComputedStyle;
    let seen = null;
    globalThis.getComputedStyle = el => ({ getPropertyValue: name => { seen = { el, name }; return '  1rem  '; } });
    try {
        const host = {};
        assert.equal(resolveToken(host, '--space-4'), '1rem');
        assert.deepEqual(seen, { el: host, name: '--space-4' });
    } finally {
        globalThis.getComputedStyle = original;
    }
});

test('resolveToken ignores anything that is not a custom property', () => {
    assert.equal(resolveToken({}, '16px'), '');
    assert.equal(resolveToken({}, undefined), '');
});
