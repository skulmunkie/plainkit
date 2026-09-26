// State store (js/store.js, #348) and its helpers (js/store-extras.js, js/settings.js): envelope, validation, migration, isolation, quota/blocked
// storage, legacy keys, cross-tab sync, leaks, size.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createStore } from '../js/store.js';
import { readSetting, writeSetting } from '../js/settings.js';
import { withLegacy, syncTabs } from '../js/store-extras.js';
import { getLogBuffer, clearLogBuffer, setLogLevel } from '../js/log.js';

setLogLevel('silent');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => m.delete(k) }; };
const spec = () => ({ defaults: { scale: 1, width: 'wide', tags: [], on: false }, schema: { scale: { min: 0.5, max: 2 }, width: { enum: ['narrow', 'wide'] }, tags: { maxLength: 12 } }, persist: ['scale', 'width', 'tags'], publish: ['scale'] });
const warnings = () => getLogBuffer().filter(e => e.level === 'warn' && ['store', 'settings'].includes(e.scope));
const fresh = init => { clearLogBuffer(); const storage = memory(init); return { storage, store: createStore({ storage }) }; };
const env = data => JSON.stringify({ v: 1, data });

test('get, set, patch and the { v, data } envelope under <prefix>.<id>', () => {
    const { storage, store } = fresh();
    const m = store.module('gallery', spec());
    assert.equal(m.get('scale'), 1);
    assert.equal(m.set('scale', 1.5), true);
    assert.equal(m.patch({ width: 'narrow', on: true }), true);
    assert.deepEqual(JSON.parse(storage.m.get('pk.gallery')), { v: 1, data: { scale: 1.5, width: 'narrow', tags: [] } }, 'only persisted keys are written');
    const again = fresh(Object.fromEntries(storage.m)).store.module('gallery', spec());
    assert.equal(again.get('scale'), 1.5);
    assert.equal(again.get('on'), false, 'a non-persisted key is not restored');
    assert.equal(warnings().length, 0);
    const other = memory();
    assert.equal(createStore({ storage: other, prefix: 'x', version: 4 }).module('a', { defaults: { n: 1 }, persist: ['n'] }).set('n', 2), true);
    assert.deepEqual(JSON.parse(other.m.get('x.a')), { v: 4, data: { n: 2 } }, 'prefix and the store version apply');
});

test('invalid writes are rejected whole, with a warning each, and never throw', () => {
    const { store } = fresh();
    const m = store.module('a', spec());
    for (const [k, v] of [['scale', 9], ['scale', '1'], ['scale', NaN], ['scale', Infinity], ['width', 'huge'], ['tags', Array(20).fill(1)], ['nope', 1], ['__proto__', {}], ['scale', undefined]]) assert.equal(m.set(k, v), false, `${k}=${String(v)}`);
    assert.equal(m.patch({ scale: 1.2, width: 'huge' }), false);
    assert.equal(m.get('scale'), 1, 'the valid half of a rejected patch is not applied');
    assert.equal(m.get('nope'), undefined);
    assert.equal(m.get('constructor'), undefined);
    assert.equal(warnings().length, 10);
});

for (const [name, text] of [['corrupt JSON', '{not json'], ['not an object', '42'], ['null', 'null'], ['no envelope', '{"scale":1.5}'], ['no version', '{"data":{"scale":1.5}}'], ['array data', '{"v":1,"data":[]}'], ['null data', '{"v":1,"data":null}'], ['oversized', `{"v":1,"data":{"width":"${'x'.repeat(70000)}"}}`], ['newer version', '{"v":9,"data":{"scale":1.5}}'], ['old version, no migrate', '{"v":0,"data":{"scale":1.5}}']]) {
    test(`stored data: ${name} gives the defaults and exactly one warning`, () => {
        const { store } = fresh({ 'pk.a': text });
        const m = store.module('a', spec());
        assert.equal(m.get('scale'), 1);
        assert.equal(m.get('width'), 'wide');
        assert.equal(warnings().length, 1);
    });
}

test('stored data: a wrong type, out-of-range value, unknown or foreign key falls back per key with one warning', () => {
    const { store } = fresh({ 'pk.a': env({ scale: 'big', width: 'narrow', tags: Array(20).fill(1), on: true, evil: '<img onerror=x>', __proto__: 1 }) });
    const m = store.module('a', spec());
    assert.equal(m.get('scale'), 1);
    assert.equal(m.get('width'), 'narrow', 'a valid key survives');
    assert.deepEqual(m.get('tags'), []);
    assert.equal(m.get('on'), false, 'a key that is not persisted is not loaded');
    assert.equal(m.get('evil'), undefined);
    assert.equal(warnings().length, 1);
    assert.match(warnings()[0].message, /unknown on.*unknown evil.*invalid scale.*invalid tags/);
});

test('version migration: migrate(old, fromVersion) runs, its result is validated, a throw means defaults', () => {
    const s = () => ({ ...spec(), version: 3, migrate: (d, from) => (from === 1 ? { ...d, width: d.width === 'w' ? 'wide' : d.width } : { scale: 'broken' }) });
    const ok = fresh({ 'pk.a': env({ scale: 1.5, width: 'w' }) });
    const m = ok.store.module('a', s());
    assert.equal(m.get('width'), 'wide');
    assert.equal(m.get('scale'), 1.5);
    assert.equal(warnings().length, 0);
    m.set('scale', 1.25);
    assert.equal(JSON.parse(ok.storage.m.get('pk.a')).v, 3, 'saved at the current version');
    assert.equal(fresh({ 'pk.a': JSON.stringify({ v: 2, data: {} }) }).store.module('a', s()).get('scale'), 1, 'the migrated value fails the schema');
    assert.equal(warnings().length, 1);
    assert.equal(fresh({ 'pk.a': env({}) }).store.module('a', { ...s(), migrate() { throw new Error('boom'); } }).get('width'), 'wide');
    assert.equal(warnings().length, 1);
    fresh({ 'pk.a': env({}) }).store.module('a', { ...s(), migrate: () => 'not an object' });
    assert.equal(warnings().length, 1);
    fresh({ 'pk.a': env({}) }).store.module('a', { ...s(), migrate: () => null });
    assert.equal(warnings().length, 1, 'null is not an object either');
});

test('legacy keys (withLegacy) are read once, validated and coerced; an existing envelope wins', () => {
    const s = () => withLegacy({ defaults: { scale: 1, width: 'wide', inspector: false, draft: {}, panel: 0 }, schema: { scale: { min: 0.5, max: 2 }, width: { enum: ['phone', 'desktop', 'wide'] } }, persist: ['scale', 'width', 'inspector', 'draft', 'panel'], legacy: { scale: 'pk-gallery-scale', width: 'pk-gallery-width', inspector: 'pk-gallery-inspector', draft: 'pk-layout-builder-draft', panel: 'pk-gallery-inspector-w' } });
    const { storage, store } = fresh({ 'pk-gallery-scale': '1.25', 'pk-gallery-width': 'phone', 'pk-gallery-inspector': '1', 'pk-layout-builder-draft': '{"a":1}', 'pk-gallery-inspector-w': '320' });
    const m = store.module('gallery', s());
    assert.deepEqual([m.get('scale'), m.get('width'), m.get('inspector'), m.get('draft'), m.get('panel')], [1.25, 'phone', true, { a: 1 }, 320]);
    assert.equal(storage.m.get('pk-gallery-scale'), '1.25', 'the old key is left as it is until the site adopts the store');
    assert.equal(warnings().length, 0);
    assert.equal(fresh({ 'pk-gallery-inspector': '0' }).store.module('g', s()).get('inspector'), false);
    assert.equal(fresh({ 'pk-gallery-inspector': 'true' }).store.module('g', s()).get('inspector'), true);
    const bad = fresh({ 'pk-gallery-scale': 'lots', 'pk-gallery-width': 'wide', 'pk-gallery-inspector': 'maybe', 'pk-layout-builder-draft': '{oops' }).store.module('gallery', s());
    assert.deepEqual([bad.get('scale'), bad.get('width'), bad.get('inspector'), bad.get('draft')], [1, 'wide', false, {}]);
    assert.equal(warnings().length, 1, 'one warning for the whole load');
    assert.equal(fresh({ 'pk.gallery': env({ scale: 2 }), 'pk-gallery-scale': '1.25' }).store.module('gallery', s()).get('scale'), 2, 'an envelope wins');
    assert.equal(fresh({ 'pk-gallery-scale': '9' }).store.module('gallery', s()).get('scale'), 1, 'out of range');
    assert.equal(fresh({}).store.module('gallery', s()).get('scale'), 1);
    assert.equal(warnings().length, 0, 'nothing stored anywhere: quiet defaults');
    const reset = fresh({ 'pk-gallery-scale': '1.25' }).store.module('gallery', s());
    reset.reset();
    assert.equal(reset.get('scale'), 1);
});

test('blocked storage and a full storage keep the state in memory with a warning, never a throw', () => {
    clearLogBuffer();
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    const m = createStore({ storage: { getItem: boom, setItem: boom, removeItem: boom } }).module('a', withLegacy({ ...spec(), legacy: { scale: 'x' } }));
    assert.equal(m.get('scale'), 1);
    assert.doesNotThrow(() => { m.set('scale', 1.5); m.reset(); });
    assert.equal(m.get('scale'), 1);
    const full = memory();
    full.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    const f = createStore({ storage: full }).module('b', spec());
    assert.equal(f.set('scale', 1.5), true, 'the write is kept in memory');
    assert.equal(f.get('scale'), 1.5);
    assert.ok(getLogBuffer().some(e => e.level === 'warn'), 'a warning was logged');
    assert.equal(createStore({ storage: null }).module('c', spec()).get('scale'), 1);
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: boom });
        assert.equal(createStore().module('d', spec()).set('scale', 1.5), true, 'localStorage itself throws on access');
    } finally { if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage; }
});

test('readSetting and writeSetting: strings in localStorage, a blocked or full storage does not throw', () => {
    const saved = globalThis.localStorage;
    try {
        const m = new Map();
        globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
        writeSetting('pk-x', 'dark');
        assert.equal(readSetting('pk-x'), 'dark');
        assert.equal(readSetting('missing'), null);
        globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new DOMException('q', 'QuotaExceededError'); } };
        assert.equal(readSetting('pk-x'), null);
        assert.doesNotThrow(() => writeSetting('pk-x', 'y'));
    } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

test('the gallery settings file re-exports the core helpers unchanged', async () => {
    const site = await import('../site/gallery/settings.js');
    assert.equal(site.readSetting, readSetting);
    assert.equal(site.writeSetting, writeSetting);
});

test('isolation: a module cannot reach another module\'s private keys; publish keys are a read-only copy', () => {
    const { storage, store } = fresh();
    const a = store.module('a', { defaults: { secret: 's', shared: { n: 1 } }, persist: ['secret'], publish: ['shared'] });
    const b = store.module('b', { defaults: { mine: 1 }, persist: ['mine'] });
    assert.equal(b.get('secret'), undefined);
    assert.equal(b.set('secret', 'x'), false);
    assert.equal(a.get('secret'), 's');
    assert.deepEqual(store.read('a'), { shared: { n: 1 } }, 'only the published key');
    assert.equal('secret' in store.read('a'), false);
    assert.deepEqual(store.read('b'), {}, 'nothing published');
    assert.deepEqual(store.read('nobody'), {});
    const view = store.read('a');
    assert.ok(Object.isFrozen(view));
    assert.throws(() => { view.shared = 1; }, TypeError);
    view.shared.n = 99;
    assert.equal(store.read('a').shared.n, 1, 'mutating a copy does not change the state');
    assert.deepEqual(Object.keys(b).sort(), ['destroy', 'get', 'patch', 'reset', 'set', 'subscribe'], 'the facade exposes no internals or other namespaces');
    b.set('mine', 2);
    assert.equal(JSON.parse(storage.m.get('pk.b')).data.mine, 2);
    assert.throws(() => store.module('a', {}), TypeError, 'a taken id');
    for (const id of ['Bad Id', '__proto__', 'a.b', '', '1x', 'x'.repeat(41)]) assert.throws(() => store.module(id, {}), TypeError, id);
    const o = fresh({ 'pk.a': env({ v: 1 }) });
    assert.equal(o.store.module('b', { defaults: { v: 0 }, persist: ['v'] }).get('v'), 0, 'another module\'s stored entry is not read');
});

test('stored values are never evaluated or turned into markup; a hostile value stays inert data', () => {
    for (const f of ['js/store.js', 'js/store-extras.js', 'js/settings.js']) assert.doesNotMatch(fs.readFileSync(path.join(root, f), 'utf8'), /\beval\s*\(|new Function|\bFunction\s*\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute|createElement/, f);
    const { store } = fresh({ 'pk.a': env({ width: '<img src=x onerror=alert(1)>' }) });
    assert.equal(store.module('a', spec()).get('width'), 'wide', 'not in the enum: rejected');
});

test('subscribe / unsubscribe x100 returns the listener count to zero; destroy frees the rest', () => {
    const { store } = fresh();
    const m = store.module('a', spec());
    const seen = [];
    for (let i = 0; i < 100; i++) { const off = m.subscribe(s => seen.push(s)); assert.equal(store.listeners(), 1); off(); assert.equal(store.listeners(), 0); }
    const offs = Array.from({ length: 100 }, () => m.subscribe(() => {}));
    assert.equal(store.listeners(), 100);
    m.set('scale', 1.5);
    offs.forEach(off => off());
    assert.equal(store.listeners(), 0);
    m.set('scale', 1.75);
    assert.equal(seen.length, 0, 'unsubscribed callbacks are not called');
    const off = m.subscribe(s => seen.push(s));
    m.set('scale', 1.5);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].scale, 1.5, 'subscribers get the state');
    m.set('scale', 1.5);
    assert.equal(seen.length, 1, 'no change, no notification');
    m.reset();
    assert.equal(store.listeners(), 1, 'reset restores the state and keeps subscribers');
    assert.equal(seen.at(-1).scale, 1);
    off();
    m.subscribe(() => {});
    m.destroy();
    assert.equal(store.listeners(), 0);
    assert.equal(m.set('scale', 1.2), false, 'a destroyed module refuses writes');
    store.module('a', spec());
    store.module('b', spec()).subscribe(() => {});
    assert.equal(store.listeners(), 1);
    store.destroy();
    assert.equal(store.listeners(), 0);
    assert.deepEqual(store.read('b'), {});
    assert.throws(() => store.module('c', {}), TypeError);
});

test('a throwing subscriber is logged and does not stop the others', () => {
    const { store } = fresh();
    const m = store.module('a', spec());
    let ran = 0;
    m.subscribe(() => { throw new Error('bad subscriber'); });
    m.subscribe(() => { ran++; });
    assert.doesNotThrow(() => m.set('scale', 1.5));
    assert.equal(ran, 1);
    assert.ok(getLogBuffer().some(e => e.scope === 'store' && e.level === 'error'));
});

test('cross-tab sync (syncTabs) is opt-in, validated like any read, and its listener is removed on destroy', () => {
    const handlers = new Set();
    const events = { addEventListener: (t, f) => t === 'storage' && handlers.add(f), removeEventListener: (t, f) => handlers.delete(f) };
    const { storage, store } = fresh();
    const plain = store.module('plain', { defaults: { x: 1 }, persist: ['x'] });
    assert.equal(handlers.size, 0, 'no listener unless a module opts in');
    const m = store.module('a', syncTabs(spec(), { events, storage }));
    assert.equal(handlers.size, 1);
    const [fire] = handlers;
    const seen = [];
    m.subscribe(s => seen.push(s.scale));
    fire({ key: 'pk.a', newValue: env({ scale: 1.75 }), storageArea: storage });
    assert.equal(m.get('scale'), 1.75);
    assert.deepEqual(seen, [1.75]);
    fire({ key: 'pk.a', newValue: env({ scale: 'hostile' }), storageArea: storage });
    assert.equal(m.get('scale'), 1, 'an invalid message falls back to the default');
    assert.equal(warnings().length, 1);
    fire({ key: 'pk.a', newValue: '{"v":9,"data":{}}', storageArea: storage });
    fire({ key: 'pk.a', newValue: 'x'.repeat(70000), storageArea: storage });
    assert.equal(warnings().length, 3, 'newer and oversized messages warn and change nothing');
    m.set('width', 'narrow');
    fire({ key: 'pk.a', newValue: null, storageArea: storage });
    assert.equal(m.get('width'), 'wide', 'a key removed in another tab resets');
    fire({ key: 'pk.plain', newValue: env({ x: 5 }), storageArea: storage });
    assert.equal(plain.get('x'), 1, 'another key is ignored');
    fire({ key: 'pk.a', newValue: env({ scale: 2 }), storageArea: memory() });
    assert.equal(m.get('scale'), 1, 'another storage area is ignored');
    const other = store.module('b', syncTabs(spec(), { events }));
    assert.equal(handlers.size, 2);
    other.destroy();
    assert.equal(handlers.size, 1, 'a module\'s destroy removes its listener');
    store.destroy();
    assert.equal(handlers.size, 0, 'the store\'s destroy removes the rest');
    assert.doesNotThrow(() => syncTabs(spec(), { events: {} }).attach(() => {}, 'k')(), 'a host without storage events is fine');
});

test('the store stays inside its size budget (1.5 KB gzip, comments removed)', () => {
    const strip = t => t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n');
    const kb = f => zlib.gzipSync(Buffer.from(strip(fs.readFileSync(path.join(root, f), 'utf8')))).length / 1024;
    assert.ok(kb('js/store.js') <= 1.5, `js/store.js is ${kb('js/store.js').toFixed(2)} KB gzip, limit 1.5`);
    assert.ok(kb('js/store-extras.js') + kb('js/settings.js') <= 1, 'the opt-in helpers stay small too');
});
