import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions, nextIndex, typeaheadIndex } from './combobox.js';

test('filterOptions is a case-insensitive contains and an empty query matches everything', () => {
    assert.deepEqual(filterOptions(['Alpha', 'Beta', 'Ruby'], 'A'), [true, true, false]);
    assert.deepEqual(filterOptions(['a', 'b'], '  '), [true, true]);
    assert.deepEqual(filterOptions(['a'], 'zz'), [false]);
});
test('nextIndex wraps, jumps to the ends and starts from either end when nothing is highlighted', () => {
    assert.equal(nextIndex(-1, 3, 'ArrowDown'), 0);
    assert.equal(nextIndex(-1, 3, 'ArrowUp'), 2);
    assert.equal(nextIndex(2, 3, 'ArrowDown'), 0);
    assert.equal(nextIndex(0, 3, 'ArrowUp'), 2);
    assert.equal(nextIndex(1, 3, 'End'), 2);
    assert.equal(nextIndex(1, 0, 'Home'), -1);
});
test('typeaheadIndex finds the next label starting with the typed letters, wrapping around', () => {
    const labels = ['Apple', 'Avocado', 'Banana'];
    assert.equal(typeaheadIndex(labels, 'a', -1), 0);
    assert.equal(typeaheadIndex(labels, 'a', 0), 1);
    assert.equal(typeaheadIndex(labels, 'a', 1), 0);
    assert.equal(typeaheadIndex(labels, 'b', 0), 2);
    assert.equal(typeaheadIndex(labels, 'z', 0), -1);
    assert.equal(typeaheadIndex(labels, 'su', -2), -1);
});
