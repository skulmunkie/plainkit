// Tests for the avatar logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { initials, colourSlot, groupOverflow } from './avatar.js';

test('initials takes the first letter of the first and last word, or the start of a single word', () => {
    assert.equal(initials('Ada Lovelace'), 'AL');
    assert.equal(initials('ana maria ruiz'), 'AR');
    assert.equal(initials('Cher'), 'CH');
    assert.equal(initials('Cher', 1), 'C');
    assert.equal(initials('  '), '?');
    assert.equal(initials(null), '?');
});

test('colourSlot is stable per name and stays in range', () => {
    assert.equal(colourSlot('Ada'), colourSlot('Ada'));
    for (const n of ['a', 'Sam Lee', '', 'Ana Ruiz', 'x'.repeat(200)]) { const s = colourSlot(n); assert.ok(s >= 1 && s <= 5); }
    assert.ok(colourSlot('Ada', 3) <= 3);
});

test('groupOverflow splits visible people from the +N', () => {
    assert.deepEqual(groupOverflow([1, 2, 3, 4, 5, 6], 4), { shown: [1, 2, 3, 4], more: 2 });
    assert.deepEqual(groupOverflow([1, 2], 4), { shown: [1, 2], more: 0 });
});
