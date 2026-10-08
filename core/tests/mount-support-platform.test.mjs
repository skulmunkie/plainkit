// The platform access the tool modules share (js/mount-support.js): timers that return their cancel, saved state, and the page address (#682 S7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { later, every, storedText, storeText, addressOf } from '../js/mount-support.js';

const fakeWin = () => {
    const timers = new Map(); let next = 1; const store = new Map();
    return {
        timers, store,
        setTimeout(fn, ms) { timers.set(next, { fn, ms, repeat: false }); return next++; },
        setInterval(fn, ms) { timers.set(next, { fn, ms, repeat: true }); return next++; },
        clearTimeout(id) { timers.delete(id); }, clearInterval(id) { timers.delete(id); },
        localStorage: { getItem: k => store.get(k) ?? null, setItem(k, v) { store.set(k, String(v)); } },
        location: { href: 'https://x.test/p?q=1#a=2', hash: '#a=2' },
    };
};

test('later runs once and returns a cancel that stops it, and is safe after it ran', () => {
    const win = fakeWin(); let n = 0;
    const cancel = later(win, () => { n++; }, 100);
    assert.equal([...win.timers.values()][0].ms, 100);
    cancel(); assert.equal(win.timers.size, 0);
    const again = later(win, () => { n++; }, 5);
    const [[id, t]] = [...win.timers]; t.fn(); win.timers.delete(id);
    assert.equal(n, 1); again();
});

test('every repeats and returns the stop', () => {
    const win = fakeWin();
    const stop = every(win, () => {}, 250);
    const [t] = [...win.timers.values()];
    assert.deepEqual([t.ms, t.repeat], [250, true]);
    stop(); assert.equal(win.timers.size, 0);
});

test('saved state reads and writes through localStorage: a blocked read throws, a blocked write returns its error instead of throwing', () => {
    const win = fakeWin();
    assert.equal(storedText(win, 'k'), null);
    assert.equal(storeText(win, 'k', '{"a":1}'), null, 'stored: no error');
    assert.equal(storedText(win, 'k'), '{"a":1}');
    const blocked = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } } };
    assert.throws(() => storedText(blocked, 'k'), /blocked/);
    assert.match(String(storeText(blocked, 'k', 'v')), /quota/, 'the error comes back to the caller');
});

test('addressOf gives the href and the hash as they are now', () => {
    const win = fakeWin();
    assert.deepEqual(addressOf(win), { href: 'https://x.test/p?q=1#a=2', hash: '#a=2' });
    win.location.hash = '#b'; assert.equal(addressOf(win).hash, '#b');
});
