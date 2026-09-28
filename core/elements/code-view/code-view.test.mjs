// Tests for the code view logic. Run: node --test "core/elements/*/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLines, sourceLines, lineSegments } from './code-view.js';

test('parseLines reads numbers and ranges and ignores the rest', () => {
    assert.deepEqual([...parseLines('3, 5-7')], [3, 5, 6, 7]);
    assert.deepEqual([...parseLines('x, , 2-')], []);
    assert.deepEqual([...parseLines(undefined)], []);
});

test('sourceLines prefers the lines array, else trims the text', () => {
    assert.deepEqual(sourceLines(['a', 2], 'ignored'), ['a', '2']);
    assert.deepEqual(sourceLines([], '\n\na\r\n\r\nb\n\n'), ['a', '', 'b']);
    assert.deepEqual(sourceLines(undefined, ''), []);
});

test('lineSegments keeps supplied segments and falls back to one plain segment', () => {
    assert.deepEqual(lineSegments('ab', undefined), [{ text: 'ab', kind: 'plain', match: false, word: false }]);
    assert.deepEqual(lineSegments('', []), []);
    assert.deepEqual(lineSegments('x', [{ text: 'x', kind: 'Bad kind', match: 1 }]), [{ text: 'x', kind: 'plain', match: true, word: false }]);
});
