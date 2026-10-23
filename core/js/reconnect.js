// The Blazor Server reconnect policy as pure logic (#1714, phase 1; design: docs/superpowers/specs/2026-10-22-blazor-reconnect-ui-design.md). No DOM and no globals: `createReconnect(env, options)` gets
// everything it touches (clock, timers, storage, a probe, reload, resume, a view callback) from the caller, so node tests drive it and the Blazor wrapper (phase 2) supplies the browser.
// Fed with the `detail` of the framework's `components-reconnect-state-changed` event (.NET 10; section 8 of the design lists the measured states), it tells the caller what to draw (`onView`)
// and does the reloading: a visible countdown for a circuit that is gone (`rejected`, `resume-failed`), a probe with backoff for `failed` under `autoReload: 'always'`, and a loop guard.
// Blazor-only: shipped in the Blazor package, not the npm one. The ownership rules hold: every timer is cleared on `hide` and `dispose`, a late probe answer is ignored.
import { createLogger } from './log.js';

const log = createLogger('reconnect');

export const STATES = Object.freeze(['show', 'retrying', 'failed', 'rejected', 'resume-failed', 'paused', 'hide']);
export const DEFAULTS = Object.freeze({
    autoReload: 'gone',                      // 'never' | 'gone' (rejected, resume-failed) | 'always' (also probes after failed)
    countdown: 5,                            // seconds shown before an automatic reload
    steps: Object.freeze([1, 2, 4, 8, 15, 30]), jitter: 0.2, window: 300000, // probe delays (s), +/- fraction, how long to keep probing (ms)
    maxReloads: 3, reloadWindow: 60000,      // loop guard
    storageKey: 'pk-reconnect-reloads',
    strings: Object.freeze({ // the English defaults; {0} is the number. A Blazor app overrides any of them (PkReconnectStrings).
        busy: 'Reconnecting...', attemptLabel: 'Attempt {0}', failed: 'Cannot reach the server', stillTrying: 'Still trying', ended: 'This session ended', reloadIn: 'Reloading in {0} s', paused: 'Paused',
        blocked: 'Reloading automatically did not help. Reload the page yourself.', tryNow: 'Retry now', reload: 'Reload', cancel: 'Cancel', resume: 'Resume',
    }),
});

/** The probe delay in ms before attempt `i` (0-based): the steps, then the last one, spread by +/- jitter. `rand` is in [0, 1). */
export const backoffDelay = (i, o = DEFAULTS, rand = Math.random) => Math.round(o.steps[Math.min(i, o.steps.length - 1)] * 1000 * (1 + (rand() * 2 - 1) * o.jitter));

/** At most `maxReloads` automatic reloads per `reloadWindow`, remembered in `storage` (sessionStorage); storage that throws or holds junk never blocks. */
export function createGuard(storage, now, o = DEFAULTS) {
    const read = () => {
        try { const a = JSON.parse(storage?.getItem(o.storageKey) ?? '[]'); return Array.isArray(a) ? a.filter(t => Number.isFinite(t) && now() - t < o.reloadWindow) : []; }
        catch (e) { log.debug('the reload counter is unreadable; allowing', e); return []; }
    };
    return {
        allow: () => read().length < o.maxReloads,
        record() { try { storage?.setItem(o.storageKey, JSON.stringify([...read(), now()])); } catch (e) { log.debug('the reload counter cannot be saved', e); } },
    };
}

/** env: { now, rand, setTimeout, clearTimeout, visible(), storage, probe(): Promise<boolean>, reload(), resume(), onView(view|null) }. View: { kind: busy|failed|ended|paused, text, live, attempt, countdown, blocked, gaveUp }. */
export function createReconnect(env, options = {}) {
    const o = { ...DEFAULTS, ...options, strings: { ...DEFAULTS.strings, ...options.strings } }, guard = createGuard(env.storage, env.now, o);
    let timer = null, gen = 0, state = null, attempt = null, view = null;
    const stop = () => { gen++; if (timer !== null) env.clearTimeout(timer); timer = null; };
    const show = v => { view = v; env.onView(v); };
    const autoReload = () => { if (!guard.allow()) return false; guard.record(); env.reload(); return true; };
    const reloadNow = () => { guard.record(); env.reload(); };

    const countdown = left => {
        if (left <= 0) { if (!autoReload()) show({ ...view, countdown: null, blocked: true, text: o.strings.blocked, live: 'alert' }); return; }
        show({ ...view, countdown: left }); timer = env.setTimeout(() => countdown(left - 1), 1000);
    };
    const probe = (i, started, g) => {
        if (env.now() - started >= o.window) { show({ ...view, gaveUp: true, text: o.strings.failed }); return; }
        timer = env.setTimeout(async () => {
            if (g !== gen) return;
            if (!env.visible()) { probe(i, started, g); return; } // only while the tab is shown; the delay is not spent
            let ok = false;
            try { ok = await env.probe(); } catch (e) { log.debug('a probe failed', e); }
            if (g !== gen) return; // hidden, changed or disposed while the request ran
            if (ok) { if (!autoReload()) show({ ...view, blocked: true, text: o.strings.blocked, live: 'alert' }); } else probe(i + 1, started, g);
        }, backoffDelay(i, o, env.rand));
    };

    return {
        onState(detail) {
            const s = detail?.state;
            if (!STATES.includes(s)) return;
            const n = detail.currentAttempt ?? null;
            if ((s === 'show' || s === 'retrying') && (state === 'show' || state === 'retrying') && n === attempt) return; // the countdown ticks of one attempt are not new announcements
            state = s; attempt = n; stop();
            if (s === 'hide') { show(null); return; }
            if (s === 'show' || s === 'retrying') { show({ kind: 'busy', text: o.strings.busy, live: 'status', attempt: n }); return; }
            if (s === 'paused') { show({ kind: 'paused', text: o.strings.paused, live: 'status' }); return; }
            if (s === 'failed') { show({ kind: 'failed', text: o.strings.failed, live: 'alert' }); if (o.autoReload === 'always') probe(0, env.now(), gen); return; }
            show({ kind: 'ended', text: o.strings.ended, live: 'alert', countdown: null }); // rejected, resume-failed: the circuit is gone
            if (o.autoReload !== 'never') countdown(o.countdown);
        },
        /** Stops the automatic reload (the Cancel button); the view stays, with no countdown. */
        cancel() { stop(); if (view?.countdown != null) show({ ...view, countdown: null }); },
        reloadNow, resume: () => env.resume(),
        dispose() { stop(); state = null; view = null; },
    };
}
