import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, distribute } from './otp-input.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('sanitize keeps only the alphabet', () => {
    assert.equal(sanitize('12 a-34'), '1234');
    assert.equal(sanitize('a1-b2', 'alnum'), 'a1b2');
    assert.equal(sanitize('a b', 'any'), 'ab');
    assert.equal(sanitize(null), '');
});
test('distribute takes the characters that fit from the start cell', () => {
    assert.deepEqual(distribute('123456', 4), ['1', '2', '3', '4']);
    assert.deepEqual(distribute('123456', 6, 4), ['1', '2']);
    assert.deepEqual(distribute('12', 6, 6), []);
});
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./otp-input.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: six cells overflowed a 320px window by about 6px; the cells now shrink and the group never outgrows its container.
test('the group can shrink to its container: the host is capped and the cells may shrink below their width', () => {
    const css = read('css');
    assert.match(css, /:host \{[^}]*max-inline-size: 100%/);
    assert.match(css, /\.grp \{[^}]*max-inline-size: 100%/);
    assert.match(css, /\.cell \{[^}]*inline-size: 2\.75rem; min-inline-size: 0; flex: 0 1 auto/);
    assert.match(css, /\.sep \{ flex: none/);
    assert.ok(!/\.grp \{[^}]*flex-wrap: wrap/.test(css));
});
