// Pure logic behind the tool dock: the hotkey matcher and the named sizes. mountToolDock itself builds real DOM (h(doc, ...)) and is
// exercised as mountDevTools in the browser test suite (core/tests/browser/) and by loading /devtools locally; there is no DOM
// available to node:test here, matching how the other mount* modules in core/modules/ are covered (see core/tests/devtools-logic.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesHotkey, SIZES } from './tool-dock.js';

test('the dock hotkey matches a chord exactly: the key and only the modifiers named', () => {
    assert.ok(matchesHotkey({ key: '`', ctrlKey: true }, 'Ctrl+`'));
    assert.ok(matchesHotkey({ key: '`', metaKey: true }, 'Ctrl+`'), 'Cmd counts as Ctrl');
    assert.ok(matchesHotkey({ key: 'D', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+D'));
    assert.ok(!matchesHotkey({ key: '`' }, 'Ctrl+`'), 'the modifier is required');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true, shiftKey: true }, 'Ctrl+`'), 'an extra modifier is not a match');
    assert.ok(!matchesHotkey({ key: '`', ctrlKey: true }, ''), 'an empty chord turns the hotkey off');
});

test('an empty chord never matches, whatever the event', () => {
    assert.ok(!matchesHotkey({ key: 'a' }, ''));
    assert.ok(!matchesHotkey({ key: 'a' }, null));
    assert.ok(!matchesHotkey({ key: 'a' }, undefined));
});

test('the three named sizes are small, medium and large, in that order', () => {
    assert.deepEqual(Object.keys(SIZES), ['small', 'medium', 'large']);
    assert.deepEqual(SIZES, { small: '25vh', medium: '40vh', large: '65vh' });
});

test('mountToolDock requires label and launcherLabel (no silent default, per AGENTS.md "no silent failure")', async () => {
    const { mountToolDock } = await import('./tool-dock.js');
    await assert.rejects(() => mountToolDock(null, { panels: [] }), TypeError);
    await assert.rejects(() => mountToolDock(null, { panels: [], label: 'Tools' }), TypeError);
});
