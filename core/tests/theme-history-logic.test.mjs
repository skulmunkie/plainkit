// Undo/redo and the change list (js/theme-history-logic.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTokenBlocks } from '../js/theme.js';
import { emptyOverrides, withEdit, withoutToken, overrideCount, baseValue } from '../js/theme-editor-logic.js';
import { createHistory, record, undo, redo, canUndo, canRedo, tokenGroup, diffOverrides, changedTokens, changeSummary, withoutGroup, withoutEntry, MAX_STEPS, COALESCE_MS } from '../js/theme-history-logic.js';

const tokens = parseTokenBlocks(fs.readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'));
const edit = (o, name, value, theme = 'dark') => withEdit(o, { theme, name, value, base: baseValue(tokens, theme, name) });

test('undo and redo walk the steps, and a new edit after an undo drops the redo branch', () => {
    let h = createHistory(emptyOverrides());
    assert.ok(!canUndo(h) && !canRedo(h));
    h = record(h, edit(h.present, '--color-accent', '#111111'));
    h = record(h, edit(h.present, '--color-text', '#222222'));
    assert.equal(h.past.length, 2);
    h = undo(h); assert.deepEqual(Object.keys(h.present.dark), ['--color-accent']); assert.ok(canRedo(h));
    h = undo(h); assert.equal(overrideCount(h.present), 0); assert.ok(!canUndo(h));
    assert.equal(undo(h), h, 'nothing to undo is the same history');
    h = redo(h); h = redo(h); assert.equal(overrideCount(h.present), 2);
    assert.equal(redo(h), h);
    h = undo(h);
    h = record(h, edit(h.present, '--space-4', '2rem'));
    assert.ok(!canRedo(h), 'a new edit ends the redo branch');
});

test('recording the same overrides again is not a step', () => {
    const h = createHistory(emptyOverrides());
    assert.equal(record(h, emptyOverrides()), h);
});

test('typing in one field is one step: edits of one key inside the window merge, another key or a later time starts a new step', () => {
    let h = createHistory(emptyOverrides());
    for (const [i, v] of ['#1', '#12', '#123', '#1234'].entries()) h = record(h, edit(h.present, '--color-accent', `${v}${'0'.repeat(6 - v.length + 1)}`), { key: '--color-accent', at: 1000 + i * 50 });
    assert.equal(h.past.length, 1, 'four keystrokes, one step');
    assert.equal(undo(h).present.dark['--color-accent'], undefined);
    h = record(h, edit(h.present, '--color-text', '#abcdef'), { key: '--color-text', at: 1300 });
    assert.equal(h.past.length, 2, 'another token is a new step');
    h = record(h, edit(h.present, '--color-text', '#abcdee'), { key: '--color-text', at: 1300 + COALESCE_MS + 1 });
    assert.equal(h.past.length, 3, 'after the window it is a new step');
});

test('the history is capped, and it never changes the overrides it was given', () => {
    let h = createHistory(emptyOverrides());
    const first = h.present;
    for (let i = 0; i < MAX_STEPS + 20; i++) h = record(h, edit(h.present, '--space-4', `${i + 1}px`));
    assert.equal(h.past.length, MAX_STEPS);
    assert.equal(overrideCount(first), 0);
});

test('a token has a group: the word after the dashes', () => {
    assert.equal(tokenGroup('--color-accent'), 'color'); assert.equal(tokenGroup('--pad-card'), 'pad'); assert.equal(tokenGroup('--x'), 'x');
});

test('the change list: every edit against the stylesheet value, sorted by group, with the scope', () => {
    let o = edit(emptyOverrides(), '--color-accent', '#111111');
    o = edit(o, '--color-accent', '#222222', 'light');
    o = withEdit(o, { theme: 'dark', scope: 'both', name: '--pad-card', value: '1px', base: baseValue(tokens, 'dark', '--pad-card') });
    const d = diffOverrides(o, tokens);
    assert.deepEqual(d.map(x => `${x.group}:${x.name}:${x.scope}`), ['color:--color-accent:dark', 'color:--color-accent:light', 'pad:--pad-card:shared']);
    assert.equal(d[0].from, baseValue(tokens, 'dark', '--color-accent')); assert.equal(d[0].to, '#111111');
    assert.equal(d[1].from, baseValue(tokens, 'light', '--color-accent'));
    assert.equal(changedTokens(o), 2, 'a token edited in both themes counts once');
    assert.equal(changeSummary(o), '2 changes'); assert.equal(changeSummary(edit(emptyOverrides(), '--color-text', '#000000')), '1 change'); assert.equal(changeSummary(emptyOverrides()), 'No changes');
});

test('reset per token and per group clear everywhere and leave the rest', () => {
    let o = edit(emptyOverrides(), '--color-accent', '#111111');
    o = edit(o, '--color-text', '#222222', 'light');
    o = edit(o, '--space-4', '2rem');
    assert.equal(overrideCount(withoutToken(o, '--color-accent')), 2);
    const g = withoutGroup(o, 'color');
    assert.deepEqual(g, { shared: {}, dark: { '--space-4': '2rem' }, light: {} });
    assert.equal(overrideCount(o), 3, 'the input is unchanged');
    assert.deepEqual(withoutGroup(o, 'nothing'), o);
    const both = edit(edit(emptyOverrides(), '--color-accent', '#111111'), '--color-accent', '#222222', 'light');
    assert.deepEqual(withoutEntry(both, 'dark', '--color-accent'), { shared: {}, dark: {}, light: { '--color-accent': '#222222' } }, 'one scope only');
    assert.equal(overrideCount(both), 2);
});
