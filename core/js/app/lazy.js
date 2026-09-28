// The app's task, notification and dialog services, loaded on first use (#514). mountApp used to build all three at startup (about 7 KB gzip that a page pays before any
// module asks for a toast); now each is a facade with the same contract (`scope()`, `destroy()`, and the verbs of its scope), and its code arrives with the first call:
// the chunk is fetched through loadChunk (js/app/module.js, the one place that may import()), the real service is made once, and every call made meanwhile runs, in order,
// when it is ready. A call that returns a handle (a task, a toast) answers a stand-in handle right away that forwards to the real one; a dialog answers a promise as it always did.
// A chunk that cannot load is logged, once per attempt, and the calls resolve as if cancelled (no handle, `false` or `null` from a dialog).
import { loadChunk } from './module.js';

// A handle that answers before its owner exists: its methods run on the real handle once there is one (`fns`: name -> answer until then), its `props` read through to it.
function standIn(pending, fns, props = {}) {
    let inner = null;
    const todo = [], h = {};
    for (const [k, dflt] of Object.entries(fns)) h[k] = (...a) => (inner ? inner[k](...a) : (todo.push([k, a]), dflt));
    for (const [k, dflt] of Object.entries(props)) Object.defineProperty(h, k, { get: () => (inner ? inner[k] : dflt), enumerable: true });
    pending.then(r => { inner = r; for (const [k, a] of todo) r?.[k](...a); });
    return h;
}

function lazy({ id, make, verbs, log, answer }) {
    let real = null, wait = null, dead = false;
    const ready = () => real ? Promise.resolve(real) : (wait ??= loadChunk(id).then(m => (dead ? null : (real = make(m.default)))).catch(e => { wait = null; log.error(`could not load the ${id.slice(4)} service`, e); return null; }));
    return {
        scope(...args) {
            let s = null, sw = null, ended = false;
            const open = () => s ? Promise.resolve(s) : (sw ??= ready().then(r => (s = r?.scope(...args) ?? null)));
            const api = Object.fromEntries(verbs.map(v => [v, (...a) => {
                if (ended) { log.warn(`${v}() after the end of its scope was ignored`); return answer(v, Promise.resolve(null)); }
                return s ? s[v](...a) : answer(v, open().then(x => x?.[v](...a) ?? null).catch(e => (log.error(`${v}() failed`, e), null)));
            }]));
            return { ...api, end() { ended = true; if (s) s.end(); else if (sw) sw.then(x => x?.end()); } };
        },
        destroy() { dead = true; real?.destroy(); },
    };
}

// All three take the options createTasks, createNotify and createDialogs take. `load` is what the dialog service uses to define its elements.
export function lazyServices({ container, log, load }) {
    const dialogs = lazy({ id: 'svc-dialogs', log, verbs: ['confirm', 'alert', 'prompt', 'open'], make: f => f({ container, log, load }), answer: (v, p) => p.then(r => r ?? (v === 'confirm' ? false : v === 'alert' ? undefined : null)) });
    const notify = lazy({ id: 'svc-notify', log, verbs: ['info', 'success', 'warn', 'error'], make: f => f({ container, log }), answer: (v, p) => standIn(p, { dismiss: undefined }, { open: true }) });
    const tasks = lazy({ id: 'svc-tasks', log, verbs: ['run'], make: f => f({ container, log }), answer: (v, p) => Object.assign(standIn(p, { cancel: false, retry: null }, { id: '', state: 'queued' }), { promise: p.then(h => h?.promise) }) });
    return { tasks, notify, dialogs };
}
