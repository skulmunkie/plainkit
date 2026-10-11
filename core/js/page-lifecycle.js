// The page lifecycle (#1022, step 1): the plumbing every page repeats by hand, written once. Not in the app entry graph: the page-type chunks that use it import it.
//   const lc = createLifecycle({ onChange: s => ... });   // s = { busy, error, disposed }
//   el.load = id => lc.load(signal => fetchRecord(id, signal));   // a newer load (or dispose) aborts the signal; a superseded load never settles, so its result cannot be drawn
//   await lc.run(() => save(values), 'save');                      // busy while it runs, error kept ({ label, message }) when it rejects (and rethrown), cleared by the next run
//   lc.refresh();                                                   // onChange again, a no-op after dispose
//   lc.dispose();                                                   // aborts in-flight work, silences every later callback
// The same rules, as data, are in core/tests/fixtures/page-lifecycle.json; the C# page base (a later step) must satisfy that file too.
export function createLifecycle({ onChange } = {}) {
    let ctl = null, disposed = false, busy = 0, error = null;
    const state = () => ({ busy, error, disposed }), notify = () => { if (!disposed) onChange?.(state()); };
    return {
        state,
        load(fn) {
            ctl?.abort();
            const mine = ctl = new AbortController(), live = () => !disposed && ctl === mine;
            return new Promise((resolve, reject) => {
                let p;
                try { p = Promise.resolve(fn(mine.signal)); } catch (e) { p = Promise.reject(e); }
                p.then(v => live() && resolve(v), e => live() && reject(e));
            });
        },
        async run(fn, label) {
            if (disposed) return;
            busy++; error = null; notify();
            try { return await fn(); } catch (e) { error = { label, message: e?.message ?? String(e) }; throw e; } finally { busy--; notify(); }
        },
        refresh: notify,
        dispose() { if (disposed) return; ctl?.abort(); disposed = true; },
    };
}

/** A mount cleanup (also a thenable, as mountTitled returns) that runs `fn` first: the lifecycle disposes with the page, whichever form the caller holds. */
export const disposeWith = (mounted, fn) => Object.assign(() => { fn(); mounted(); }, mounted.then && { then: (ok, no) => mounted.then(stop => ok(() => { fn(); stop(); }), no) });
