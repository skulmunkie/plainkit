// Tests for the code block logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLines, dedent, gutterWidth, copyText } from './code-block.js';

test('splitLines trims blank ends, keeps interior blanks and normalises line endings', () => {
    assert.deepEqual(splitLines('\n\na\r\n\r\nb\n\n'), ['a', '', 'b']);
    assert.deepEqual(splitLines(''), []);
    assert.deepEqual(splitLines(null), []);
});

test('dedent removes the shared indent only', () => {
    assert.equal(dedent('\n    <div>\n      <p>x</p>\n    </div>\n  '), '<div>\n  <p>x</p>\n</div>');
    assert.equal(dedent('a\n  b'), 'a\n  b');
});

test('gutterWidth grows with the digit count', () => {
    assert.equal(gutterWidth(0), 1);
    assert.equal(gutterWidth(9), 1);
    assert.equal(gutterWidth(10), 2);
    assert.equal(gutterWidth(1200), 4);
});

test('copyText writes through the clipboard and reports failure without throwing', async () => {
    let written = null;
    assert.equal(await copyText('hi', { writeText: async t => { written = t; } }), true);
    assert.equal(written, 'hi');
    assert.equal(await copyText('hi', { writeText: async () => { throw new Error('denied'); } }), false);
    assert.equal(await copyText('hi', undefined), false);
});
