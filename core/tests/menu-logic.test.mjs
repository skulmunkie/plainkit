// Unit tests for the dropdown menu's keyboard decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, typeaheadIndex, checkedAfter, isEnabled, keyAction, typeaheadBuffer } from '../js/menu-logic.js';

test('keyAction maps keys to menu actions, treating Escape in a submenu as closing only the submenu', () => {
    assert.equal(keyAction('ArrowDown'), 'move');
    assert.equal(keyAction('ArrowRight', { hasSubmenu: true }), 'open-sub');
    assert.equal(keyAction('ArrowRight'), null);
    assert.equal(keyAction('ArrowLeft', { inSubmenu: true }), 'close-sub');
    assert.equal(keyAction('Escape'), 'close');
    assert.equal(keyAction('Escape', { inSubmenu: true }), 'close-sub');
    assert.equal(keyAction('Tab'), 'tab-close');
    assert.equal(keyAction('Enter'), 'choose');
    assert.equal(keyAction(' '), 'choose');
    assert.equal(keyAction('a'), 'type');
    assert.equal(keyAction('a', { modified: true }), null);
    assert.equal(keyAction('F5'), null);
});

test('the typeahead buffer grows while typing and restarts after a pause', () => {
    assert.equal(typeaheadBuffer('de', 'l', 100), 'del');
    assert.equal(typeaheadBuffer('de', 'l', 900), 'l');
});

test('arrows wrap, Home and End jump, other keys are ignored', () => {
    assert.equal(nextIndex(0, 3, 'ArrowDown'), 1);
    assert.equal(nextIndex(2, 3, 'ArrowDown'), 0);
    assert.equal(nextIndex(0, 3, 'ArrowUp'), 2);
    assert.equal(nextIndex(-1, 3, 'ArrowDown'), 0);
    assert.equal(nextIndex(-1, 3, 'ArrowUp'), 2);
    assert.equal(nextIndex(1, 3, 'Home'), 0);
    assert.equal(nextIndex(1, 3, 'End'), 2);
    assert.equal(nextIndex(1, 3, 'x'), null);
    assert.equal(nextIndex(0, 0, 'ArrowDown'), null);
});

test('typing a letter jumps to the next item that starts with it, and repeating it cycles', () => {
    const labels = ['Edit', 'Duplicate', 'Delete', 'Export'];
    assert.equal(typeaheadIndex(labels, 0, 'd'), 1);
    assert.equal(typeaheadIndex(labels, 1, 'd'), 2);
    assert.equal(typeaheadIndex(labels, 2, 'd'), 1);
    assert.equal(typeaheadIndex(labels, 0, 'dd'), 1);
});

test('a longer buffer matches a prefix and stays on the current item while it still matches', () => {
    const labels = ['Delete', 'Duplicate', 'Dump'];
    assert.equal(typeaheadIndex(labels, 0, 'du'), 1);
    assert.equal(typeaheadIndex(labels, 1, 'dup'), 1);
    assert.equal(typeaheadIndex(labels, 0, 'zz'), -1);
    assert.equal(typeaheadIndex(labels, 0, ''), -1);
    assert.equal(typeaheadIndex([], 0, 'a'), -1);
});

test('a checkbox flips, a radio becomes checked, a plain item is unchanged', () => {
    assert.equal(checkedAfter('menuitemcheckbox', false), true);
    assert.equal(checkedAfter('menuitemcheckbox', true), false);
    assert.equal(checkedAfter('menuitemradio', false), true);
    assert.equal(checkedAfter('menuitemradio', true), true);
    assert.equal(checkedAfter('menuitem', false), false);
});

test('disabled and hidden items are skipped', () => {
    const item = (attrs, hidden = false) => ({ hidden, hasAttribute: n => n in attrs, getAttribute: n => attrs[n] ?? null });
    assert.equal(isEnabled(item({})), true);
    assert.equal(isEnabled(item({ disabled: '' })), false);
    assert.equal(isEnabled(item({ 'aria-disabled': 'true' })), false);
    assert.equal(isEnabled(item({}, true)), false);
});

