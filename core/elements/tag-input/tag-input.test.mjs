import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, addTags } from './tag-input.js';

test('parseTags splits on separators and newlines, trims and drops empties; special characters in separators are safe', () => {
    assert.deepEqual(parseTags(' a, b ,,c\nd'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(parseTags('a;b|c', ';|'), ['a', 'b', 'c']);
    assert.deepEqual(parseTags('a]b^c-d', ']^-'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(parseTags(''), []);
});
test('addTags ignores case-insensitive duplicates, honours the limit, and explains each refusal', () => {
    const r = addTags(['red'], ['Red', 'green', 'blue'], { max: 2 });
    assert.deepEqual(r.tags, ['red', 'green']);
    assert.deepEqual(r.refused, [{ tag: 'Red', why: 'duplicate' }, { tag: 'blue', why: 'limit' }]);
    assert.deepEqual(addTags(['a'], ['A'], { unique: false }).tags, ['a', 'A']);
});
