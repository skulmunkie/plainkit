import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare, rows } from '../ui-baseline-compare.mjs';
import { formatPart } from '../ui-review-baseline.mjs';

const part = (entries, chrome = '130') => formatPart(entries, { chrome });
const manifest = part([['a', '1'], ['b', '2'], ['c', '3']]);

test('a shot is same, changed or new by its hash', () => {
    const r = compare(manifest, part([['a', '1'], ['b', '9'], ['d', '4']]));
    assert.deepEqual(r.same, ['a']);
    assert.deepEqual(r.changed, [{ name: 'b', before: '2', after: '9' }]);
    assert.deepEqual(r.new, [{ name: 'd', after: '4' }]);
    assert.deepEqual(r.unstable, []);
    assert.match(rows(r).at(-1), /1 same, 1 changed, 1 new, 0 unstable/);
});

test('names the render does not mention are ignored (a partial run), and shards are merged', () => {
    const r = compare(manifest, [part([['a', '1']]), part([['b', '2']])]);
    assert.deepEqual(r.same, ['a', 'b']);
    assert.deepEqual(r.changed.concat(r.new), []);
});

test('a changed shot that differs again on a re-render is unstable', () => {
    const r = compare(manifest, part([['a', '8'], ['b', '9']]), { rerunText: part([['a', '7'], ['b', '9']]) });
    assert.deepEqual(r.unstable.map(u => u.name), ['a']);
    assert.deepEqual(r.changed.map(u => u.name), ['b']);
});

test('another Chrome major skips the comparison with a message; a header-only manifest matches any browser', () => {
    const r = compare(manifest, part([['a', '1']], '131'));
    assert.match(r.chromeMismatch, /baseline built with another browser/);
    assert.deepEqual(r.same.concat(r.changed, r.new), []);
    assert.deepEqual(compare('# ui-baseline v1 chrome=unknown\r\n', part([['a', '1']])).new, [{ name: 'a', after: '1' }]);
});

test('the committed manifest is CRLF with its header only until the update job fills it', () => {
    const text = fs.readFileSync(new URL('../../core/tests/review/baseline.manifest.txt', import.meta.url), 'utf8');
    assert.ok(text.startsWith('# ui-baseline v1 chrome='));
    assert.ok(!/(^|[^\r])\n/.test(text), 'CRLF only');
});
