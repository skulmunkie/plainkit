// The theme editor's pure logic (js/theme-editor-logic.js) and the shape of its shipped module folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTokenBlocks } from '../js/theme.js';
import { build } from '../tools/build.mjs';
import { KINDS, DEFAULT_PAIRS, emptyOverrides, allTokenNames, baseValue, isChanged, effectiveValue, visibleTokens, withEdit, withoutToken, overrideCount, evaluatePairs, inlineEntries } from '../js/theme-editor-logic.js';

const tokens = parseTokenBlocks(fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));

test('every default contrast pair names tokens the stylesheet declares', () => {
    const names = new Set(allTokenNames(tokens));
    for (const [fg, bg] of DEFAULT_PAIRS) { assert.ok(names.has(fg), fg); assert.ok(names.has(bg), bg); }
});

test('token listing: sorted, filtered by kind and by name in any case', () => {
    const all = visibleTokens(tokens, 'dark');
    assert.deepEqual(all, [...all].sort());
    assert.equal(all.length, allTokenNames(tokens).length);
    const accent = visibleTokens(tokens, 'dark', { filter: ' ACCENT ' });
    assert.ok(accent.length > 0 && accent.every(n => n.includes('accent')));
    assert.ok(visibleTokens(tokens, 'dark', { kind: 'colour' }).includes('--color-text'));
    assert.ok(!visibleTokens(tokens, 'dark', { kind: 'size' }).includes('--color-text'));
    assert.deepEqual(visibleTokens(tokens, 'dark', { filter: 'no-such-token' }), []);
    assert.ok(KINDS.includes('all'));
});

test('an edit lands in the theme or the shared dictionary, and an empty or base value clears it', () => {
    const base = baseValue(tokens, 'dark', '--color-text');
    let o = withEdit(emptyOverrides(), { theme: 'dark', name: '--color-text', value: '#ffffff', base });
    assert.deepEqual(o.dark, { '--color-text': '#ffffff' });
    assert.ok(isChanged(o, 'dark', '--color-text') && !isChanged(o, 'light', '--color-text'));
    o = withEdit(o, { theme: 'dark', scope: 'both', name: '--color-text', value: '#eeeeee', base });
    assert.deepEqual(o, { shared: { '--color-text': '#eeeeee' }, dark: {}, light: {} });
    assert.equal(effectiveValue(o, tokens, 'light', '--color-text'), '#eeeeee');
    assert.equal(overrideCount(o), 1);
    o = withEdit(o, { theme: 'dark', scope: 'both', name: '--color-text', value: base, base });
    assert.equal(overrideCount(o), 0);
    assert.equal(effectiveValue(o, tokens, 'dark', '--color-text'), base);
});

test('withEdit and withoutToken never change their input', () => {
    const o = { shared: { '--a-b': '1' }, dark: { '--a-b': '2' }, light: {} };
    const frozen = JSON.stringify(o);
    withEdit(o, { theme: 'light', name: '--c-d', value: '3', base: '' });
    const cleared = withoutToken(o, '--a-b');
    assert.equal(JSON.stringify(o), frozen);
    assert.equal(overrideCount(cleared), 0);
});

test('contrast pairs: ratio, grade, and a value that is not a literal colour reads as null, not a failure', () => {
    const read = n => ({ fg: '#000000', bg: '#ffffff', dim: '#cccccc', v: 'var(--x)' })[n];
    const [ok, bad, unknown] = evaluatePairs([['fg', 'bg'], ['dim', 'bg'], ['v', 'bg']], read);
    assert.equal(Math.round(ok.ratio), 21); assert.equal(ok.grade, 'AAA'); assert.equal(ok.bad, false);
    assert.equal(bad.bad, true); assert.equal(bad.grade, 'below AA');
    assert.equal(unknown.ratio, null); assert.equal(unknown.bad, false);
});

test('an element target receives shared overrides under the theme own, and only what the SDK rules accept', () => {
    const o = { shared: { '--color-accent': '#111111', '--radius-md': '4px' }, dark: { '--color-accent': '#222222', 'BAD': 'x' }, light: { '--color-accent': '#333333', '--x-y': 'url(evil)' } };
    assert.deepEqual(inlineEntries(o, 'dark'), { '--color-accent': '#222222', '--radius-md': '4px' });
    assert.deepEqual(inlineEntries(o, 'light'), { '--color-accent': '#333333', '--radius-md': '4px' });
});

test('dist/theme-editor ships its own token stylesheet and the module reads it from its own folder', () => {
    const { out } = build({ write: false });
    assert.equal(out.get('dist/theme-editor/tokens.css'), fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));
    const js = out.get('dist/theme-editor/theme-editor.js');
    assert.match(js, /const TOKENS = '\.\/tokens\.css';/);
    assert.ok(out.has('dist/theme-editor/theme-editor.css'));
    assert.ok(out.has('dist/js/theme-editor-logic.js'));
});
