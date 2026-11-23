import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../modules/code-explorer/history.js';

test('back and forward walk the stack', () => {
    const h = createHistory();
    assert.equal(h.canBack, false);
    h.push({ path: 'a', line: 1 }); h.push({ path: 'b' }); h.push({ path: 'c', line: 9 });
    assert.deepEqual(h.back(), { path: 'b', line: null });
    assert.deepEqual(h.back(), { path: 'a', line: 1 });
    assert.equal(h.back(), null);
    assert.equal(h.canForward, true);
    assert.deepEqual(h.forward(), { path: 'b', line: null });
});

test('identical consecutive pushes are dropped; a new push truncates forward', () => {
    const h = createHistory();
    h.push({ path: 'a' }); h.push({ path: 'a' }); h.push({ path: 'b' });
    assert.equal(h.size, 2);
    h.back(); h.push({ path: 'c' });
    assert.equal(h.canForward, false);
    assert.deepEqual(h.back(), { path: 'a', line: null });
});

test('cap drops the oldest; replace updates the current line', () => {
    const h = createHistory(3);
    for (const p of 'abcd') h.push({ path: p });
    assert.equal(h.size, 3);
    h.replace({ path: 'd', line: 7 });
    assert.deepEqual(h.current, { path: 'd', line: 7 });
    h.replace({ path: 'zzz', line: 1 });
    assert.equal(h.current.path, 'd');
    h.back(); h.back();
    assert.equal(h.current.path, 'b');
    assert.equal(h.back(), null);
});
