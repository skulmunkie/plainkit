// The inline pattern views of the gallery: a pattern's script runs inside the sample frame (frame-boot.js -> bootPattern), on the frame's own
// markup, and ends when the view is drawn again or the frame goes. This file checks the shared mount helper, the frame wiring and the promise
// every script makes: mount and destroy twice, nothing left listening.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSamples } from '../tools/build.mjs';
import { mountPattern, bootPattern, SCRIPT_NAME, DESTROY_EVENT } from '../site/gallery/pattern-mount.js';
import { sampleDoc, destroyFrame } from '../site/gallery/frame.js';
import { addLogSink, configureLogging } from '../js/log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withScript = loadSamples().patterns.filter(p => p.script);
const scriptUrl = p => pathToFileURL(path.join(root, 'samples/patterns', p.script)).href;

// What the logger says while a test runs; the console stays quiet.
function watchLog() {
    const seen = [];
    configureLogging({ level: 'silent' });
    const remove = addLogSink(e => seen.push(e));
    return { seen, stop: () => remove?.() };
}

// A window that keeps its listeners and can fire one.
const fakeWindow = () => {
    const listeners = new Map();
    return {
        addEventListener(type, fn, options) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push({ fn, once: options?.once }); },
        fire(type) { for (const l of listeners.get(type) ?? []) l.fn({ type }); listeners.set(type, (listeners.get(type) ?? []).filter(l => !l.once)); },
        count: type => (listeners.get(type) ?? []).length,
    };
};
const fakeDoc = attr => ({ documentElement: { getAttribute: n => (n === 'data-pattern' ? attr : null) }, body: { name: 'body' } });

test('mountPattern mounts on the root the host gives and hands back a handle that destroys once', async () => {
    let mountedOn = null; let destroyed = 0;
    const body = { name: 'body' };
    const handle = await mountPattern(body, 'file:///x.js', 'x', { load: async () => ({ default: r => { mountedOn = r; return { destroy() { destroyed += 1; } }; } }) });
    assert.equal(mountedOn, body);
    handle.destroy(); handle.destroy();
    assert.equal(destroyed, 1, 'destroy is idempotent');
});

test('mountPattern logs a script that fails to load, has no mount, throws in mount or throws in destroy, and always returns a handle', async () => {
    const log = watchLog();
    const cases = {
        load: async () => { throw new Error('404'); },
        'no default': async () => ({}),
        'mount throws': async () => ({ default: () => { throw new Error('boom'); } }),
    };
    for (const [name, load] of Object.entries(cases)) {
        const before = log.seen.length;
        const handle = await mountPattern({}, 'file:///x.js', name, { load });
        assert.equal(typeof handle.destroy, 'function', name);
        handle.destroy();
        assert.ok(log.seen.some((e, i) => i >= before && e.level === 'error'), `${name}: logged as an error`);
    }
    const before = log.seen.length;
    const handle = await mountPattern({}, 'file:///x.js', 'bad-destroy', { load: async () => ({ default: () => ({ destroy() { throw new Error('nope'); } }) }) });
    assert.doesNotThrow(() => handle.destroy());
    assert.ok(log.seen.slice(before).some(e => e.level === 'error' && /clean up/.test(e.message)), 'a destroy that throws is logged');
    const bare = await mountPattern({}, 'file:///x.js', 'no-handle', { load: async () => ({ default: () => undefined }) });
    assert.doesNotThrow(() => bare.destroy(), 'a script that returns no handle is tolerated');
    log.stop();
});

test('bootPattern reads data-pattern, mounts on the body and ends the script on pagehide or on the gallery\'s destroy event, once', async () => {
    for (const type of ['pagehide', DESTROY_EVENT]) {
        const win = fakeWindow(); const doc = fakeDoc('notifications/notifications.js');
        let destroyed = 0; let url = '';
        const handle = await bootPattern(win, doc, new URL('file:///site/patterns/'), { load: async u => { url = u; return { default: r => { assert.equal(r, doc.body); return { destroy() { destroyed += 1; } }; } }; } });
        assert.equal(url, 'file:///site/patterns/notifications/notifications.js');
        assert.ok(handle);
        win.fire(type); win.fire('pagehide'); win.fire(DESTROY_EVENT);
        assert.equal(destroyed, 1, `${type}: destroyed exactly once`);
    }
});

test('bootPattern does nothing for a frame that names no script or one of a bad shape', async () => {
    for (const attr of [null, '', '../x.js', 'a/b.txt', 'a/b/c.js', '//evil.example/x.js', 'a"b/c.js']) {
        const win = fakeWindow();
        let loaded = 0;
        assert.equal(await bootPattern(win, fakeDoc(attr), new URL('file:///p/'), { load: async () => { loaded += 1; return {}; } }), null, String(attr));
        assert.equal(loaded, 0);
        assert.equal(win.count('pagehide'), 0);
    }
    assert.ok(SCRIPT_NAME.test('master-detail-pattern/master-detail-pattern.js'));
});

test('a sample frame carries data-pattern only for a real script name; the data names one for every scripted pattern', () => {
    assert.match(sampleDoc('<p>x</p>', { pattern: 'onboarding/onboarding.js' }), /<html [^>]*data-pattern="onboarding\/onboarding\.js"/);
    assert.ok(!/data-pattern/.test(sampleDoc('<p>x</p>')));
    assert.ok(!/data-pattern/.test(sampleDoc('<p>x</p>', { pattern: '"><script>' })));
    assert.match(sampleDoc('<p>x</p>', { pattern: 'a/b.js' }), /frame-boot\.js/);
    for (const p of withScript) assert.match(sampleDoc('', { pattern: p.script }), /data-pattern=/, p.id);
});

test('destroyFrame sends the destroy event to the frame\'s own window, and copes with a frame that has none', () => {
    const got = [];
    class Ev { constructor(type) { this.type = type; } }
    const frame = { contentWindow: { Event: Ev, dispatchEvent: e => got.push(e.type) } };
    destroyFrame(frame);
    assert.deepEqual(got, [DESTROY_EVENT]);
    assert.doesNotThrow(() => destroyFrame({ contentWindow: null }));
});

// ---- every script: mount and destroy twice, nothing left listening ---------------------------------------------------------------

// A DOM that accepts anything a script does to it and records every listener with its signal (a Proxy answers every property).
function recordingDom() {
    const listeners = [];
    const make = () => {
        const target = { dataset: {}, hidden: false, textContent: '', value: '', children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
        return new Proxy(target, {
            get(t, key) {
                if (key in t) return t[key];
                if (key === 'addEventListener') return (type, fn, options) => { listeners.push({ type, signal: options?.signal, options }); };
                if (key === 'querySelector' || key === 'closest' || key === 'cloneNode') return () => make();
                if (key === 'querySelectorAll') return () => [make()];
                if (key === 'getAttribute') return () => null;
                if (key === 'hasAttribute') return () => false;
                if (key === Symbol.iterator || key === 'then') return undefined;
                return () => undefined;
            },
            set(t, key, value) { t[key] = value; return true; },
        });
    };
    return { listeners, make };
}

// The browser globals a script reaches for, for the length of one test.
function stubGlobals() {
    const saved = { document: globalThis.document, customElements: globalThis.customElements };
    globalThis.customElements = { whenDefined: () => new Promise(() => {}) };
    return () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } };
}

test('every pattern script can mount and destroy twice on the same root: every listener carries the abort signal, all are aborted, none accumulate', async () => {
    const log = watchLog();
    const restore = stubGlobals();
    try { for (const p of withScript) {
        const dom = recordingDom();
        globalThis.document = dom.make();
        globalThis.document.createElement = () => dom.make();
        const rootEl = dom.make();
        const mount = (await import(scriptUrl(p))).default;
        const perMount = [];
        for (let round = 0; round < 2; round++) {
            const from = dom.listeners.length;
            const handle = mount(rootEl);
            const mine = dom.listeners.slice(from);
            assert.ok(mine.length > 0, `${p.id}: round ${round} added listeners`);
            for (const l of mine) { assert.ok(l.signal instanceof AbortSignal, `${p.id}: a "${l.type}" listener without the signal`); assert.equal(l.signal.aborted, false, `${p.id}: aborted before destroy`); }
            handle.destroy();
            assert.ok(mine.every(l => l.signal.aborted), `${p.id}: round ${round} left a live listener`);
            handle.destroy(); // a second destroy is harmless
            perMount.push(mine.length);
        }
        assert.equal(perMount[0], perMount[1], `${p.id}: a second mount adds what the first did, nothing more`);
    } } finally { restore(); log.stop(); }
});

test('two views of one pattern are independent: destroying one leaves the other listening', async () => {
    const log = watchLog();
    const restore = stubGlobals();
    try { for (const p of withScript) {
        const dom = recordingDom();
        globalThis.document = dom.make();
        globalThis.document.createElement = () => dom.make();
        const mount = (await import(scriptUrl(p))).default;
        const a = mount(dom.make()); const fromB = dom.listeners.length; const b = mount(dom.make());
        const mineA = dom.listeners.slice(0, fromB); const mineB = dom.listeners.slice(fromB);
        a.destroy();
        assert.ok(mineA.every(l => l.signal.aborted), `${p.id}: the first view ended`);
        assert.ok(mineB.every(l => !l.signal.aborted), `${p.id}: the second view still listens`);
        b.destroy();
        assert.ok(mineB.every(l => l.signal.aborted), `${p.id}: the second view ended`);
    } } finally { restore(); log.stop(); }
});

test('the gallery hands its inline pattern frames the script, makes them only when visible, and releases them on re-render', () => {
    const src = fs.readFileSync(path.join(root, 'site/gallery/gallery.js'), 'utf8').replace(/\r\n/g, '\n');
    assert.match(src, /pattern: p\.script/, 'the pattern slots carry the script');
    assert.match(src, /function releaseFrames\(\) \{\s*for \(const f of frames\) destroyFrame\(f\);\s*frames\.clear\(\);/);
    assert.match(src, /function watchFrames\(\) \{[^}]*releaseFrames\(\)/, 'every re-render ends the scripts of the frames it replaces');
    const boot = fs.readFileSync(path.join(root, 'site/gallery/frame-boot.js'), 'utf8');
    assert.match(boot, /bootPattern\(window, document,/);
    const lazyHook = /lazy = new IntersectionObserver\(entries => \{ for \(const e of entries\) if \(e\.isIntersecting\) \{ lazy\.unobserve\(e\.target\); mountFrame\(e\.target\); \} \}/;
    assert.match(src, lazyHook, 'a frame (and so its script) is made only when its slot becomes visible');
});
