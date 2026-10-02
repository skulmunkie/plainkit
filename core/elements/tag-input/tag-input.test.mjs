import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, addTags, joinValues, splitValues } from './tag-input.js';

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

test('tag lists round trip through the comma-joined value, commas inside a tag included', () => {
    assert.deepEqual(splitValues(joinValues(['a,b', 'c'])), ['a,b', 'c']);
    assert.equal(joinValues(['red', 'green']), 'red,green');
});

const fake = (mixin, init) => {
    class B { constructor() { this.$ = { value: '', values: [], multiple: false, ...init }; } }
    for (const n of ['value', 'values', 'multiple']) Object.defineProperty(B.prototype, n, { get() { return this.$[n]; }, set(v) { if (v === this.$[n]) return; this.$[n] = v; this.changed?.(n, v); } });
    return new (mixin(B))();
};
test('values is the tag array: set, get, empty, commas and backslashes, and value stays the joined string', async () => {
    const mixin = (await import('./tag-input.js')).default;
    const el = fake(mixin);
    assert.deepEqual(el.values, []);
    el.values = ['a,b', 'c\\d', 'plain', '\\'];
    assert.equal(el.value, 'a\\,b,c\\d,plain,\\\\');
    assert.deepEqual(el.values, ['a,b', 'c\\d', 'plain', '\\']);
    assert.deepEqual(el.tags, el.values);
    el.value = 'p\\,q,r';
    assert.deepEqual(el.values, ['p,q', 'r']);
    el.values = ['x,y'];
    assert.equal(el.value, 'x\\,y');
    el.values = [];
    assert.equal(el.value, '');
});
