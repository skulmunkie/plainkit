// The page lifecycle (#1022, design docs/superpowers/specs/2026-10-11-page-base-design.md section 3.1): the plumbing every page repeats by hand, written once.
// Not in the app entry graph: the page-type chunks that use it import it (app-budgets guards this).
//   const life = createLifecycle({ page, signal });   // page: createPage(...) or anything with busy(fn, label) (and setError(err)); signal: ctx.signal, aborting it destroys
//   life.load(key, async signal => data);              // state 'loading' synchronously; a later load aborts the earlier signal and its result is never applied
//   life.run(label, async signal => value);            // counted busy through page.busy (which sets the page status once); rejects to the caller too
//   life.refresh();  life.destroy();                   // refresh re-runs the last load; destroy aborts, is idempotent and makes every later call a no-op
//   life.state ('idle' | 'loading' | 'ready' | 'error'), life.error
// load() resolves with the data only when it is still current. A superseded or destroyed load never settles (nothing to apply, nothing to report);
// an aborted call is never an error. No timers. The rules are also data, in core/tests/fixtures/page-lifecycle.json (the C# suite reads the same file).
export function createLifecycle({ page = null, signal } = {}) {
    let gen = 0, dead = false, last = null, current = null;
    const root = new AbortController(), life = { state: 'idle', error: null };
    const aborted = (s, e) => s.aborted || e?.name === 'AbortError';
    const destroy = () => { if (dead) return; dead = true; signal?.removeEventListener('abort', destroy); gen++; life.state = 'idle'; root.abort(); };
    signal?.aborted ? destroy() : signal?.addEventListener('abort', destroy, { once: true });
    life.load = (key, fn) => {
        if (dead) return new Promise(() => {});
        last = [key, fn];
        const mine = ++gen, own = new AbortController();
        current?.abort(); current = own;
        root.signal.addEventListener('abort', () => own.abort(), { once: true });
        life.state = 'loading'; life.error = null;
        return new Promise((resolve, reject) => {
            const live = () => mine === gen && !dead;
            let p;
            try { p = Promise.resolve(fn(own.signal)); } catch (e) { p = Promise.reject(e); }
            p.then(
                data => { if (live()) { life.state = 'ready'; resolve(data); } },
                err => { if (!live() || aborted(own.signal, err)) return; life.state = 'error'; life.error = err; page?.setError?.(err); reject(err); });
        });
    };
    life.run = async (label, fn) => {
        if (dead) return undefined;
        const call = async () => { try { return await fn(root.signal); } catch (e) { if (aborted(root.signal, e)) return undefined; throw e; } };
        try { return await (page?.busy ? page.busy(call, label) : call()); } catch (e) { if (!dead) life.error = e; throw e; }
    };
    life.refresh = () => (last && !dead ? life.load(...last) : undefined);
    life.destroy = destroy;
    return life;
}

/** A mount cleanup (also a thenable, as mountTitled returns) that runs `fn` first: the lifecycle disposes with the page, whichever form the caller holds. */
export const disposeWith = (mounted, fn) => Object.assign(() => { fn(); mounted(); }, mounted.then && { then: (ok, no) => mounted.then(stop => ok(() => { fn(); stop(); }), no) });
