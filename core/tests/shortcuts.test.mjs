// Unit tests for the command-verb shortcut registry. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { comboKey, DEFAULT_SHORTCUTS, isShortcut } from '../js/shortcuts.js';

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
