// Presets and saved themes (js/theme-presets-logic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTokenBlocks, buildOverrides } from '../js/theme.js';
import { emptyOverrides, overrideCount, allTokenNames } from '../js/theme-editor-logic.js';
import { paletteRows } from '../js/brand-palette-logic.js';
import { PRESETS, presetById, presetOverrides, cleanName, readSaved, serializeSaved, saveTheme, renameTheme, deleteTheme, MAX_SAVED, MAX_NAME } from '../js/theme-presets-logic.js';

const tokens = parseTokenBlocks(fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));

test('the built-in presets: default, high contrast, compact and roomy, with unique ids', () => {
    assert.deepEqual(PRESETS.map(p => p.id), ['default', 'high-contrast', 'compact', 'roomy']);
    assert.equal(overrideCount(presetById('default').overrides), 0);
    assert.equal(presetById('nope'), null);
    assert.equal(presetOverrides('nope'), null);
});

test('every preset override names a token the stylesheet declares and passes the SDK rules, so the export keeps all of it', () => {
    const names = new Set(allTokenNames(tokens));
    for (const p of PRESETS) {
        assert.deepEqual(buildOverrides(p.overrides).rejected, [], p.id);
        for (const dict of Object.values(p.overrides)) for (const name of Object.keys(dict)) assert.ok(names.has(name), `${p.id}: ${name} is not a token`);
    }
});

test('high contrast: every documented pair is 7:1 or better in both themes', () => {
    for (const r of paletteRows(presetById('high-contrast').overrides, tokens)) assert.ok(r.ratio >= 7, `${r.theme} ${r.fg} on ${r.bg} is ${r.ratio?.toFixed(2)}:1`);
});

test('the density presets change only spacing roles, and roomy is looser than compact', () => {
    for (const id of ['compact', 'roomy']) {
        const o = presetById(id).overrides;
        assert.equal(Object.keys(o.dark).length + Object.keys(o.light).length, 0, id);
        assert.ok(Object.keys(o.shared).every(n => /^--(gap|pad|flow)-/.test(n)), id);
    }
    assert.notDeepEqual(presetById('compact').overrides.shared, presetById('roomy').overrides.shared);
});

test('applying a preset hands out a copy, so editing it never changes the built-in', () => {
    const a = presetOverrides('high-contrast');
    a.dark['--color-text'] = '#123456';
    assert.equal(presetById('high-contrast').overrides.dark['--color-text'], '#ffffff');
    assert.ok(Object.isFrozen(PRESETS) && Object.isFrozen(PRESETS[1]));
});

test('names: trimmed, spaces collapsed, 1 to 40 characters of letters, digits, spaces and a few marks; markup is not a name', () => {
    assert.equal(cleanName('  My   brand (v2) '), 'My brand (v2)');
    assert.equal(cleanName('Ünï café'), 'Ünï café');
    for (const bad of ['', '   ', '<b>x</b>', 'a'.repeat(MAX_NAME + 1), '-lead', 'x;y', 'a\nb\u0000', null, undefined]) assert.equal(cleanName(bad), null, JSON.stringify(bad));
    assert.equal(cleanName('a'.repeat(MAX_NAME)).length, MAX_NAME);
});

test('saving: a new name is added, an existing one (any case) is replaced, a bad one is an error, and the list is not changed in place', () => {
    const o = { shared: {}, dark: { '--color-accent': '#111111' }, light: {} };
    const one = saveTheme([], 'Brand', o);
    assert.equal(one.list.length, 1); assert.equal(one.replaced, false);
    o.dark['--color-accent'] = '#222222';
    assert.equal(one.list[0].overrides.dark['--color-accent'], '#111111', 'a saved theme is a copy');
    const again = saveTheme(one.list, 'brand', o);
    assert.equal(again.list.length, 1); assert.equal(again.replaced, true); assert.equal(again.list[0].name, 'brand');
    assert.equal(again.list[0].overrides.dark['--color-accent'], '#222222');
    assert.equal(one.list[0].name, 'Brand');
    assert.ok(saveTheme(one.list, '<x>', o).error);
    assert.ok(saveTheme(Array.from({ length: MAX_SAVED }, (_, i) => ({ name: `T${i}`, overrides: emptyOverrides() })), 'One more', o).error, 'the list is capped');
});

test('saving keeps only what the SDK rules accept', () => {
    const { list } = saveTheme([], 'X', { shared: { '--a-b': 'url(evil)', '--c-d': '4px' }, dark: { BAD: '1' }, light: null });
    assert.deepEqual(list[0].overrides, { shared: { '--c-d': '4px' }, dark: {}, light: {} });
});

test('rename and delete: a name may not collide, a missing theme is an error, delete leaves the rest', () => {
    const list = ['A', 'B'].reduce((l, n) => saveTheme(l, n, emptyOverrides()).list, []);
    assert.deepEqual(renameTheme(list, 'A', 'C').list.map(t => t.name), ['C', 'B']);
    assert.ok(renameTheme(list, 'A', 'b').error, 'B exists, in any case');
    assert.ok(renameTheme(list, 'Z', 'Q').error);
    assert.ok(renameTheme(list, 'A', '<i>').error);
    assert.equal(renameTheme(list, 'A', 'a').list[0].name, 'a', 'a case change of its own name is fine');
    assert.deepEqual(deleteTheme(list, 'A').map(t => t.name), ['B']);
    assert.equal(list.length, 2);
});

test('reading saved text: round-trips, and bad text, bad names, duplicates and bad tokens are dropped, never thrown', () => {
    const list = saveTheme(saveTheme([], 'One', { shared: { '--c-d': '4px' }, dark: {}, light: {} }).list, 'Two', emptyOverrides()).list;
    assert.deepEqual(readSaved(serializeSaved(list)), list);
    for (const raw of [null, undefined, '', 'not json', '{"a":1}', '42', '[1,2,null]']) assert.deepEqual(readSaved(raw), [], String(raw));
    const mixed = readSaved(JSON.stringify([{ name: 'Ok', overrides: { dark: { '--a-b': '1', '--x-y': 'url(evil)' } } }, { name: '<b>', overrides: {} }, { name: 'ok', overrides: {} }, { overrides: {} }]));
    assert.deepEqual(mixed, [{ name: 'Ok', overrides: { shared: {}, dark: { '--a-b': '1' }, light: {} } }]);
    assert.equal(readSaved(JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ name: `T${i}`, overrides: {} })))).length, MAX_SAVED);
});
