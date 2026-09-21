// The theme editor's pure logic (js/theme-editor-logic.js) and the shape of its shipped module folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTokenBlocks, buildOverrides } from '../js/theme.js';
import { build } from '../tools/build.mjs';
import { KINDS, DEFAULT_PAIRS, emptyOverrides, allTokenNames, baseValue, isChanged, effectiveValue, visibleTokens, isLengthToken, LENGTH_UNITS, withEdit, withoutToken, overrideCount, evaluatePairs, inlineEntries, readImport } from '../js/theme-editor-logic.js';

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

test('lengths are edited as a number and a unit: plain px, rem, em and % values of size tokens, and nothing else', () => {
    assert.equal(LENGTH_UNITS, 'px rem em %');
    for (const [name, value] of [['--space-4', '1rem'], ['--radius-sm', '4px'], ['--radius-round', '50%'], ['--touch-target', '44px'], ['--space-2', '.5em']]) assert.ok(isLengthToken(name, value), `${name}: ${value}`);
    for (const [name, value] of [['--text-sm', 'var(--text-meta)'], ['--space-4', 'calc(1rem + 2px)'], ['--space-4', '3'], ['--space-4', '2vh'], ['--color-accent', '#ff0000'], ['--z-modal', '400'], ['--font-sans', 'system-ui'], ['--shadow-1', '0 1px 2px rgba(0, 0, 0, 0.3)']]) assert.ok(!isLengthToken(name, value), `${name}: ${value}`);
    // every length the stylesheet declares as a size token is either a plain length the unit field can show, or something the text field keeps
    const sizes = allTokenNames(tokens).filter(n => visibleTokens(tokens, 'dark', { kind: 'size' }).includes(n));
    assert.ok(sizes.some(n => isLengthToken(n, baseValue(tokens, 'dark', n))) && sizes.some(n => !isLengthToken(n, baseValue(tokens, 'dark', n))));
});

test('a length edit round-trips through withEdit: a changed value is exported, the stylesheet value or a cleared field is not', () => {
    const base = baseValue(tokens, 'dark', '--space-4');
    let o = withEdit(emptyOverrides(), { theme: 'dark', name: '--space-4', value: '1.5rem', base });
    assert.deepEqual(o.dark, { '--space-4': '1.5rem' });
    assert.match(buildOverrides(o).css, /--space-4:\s*1\.5rem/);
    assert.equal(buildOverrides(withEdit(o, { theme: 'dark', name: '--space-4', value: base, base })).css.includes('--space-4'), false, 'the stylesheet value leaves no override');
    assert.equal(overrideCount(withEdit(o, { theme: 'dark', name: '--space-4', value: '', base })), 0, 'an emptied number clears it');
    assert.equal(isLengthToken('--space-4', effectiveValue(o, tokens, 'dark', '--space-4')), true, 'the edited value is still a length');
    const imported = readImport(JSON.stringify({ dark: { '--space-4': '18px' } }));
    assert.equal(effectiveValue(imported.overrides, tokens, 'dark', '--space-4'), '18px');
    assert.ok(isLengthToken('--space-4', '18px'));
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

test('importing text that is neither JSON nor CSS is an error, so the caller keeps the overrides', () => {
    for (const text of ['hello world', 'not { json', '{ broken', '[1,2]', '   ', '{"foo":1}', 'p { color: red; }', ':root { }', '{"shared":{"BAD":"x","--a-b":"url(evil)"}}'])
        assert.ok(readImport(text).error, `${JSON.stringify(text)} is refused`);
    assert.equal(readImport('hello').overrides, undefined);
});

test('importing JSON or an override CSS block returns the sanitised overrides', () => {
    const json = readImport('{"shared":{"--radius-md":"4px"},"dark":{"--color-accent":"#111111"},"light":{}}');
    assert.deepEqual(json.overrides, { shared: { '--radius-md': '4px' }, dark: { '--color-accent': '#111111' }, light: {} });
    const css = readImport(':root, [data-theme="dark"] { --color-accent: #222222; }\n[data-theme="light"] { --color-accent: #333333; }');
    assert.deepEqual(css.overrides, { shared: {}, dark: { '--color-accent': '#222222' }, light: { '--color-accent': '#333333' } });
});

test('an explicit empty JSON section list is the way to clear the overrides', () => {
    assert.deepEqual(readImport('{"shared":{},"dark":{},"light":{}}').overrides, emptyOverrides());
});

test('the theme editor module reports a refused import through the alert and the logger at warn, and only then replaces the overrides', () => {
    const src = fs.readFileSync(new URL('../modules/theme-editor/theme-editor.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function importText'), src.indexOf('// ---- events'));
    assert.match(body, /readImport\(text\)/);
    assert.ok(body.indexOf('log.warn') < body.indexOf('state.overrides ='), 'the refusal returns before the overrides are replaced');
    assert.match(body, /note\('error', read\.error\); return;/);
});

test('dist/theme-editor ships its own token stylesheet and the module reads it from its own folder', () => {
    const { out } = build({ write: false });
    assert.equal(out.get('dist/theme-editor/tokens.css'), fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));
    const js = out.get('dist/theme-editor/theme-editor.js');
    assert.match(js, /const TOKENS = '\.\/tokens\.css';/);
    assert.ok(out.has('dist/theme-editor/theme-editor.css'));
    assert.ok(out.has('dist/js/theme-editor-logic.js'));
});

// Text-on-surface pairs the toolkit promises at WCAG AA (4.5:1) in both themes: the editor's default pairs plus the link and the body and
// muted text on the other page surfaces. A new documented pair belongs here; a token change that drops one below 4.5 fails this test (issue 58).
const AA_PAIRS = [...DEFAULT_PAIRS, ['--color-link', '--color-bg'], ['--color-text', '--color-flyout'], ['--color-text', '--color-surface'], ['--color-text', '--color-surface-alt'],
    // Text on a fill (issue 69): white on the primary button, badge and selected fills, and on their hover fill.
    ['--btn-primary-fg', '--color-accent-fill'], ['--btn-primary-fg', '--color-accent-fill-hover'],
    // The warn button (issue 92): its hover fill darkens, like the accent fill's, so white text keeps 4.5:1 in every state; the small (mini) button too.
    ['--btn-warn-fg', '--btn-warn-bg'], ['--btn-warn-fg', '--btn-warn-hover-bg'], ['--btn-mini-fg', '--btn-mini-btn-warn-bg'], ['--btn-mini-fg', '--btn-mini-btn-warn-hover-bg']];

for (const theme of ['dark', 'light']) {
    test(`contrast: every documented text pair meets 4.5:1 in the ${theme} theme`, () => {
        const rows = evaluatePairs(AA_PAIRS, name => baseValue(tokens, theme, name));
        for (const r of rows) {
            assert.notEqual(r.ratio, null, `${r.fg} on ${r.bg}: not a literal colour`);
            assert.ok(r.ratio >= 4.5, `${theme}: ${r.fg} on ${r.bg} is ${r.ratio.toFixed(2)}:1`);
        }
    });
}
