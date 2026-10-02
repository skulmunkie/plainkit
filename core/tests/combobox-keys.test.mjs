// Pins the keyboard decisions pk-combobox makes (arrow wrap, Home/End, typeahead from the current row), independent of which module computes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, typeaheadIndex } from '../js/menu-logic.js';

// The call pk-combobox.keys() makes for a typed letter: `cur` is the highlighted (or chosen) row, -1 for none.
const typed = (labels, buffer, cur) => typeaheadIndex(labels, cur, buffer);
const move = (at, n, key) => nextIndex(at, n, key) ?? -1;

test('combobox arrows wrap and start from either end', () => {
    assert.equal(move(-1, 3, 'ArrowDown'), 0);
    assert.equal(move(-1, 3, 'ArrowUp'), 2);
    assert.equal(move(2, 3, 'ArrowDown'), 0);
    assert.equal(move(0, 3, 'ArrowUp'), 2);
    assert.equal(move(1, 3, 'Home'), 0);
    assert.equal(move(1, 3, 'End'), 2);
    assert.equal(move(1, 0, 'Home'), -1);
});

test('combobox typeahead: a letter moves to the next match after the current row, wrapping', () => {
    const labels = ['Apple', 'Avocado', 'Banana', 'Cherry'];
    assert.equal(typed(labels, 'a', -1), 0);
    assert.equal(typed(labels, 'a', 0), 1);
    assert.equal(typed(labels, 'a', 1), 0);
    assert.equal(typed(labels, 'b', 0), 2);
    assert.equal(typed(labels, 'z', 0), -1);
    assert.equal(typed(labels, 'ch', 1), 3);
    assert.equal(typed(labels, 'av', 1), 1);
    assert.equal(typed(labels, 'AV', 0), 1);
    assert.equal(typed([], 'a', -1), -1);
});
