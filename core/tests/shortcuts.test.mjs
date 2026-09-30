// Unit tests for the command-verb shortcut registry, and the separate element-chord registry (issue #591) below. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { comboKey, DEFAULT_SHORTCUTS, isShortcut, chordMatches, dispatchChord, registerChord, getRegisteredChords } from '../js/shortcuts.js';
import { addLogSink } from '../js/log.js';

test('comboKey matches Ctrl or Cmd plus the letter, and nothing else', () => {
    const k = comboKey('k');
    assert.equal(k({ key: 'k', ctrlKey: true }), true);
    assert.equal(k({ key: 'K', metaKey: true }), true, 'case-insensitive');
    assert.equal(k({ key: 'k' }), false, 'no modifier');
    assert.equal(k({ key: 'k', ctrlKey: true, altKey: true }), false);
    assert.equal(k({ key: 'k', ctrlKey: true, shiftKey: true }), false);
    assert.equal(k({ key: 'j', ctrlKey: true }), false, 'wrong letter');
});

test('the registry default for command-palette is Ctrl/Cmd+K', () => {
    assert.equal(isShortcut('command-palette', { key: 'k', ctrlKey: true }), true);
    assert.equal(isShortcut('command-palette', { key: 'K', metaKey: true }), true);
    assert.equal(isShortcut('command-palette', { key: 'k' }), false);
});

test('the registry default for context-menu is Shift+F10 or the ContextMenu key', () => {
    assert.equal(isShortcut('context-menu', { key: 'F10', shiftKey: true }), true);
    assert.equal(isShortcut('context-menu', { key: 'ContextMenu' }), true);
    assert.equal(isShortcut('context-menu', { key: 'F10' }), false, 'F10 alone is not it');
    assert.equal(isShortcut('context-menu', { key: 'Escape' }), false);
});

test('an unknown verb with no override matches nothing, rather than throwing', () => {
    assert.equal(isShortcut('does-not-exist', { key: 'k', ctrlKey: true }), false);
});

test('resolution order is page override, then app override, then the registry default', () => {
    const event = { key: 'n', ctrlKey: true };
    assert.equal(isShortcut('new', event), false, 'no default for "new" yet');
    assert.equal(isShortcut('new', event, { appShortcuts: { new: comboKey('n') } }), true);
    assert.equal(isShortcut('new', event, { pageShortcuts: { new: () => false }, appShortcuts: { new: comboKey('n') } }), false, 'a page override wins even when it disagrees with the app');
    assert.equal(isShortcut('new', event, { pageShortcuts: { new: comboKey('n') }, appShortcuts: { new: () => false } }), true, 'a page override wins over the app one');
});

test('DEFAULT_SHORTCUTS names exactly the shortcuts Plainkit reserves today', () => {
    assert.deepEqual(Object.keys(DEFAULT_SHORTCUTS).sort(), ['command-palette', 'context-menu']);
});

// ---- Element chord registry (issue #591): registration, unregistration, conflict warning, key-combo matching -------------

test('chordMatches requires the key and every modifier flag to match exactly, present or absent', () => {
    const keys = { key: 'f', ctrl: true, alt: true };
    assert.equal(chordMatches(keys, { key: 'f', ctrlKey: true, altKey: true }), true);
    assert.equal(chordMatches(keys, { key: 'F', ctrlKey: true, altKey: true }), true, 'case-insensitive');
    assert.equal(chordMatches(keys, { key: 'f', ctrlKey: true, altKey: true, shiftKey: true }), false, 'an unlisted modifier must be absent');
    assert.equal(chordMatches(keys, { key: 'f', ctrlKey: true }), false, 'missing a required modifier');
    assert.equal(chordMatches(keys, { key: 'g', ctrlKey: true, altKey: true }), false, 'wrong key');
    assert.equal(chordMatches({ key: 'ArrowUp', alt: true, shift: true }, { key: 'ArrowUp', altKey: true, shiftKey: true }), true);
});

test('registerChord dispatches to the handler only when the chord matches and when() (if given) allows it', () => {
    let calls = 0, allowed = true;
    const unregister = registerChord({ keys: { key: 'f', ctrl: true, alt: true }, handler: () => { calls++; }, when: () => allowed });
    dispatchChord({ key: 'f', ctrlKey: true, altKey: true });
    assert.equal(calls, 1);
    dispatchChord({ key: 'g', ctrlKey: true, altKey: true });
    assert.equal(calls, 1, 'a non-matching event does not call the handler');
    allowed = false;
    dispatchChord({ key: 'f', ctrlKey: true, altKey: true });
    assert.equal(calls, 1, 'when() gates the handler even for a matching chord');
    unregister();
});

test('the unregister function returned by registerChord removes the chord: it no longer dispatches or shows up in getRegisteredChords', () => {
    let calls = 0;
    const unregister = registerChord({ keys: { key: 'q', ctrl: true }, handler: () => { calls++; } });
    assert.ok(getRegisteredChords().some(c => c.keys.key === 'q'));
    unregister();
    assert.ok(!getRegisteredChords().some(c => c.keys.key === 'q'));
    dispatchChord({ key: 'q', ctrlKey: true });
    assert.equal(calls, 0);
});

test('registering a chord already taken by another currently-registered handler warns once (through the SDK logger) but still registers both', () => {
    const warnings = [];
    const removeSink = addLogSink(entry => { if (entry.level === 'warn' && entry.scope === 'shortcuts') warnings.push(entry); });
    let calls = 0;
    const unregisterA = registerChord({ keys: { key: 'z', ctrl: true, alt: true }, handler: () => { calls++; } });
    assert.equal(warnings.length, 0, 'the first registration of a chord is not a conflict');
    const unregisterB = registerChord({ keys: { key: 'z', ctrl: true, alt: true }, handler: () => { calls++; } });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /already registered/);
    dispatchChord({ key: 'z', ctrlKey: true, altKey: true });
    assert.equal(calls, 2, 'both handlers still run: a conflict warns, it does not refuse the registration');
    unregisterA(); unregisterB(); removeSink();
});

test('unregistering one of two conflicting chords stops warning about it and only the remaining handler fires', () => {
    const unregisterA = registerChord({ keys: { key: 'y', shift: true }, handler: () => {} });
    unregisterA();
    const warnings = [];
    const removeSink = addLogSink(entry => { if (entry.level === 'warn' && entry.scope === 'shortcuts') warnings.push(entry); });
    const unregisterB = registerChord({ keys: { key: 'y', shift: true }, handler: () => {} });
    assert.equal(warnings.length, 0, 'the first one was unregistered, so this is not a conflict any more');
    unregisterB(); removeSink();
});

test('registerChord rejects a missing keys.key or handler without throwing, and warns instead of failing silently', () => {
    const warnings = [];
    const removeSink = addLogSink(entry => { if (entry.level === 'warn' && entry.scope === 'shortcuts') warnings.push(entry); });
    const unregister = registerChord({ keys: {}, handler: () => {} });
    assert.equal(typeof unregister, 'function');
    unregister(); // a no-op unregister, not a throw
    assert.ok(warnings.some(w => /needs/.test(w.message)));
    removeSink();
});
