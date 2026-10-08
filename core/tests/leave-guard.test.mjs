// The leave guard (#872): who asks, when, and what a cancel or a confirm leaves behind. A fake window stands in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveGuard } from '../js/app/pages/svc-leave-guard.js';

function target() {
    const l = new Map();
    return {
        addEventListener: (t, f, c) => { l.set(t + !!c + f, [t, f, !!c]); },
        removeEventListener: (t, f, c) => { l.delete(t + !!c + f); },
        fire(ev) { for (const cap of [true, false]) for (const [t, f, c] of [...l.values()]) if (t === ev.type && c === cap && !ev.stopped) f(ev); },
        count: () => l.size,
    };
}
function fakeWin(href = 'http://x.test/app#/a') {
    const win = target();
    win.document = target(); win.location = { href, origin: new URL(href).origin };
    win.history = { state: null, replaceState: (s, _t, u) => { win.location.href = new URL(u, win.location.href).href; } };
    win.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
    win.Event = class { constructor(type) { this.type = type; } };
    win.dispatchEvent = ev => win.fire(ev);
    return win;
}
const listeners = w => w.count() + w.document.count();
const click = href => { const a = { localName: 'a', href, hasAttribute: n => n === 'href', target: '', click() { a.clicked = true; } }; return { type: 'click', a, composedPath: () => [a], defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; };
const tick = () => new Promise(r => setTimeout(r, 0));

test('a clean page is never asked and holds no listener', () => {
    const win = fakeWin(); let asked = 0;
    const g = leaveGuard(win, () => (asked++, true));
    assert.equal(listeners(win), 0);
    const e = click('http://x.test/app#/b'); win.document.fire(e);
    assert.equal(e.defaultPrevented, false); assert.equal(asked, 0);
    g.dirty(true); assert.ok(listeners(win) > 0);
    g.dirty(false); assert.equal(listeners(win), 0);
});

test('a link click on a dirty page asks; cancel keeps the page, confirm replays the click', async () => {
    const win = fakeWin(); let answer = false, asked = 0;
    const g = leaveGuard(win, () => (asked++, Promise.resolve(answer)));
    g.dirty(true);
    let e = click('http://x.test/app#/b'); win.document.fire(e); await tick();
    assert.ok(e.defaultPrevented); assert.equal(asked, 1); assert.ok(!e.a.clicked, 'cancel: the link was not followed');
    answer = true; e = click('http://x.test/app#/b'); win.document.fire(e); await tick();
    assert.ok(e.a.clicked, 'confirm: the click is replayed');
    assert.equal(listeners(win), 0, 'a confirmed leave disarms the guard');
    g.destroy(); assert.equal(listeners(win), 0, 'destroy leaves no listener');
});

test('other origins, modifier clicks, the same address and a save in flight pass without a question', async () => {
    const win = fakeWin(); let asked = 0;
    const g = leaveGuard(win, () => (asked++, false)); g.dirty(true);
    for (const e of [click('http://other.test/'), Object.assign(click('http://x.test/app#/b'), { ctrlKey: true }), click('http://x.test/app#/a')]) { win.document.fire(e); assert.equal(e.defaultPrevented, false); }
    g.busy(true); const e = click('http://x.test/app#/b'); win.document.fire(e); assert.equal(e.defaultPrevented, false);
    g.busy(false); await tick(); assert.equal(asked, 0);
});

test('pk-navigate is asked, then cancelled or replayed on the same target', async () => {
    const win = fakeWin(); let answer = false;
    const g = leaveGuard(win, () => answer); g.dirty(true);
    const sent = [], tg = { dispatchEvent: ev => sent.push(ev) };
    const e = { type: 'pk-navigate', detail: { to: '/b' }, target: tg, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    win.document.fire(e); await tick(); assert.ok(e.defaultPrevented); assert.equal(sent.length, 0);
    answer = true; e.defaultPrevented = false; win.document.fire(e); await tick();
    assert.equal(sent.length, 1); assert.deepEqual(sent[0].detail, { to: '/b' }); assert.equal(sent[0].cancelable, true);
});

test('back/forward: the router never sees a vetoed change, the address is restored, confirm replays it', async () => {
    const win = fakeWin('http://x.test/app#/a'); let answer = false, routed = 0;
    win.addEventListener('hashchange', () => routed++, false); win.addEventListener('popstate', () => routed++, false);
    const g = leaveGuard(win, () => answer); g.dirty(true);
    const nav = () => { win.location.href = 'http://x.test/app#/b'; for (const type of ['popstate', 'hashchange']) { const ev = { type, stopped: false }; ev.stopImmediatePropagation = () => { ev.stopped = true; }; win.fire(ev); } };
    nav(); await tick();
    assert.equal(routed, 0, 'the router did not run'); assert.equal(win.location.href, 'http://x.test/app#/a', 'cancel keeps the address');
    answer = true; nav(); await tick();
    assert.equal(win.location.href, 'http://x.test/app#/b', 'confirm goes there'); assert.ok(routed > 0, 'the router heard it after confirm');
    g.destroy();
});

test('a second ask while one is open is refused, and a throwing dialog counts as cancel', async () => {
    const win = fakeWin(); let n = 0;
    leaveGuard(win, () => (n++, new Promise(() => {}))).dirty(true);
    win.document.fire(click('http://x.test/app#/b')); win.document.fire(click('http://x.test/app#/c')); await tick(); assert.equal(n, 1);
    const w2 = fakeWin(); leaveGuard(w2, () => { throw new Error('no dialog'); }).dirty(true);
    const e = click('http://x.test/app#/b'); w2.document.fire(e); await tick(); assert.ok(e.defaultPrevented && !e.a.clicked);
});
