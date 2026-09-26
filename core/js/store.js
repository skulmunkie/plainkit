// State store: per-module namespaced, versioned, validated state with optional persistence. Framework-free; never throws on data.
//
//   const store = createStore({ prefix: 'pk', version: 1 });
//   const gallery = store.module('gallery', { defaults: { scale: 1, width: 'wide' }, schema: { scale: { min: 0.5, max: 2 }, width: { enum: ['narrow', 'wide'] } },
//                                             persist: ['scale', 'width'], publish: ['scale'] });
//   gallery.set('scale', 1.25); gallery.subscribe(state => paint(state)); store.read('gallery').scale;   // a read-only copy of published keys only
//
// The data part of a module spec is plain JSON (version, defaults, schema, persist, publish, legacy), so it can move unchanged into the small shared JS/Blazor
// manifest schema (#346, decision Q2); only `migrate(data, fromVersion)` is code, and the opt-in helpers in js/store-extras.js (withLegacy, syncTabs) wrap a spec.
// Persisted as JSON { v, data } under the storage key `<prefix>.<moduleId>` (the envelope PlainKit.Blazor's store will write too); only `persist` keys are written.
// The type of a key is the type of its default; a schema entry adds enum, min, max and maxLength (of the value as JSON, default 1024).
// Stored and cross-tab values are untrusted: corrupt, oversized (64 KB), wrong-type, unknown-key, newer or unmigratable data falls back to the defaults
// with ONE logged warning per load, and blocked or full storage keeps the state in memory (warned once). A module gets a facade for its own namespace only;
// other modules see its `publish` keys through store.read(id). set/patch return false (and warn) instead of throwing; a bad module id throws (a code mistake).
// get, set, patch, subscribe (returns its unsubscribe; called with the whole state after a change), reset, destroy; store.listeners() counts live subscriptions.
// Nothing is evaluated or turned into markup; keep secrets out (it is plain localStorage). Values you get are shared: do not mutate them.
import { createLogger } from './log.js';
import { tell } from './settings.js';

const log = createLogger('store');

const json = t => { try { return JSON.parse(t); } catch { return undefined; } };
const kind = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const text = JSON.stringify;
const plain = v => json(text(v));

export function createStore({ prefix = 'pk', version = 1, storage } = {}) {
    const mods = new Map();
    let live = true;
    const area = () => { try { return storage ?? localStorage; } catch { return null; } };
    const io = fn => { try { return fn(area()); } catch (e) { tell(e); } };

    function module(id, spec = {}) {
        const ns = `${prefix}.${id}`;
        if (!live || !/^[a-z][\w-]{0,39}$/.test(id) || mods.has(ns)) throw new TypeError("bad or taken module id");
        const v0 = spec.version ?? version, defaults = spec.defaults ?? {}, keys = Object.keys(defaults), subs = new Set();
        const persist = spec.persist ?? [];
        let data = { ...defaults };
        const pick = list => Object.fromEntries(list.map(k => [k, data[k]]));
        // Whether `v` is acceptable for key `k`: the type of its default, then the schema's enum, min, max and maxLength (of the JSON text).
        const ok = (k, v, s = spec.schema?.[k] ?? {}) => kind(v) === kind(defaults[k]) && (!s.enum || s.enum.includes(v)) && (typeof v !== 'number' || Number.isFinite(v)) && !(v < s.min || v > s.max) && text(v).length <= (s.maxLength ?? 1024);
        const put = next => {
            if (text(data) === text(next)) return;
            data = next;
            for (const fn of [...subs]) try { fn(data); } catch (e) { log.error(`${ns}: subscriber`, e); }
        };
        // Replaces the state from untrusted values (what was stored, an old key or another tab wrote); a wrong key gets its default, with ONE warning.
        const load = raw => {
            const next = { ...defaults }, why = [];
            let src = {};
            try { if (raw != null) { const e = raw.length > 65536 ? 0 : json(raw); src = e.v < v0 ? spec.migrate(e.data, e.v) : e.data; if (!(e.v <= v0) || kind(src) !== 'object') throw 0; } } catch { src = {}; why.push('unusable data'); }
            why.push(...Object.keys(src).filter(k => !persist.includes(k)).map(k => `unknown ${k}`));
            for (const k of persist) if (k in src) if (ok(k, src[k])) next[k] = src[k]; else why.push(`invalid ${k}`);
            if (why.length) log.warn(`${ns}: ${why}; defaults used`);
            put(next);
        };
        // Nothing stored yet: `spec.import(get)` (js/store-extras.js `withLegacy`) may offer old values, which are then validated like stored ones.
        const get = k => io(a => a.getItem(k)), raw = get(ns), old = raw == null && spec.import?.(get);
        if (raw != null || old) load(raw ?? text({ v: v0, data: old }));
        const save = () => persist.length && io(a => a.setItem(ns, text({ v: v0, data: pick(persist) })));
        const patch = obj => {
            if (!mods.has(ns) || Object.entries(obj).some(([k, v]) => !keys.includes(k) || !ok(k, v))) return log.warn(`${ns}: rejected`), false;
            put({ ...data, ...plain(obj) });
            return save(), true;
        };
        // `spec.attach(load, key)` (js/store-extras.js `syncTabs`) may feed later values in and returns how to stop; `destroy` calls it.
        const stop = spec.attach?.(load, ns);
        const drop = () => { subs.clear(); mods.delete(ns); stop?.(); };
        mods.set(ns, { subs, drop, pub: () => plain(pick(spec.publish ?? [])) });
        return {
            get: k => (keys.includes(k) ? data[k] : undefined),
            set: (k, v) => patch({ [k]: v }),
            patch,
            subscribe: fn => (subs.add(fn), () => subs.delete(fn)),
            // Back to the defaults (saved as such, so an old `legacy` value does not come back); subscribers stay.
            reset() { put({ ...defaults }); save(); },
            // Frees this module: its subscriptions and its slot; later writes are refused.
            destroy: drop
        };
    }
    return {
        module,
        // Another module's PUBLISHED keys as a read-only copy ({} when none or unknown).
        read: id => Object.freeze(mods.get(`${prefix}.${id}`)?.pub() ?? {}),
        // Subscriptions alive across all modules (0 again after unsubscribing or destroy).
        listeners: () => [...mods.values()].reduce((n, m) => n + m.subs.size, 0),
        // Frees everything: subscriptions, storage listeners, the module table.
        destroy() { live = false; [...mods.values()].forEach(m => m.drop()); }
    };
}
