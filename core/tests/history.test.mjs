// The generic undo/redo stack (js/history.js), independent of any consumer's value shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, record, undo, redo, canUndo, canRedo, MAX_STEPS, COALESCE_MS } from '../js/history.js';

test('undo and redo walk the steps, and a new edit after an undo drops the redo branch', () => {
    let h = createHistory('a');
    assert.ok(!canUndo(h) && !canRedo(h));
    h = record(h, 'b');
    h = record(h, 'c');
    assert.equal(h.past.length, 2);
    h = undo(h); assert.equal(h.present, 'b'); assert.ok(canRedo(h));
    h = undo(h); assert.equal(h.present, 'a'); assert.ok(!canUndo(h));
    assert.equal(undo(h), h, 'nothing to undo is the same history');
    h = redo(h); h = redo(h); assert.equal(h.present, 'c');
    assert.equal(redo(h), h);
    h = undo(h);
    h = record(h, 'd');
    assert.ok(!canRedo(h), 'a new edit ends the redo branch');
});

test('recording the same value again is not a step', () => {
    const h = createHistory({ x: 1 });
    assert.equal(record(h, { x: 1 }), h);
});

test('repeated edits sharing one key inside the window merge; another key or a later time starts a new step', () => {
    let h = createHistory('');
    for (const [i, v] of ['a', 'ab', 'abc', 'abcd'].entries()) h = record(h, v, { key: 'title', at: 1000 + i * 50 });
    assert.equal(h.past.length, 1, 'four keystrokes, one step');
    assert.equal(undo(h).present, '');
    h = record(h, 'x', { key: 'body', at: 1300 });
    assert.equal(h.past.length, 2, 'another key is a new step');
    h = record(h, 'xy', { key: 'body', at: 1300 + COALESCE_MS + 1 });
    assert.equal(h.past.length, 3, 'after the window it is a new step');
});

test('the history is capped, and it never mutates the value it was given', () => {
    let h = createHistory(0);
    const first = h;
    for (let i = 0; i < MAX_STEPS + 20; i++) h = record(h, i + 1);
    assert.equal(h.past.length, MAX_STEPS);
    assert.equal(first.present, 0);
});
