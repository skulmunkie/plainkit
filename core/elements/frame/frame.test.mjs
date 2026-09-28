// Tests for the frame logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSandbox, withThemeParam } from './frame.js';

test('resolveSandbox defaults to allow-scripts alone, and never adds allow-same-origin unasked', () => {
    assert.equal(resolveSandbox(undefined, false), 'allow-scripts');
    assert.equal(resolveSandbox('', false), 'allow-scripts');
    assert.equal(resolveSandbox('allow-popups', false), 'allow-popups');
});

test('resolveSandbox drops allow-same-origin combined with allow-scripts unless allowed, and warns once', () => {
    let warned = 0;
    assert.equal(resolveSandbox('allow-scripts allow-same-origin', false, () => warned++), 'allow-scripts');
    assert.equal(warned, 1);
    assert.equal(resolveSandbox('allow-same-origin', false, () => warned++), 'allow-same-origin', 'allow-same-origin alone (no allow-scripts) is not the unsafe combination');
    assert.equal(warned, 1);
});

test('resolveSandbox keeps allow-same-origin when explicitly allowed', () => {
    assert.equal(resolveSandbox('allow-scripts', true), 'allow-scripts allow-same-origin');
    assert.equal(resolveSandbox('allow-scripts allow-same-origin', true), 'allow-scripts allow-same-origin');
});

test('withThemeParam appends pk-theme only for a same-origin light or dark hand-off', () => {
    const base = 'https://plainkit.test/gallery/';
    assert.equal(withThemeParam('/preview.html', 'dark', base), 'https://plainkit.test/preview.html?pk-theme=dark');
    assert.equal(withThemeParam('/preview.html', 'light', base), 'https://plainkit.test/preview.html?pk-theme=light');
    assert.equal(withThemeParam('/preview.html', 'inherit', base), '/preview.html', 'inherit sends nothing');
    assert.equal(withThemeParam('https://other.test/x', 'dark', base), 'https://other.test/x', 'a different origin is left alone');
});
