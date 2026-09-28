import test from 'node:test';
import assert from 'node:assert/strict';
import { watchVitals, recalcMs, measurePage } from '../js/measure.js';

// A window whose PerformanceObserver replays canned entries per type; 'event' is unsupported to show a missing metric stays at its start value.
function fakeWin(entries) {
    return {
        PerformanceObserver: class {
            constructor(cb) { this.cb = cb; }
            observe({ type }) {
                if (type === 'event') throw new TypeError('unsupported');
                this.cb({ getEntries: () => entries[type] ?? [] });
            }
        },
    };
}

test('watchVitals sums layout shifts without recent input and keeps the last paint', () => {
    const v = watchVitals(fakeWin({
        'largest-contentful-paint': [{ startTime: 900 }, { startTime: 1200 }],
        'layout-shift': [{ value: 0.05 }, { value: 0.5, hadRecentInput: true }, { value: 0.02 }],
        longtask: [{}, {}],
    }));
    assert.equal(v.lcp, 1200);
    assert.ok(Math.abs(v.cls - 0.07) < 1e-9);
    assert.equal(v.longTasks, 2);
    assert.equal(v.inp, 0);
});

test('recalcMs flips the theme, reads colours and puts the theme back', () => {
    const attrs = { 'data-theme': 'dark' }; const seen = [];
    const root = { getAttribute: k => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; seen.push(v); }, removeAttribute: k => { delete attrs[k]; } };
    const doc = { documentElement: root, querySelectorAll: () => [{}, {}], defaultView: { getComputedStyle: () => ({ color: 'x' }) } };
    assert.ok(recalcMs(doc) >= 0);
    assert.deepEqual(seen, ['light', 'dark']);
    delete attrs['data-theme'];
    recalcMs(doc);
    assert.equal(attrs['data-theme'], undefined);
});

test('measurePage rejects when the page never loads, and removes its frame', async () => {
    let removed = false; let src;
    const frame = { style: {}, setAttribute() {}, addEventListener() {}, remove() { removed = true; }, set src(v) { src = v; } };
    const host = { ownerDocument: { createElement: () => frame }, append() {} };
    await assert.rejects(measurePage('/slow', { host, timeoutMs: 5 }), /did not load within 5 ms/);
    assert.equal(src, '/slow');
    assert.ok(removed);
});

test('measurePage resolves load time, node count and vitals after the settle delay', async () => {
    let onLoad;
    const win = fakeWin({ 'layout-shift': [{ value: 0.1 }] });
    const frame = { style: {}, setAttribute() {}, addEventListener: (_t, fn) => { onLoad = fn; }, remove() {}, contentWindow: win, contentDocument: { body: {}, getElementsByTagName: () => [1, 2, 3] }, set src(_v) { setTimeout(() => onLoad(), 0); } };
    const host = { ownerDocument: { createElement: () => frame }, append() {} };
    const r = await measurePage('/page', { host, settleMs: 1 });
    assert.equal(r.nodes, 3);
    assert.equal(r.cls, 0.1);
    assert.ok(r.loadMs >= 0);
});
