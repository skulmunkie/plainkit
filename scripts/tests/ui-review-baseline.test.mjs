import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeMajor, formatPart, formatUnits, mergeParts, parsePart, shotHash, shotNameOf } from '../ui-review-baseline.mjs';

test('a hash is the first 16 hex of the sha256 of the bytes', () => {
    assert.equal(shotHash(Buffer.from('abc')), 'ba7816bf8f01cfea');
    assert.equal(shotNameOf('scenario-menu__open__phone__dark.png'), 'scenario-menu__open__phone__dark');
    assert.equal(chromeMajor('Chrome/130.0.6723.58'), '130');
    assert.equal(chromeMajor(undefined), 'unknown');
});

test('a part is sorted, CRLF, with the header first and a final line break', () => {
    const text = formatPart([['b__1__phone__dark', '2222222222222222'], ['a__1__desktop__light', '1111111111111111']], { chrome: '130' });
    assert.equal(text, '# ui-baseline v1 chrome=130\r\na__1__desktop__light\t1111111111111111\r\nb__1__phone__dark\t2222222222222222\r\n');
    assert.deepEqual(parsePart(text), { chrome: '130', entries: [['a__1__desktop__light', '1111111111111111'], ['b__1__phone__dark', '2222222222222222']] });
    assert.ok(formatUnits([['x', 'k']], '130').startsWith('# ui-baseline-units v1 chrome=130\r\n'));
});

test('parts merge sorted and deduplicated', () => {
    const a = formatPart([['b', '2'], ['a', '1']], { chrome: '130' });
    const b = formatPart([['c', '3'], ['a', '1']], { chrome: '130' });
    assert.equal(mergeParts([b, a]), formatPart([['a', '1'], ['b', '2'], ['c', '3']], { chrome: '130' }));
});

test('one name with two hashes, parts from two browsers and malformed text are errors', () => {
    const a = formatPart([['a', '1']], { chrome: '130' });
    assert.throws(() => mergeParts([a, formatPart([['a', '2']], { chrome: '130' })]), /two values/);
    assert.throws(() => mergeParts([a, formatPart([['b', '2']], { chrome: '131' })]), /different browsers/);
    assert.throws(() => parsePart('a\t1\r\n'), /not a ui-baseline/);
    assert.throws(() => parsePart('# ui-baseline v1 chrome=1\r\nnotab\r\n'), /malformed/);
});
