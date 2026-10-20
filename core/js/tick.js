// A repeating call that cannot pile up: `every(ms, fn, { signal })` runs fn, waits ms after it SETTLES (an async fn never overlaps itself), runs it again, and returns stop().
// Aborting `signal` stops it too. A throwing or rejecting fn is logged (the SDK logger) and the next tick still runs: a polling label survives one failed poll.
// The first call is after one period, not at once. Not in the app entry graph: Blazor's PkComponentBase.RunEveryAsync imports it through the bridge (#1665).
import { createLogger } from './log.js';

const log = createLogger('tick');

export function every(ms, fn, { signal } = {}) {
    let dead = false, timer = null; const gap = Math.max(1, Number(ms) || 1);
    const stop = () => { dead = true; clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    const run = async () => {
        try { await fn(); } catch (e) { log.error('a tick threw; the next one still runs', e); }
        if (!dead) timer = setTimeout(run, gap);
    };
    if (signal?.aborted) stop(); else { signal?.addEventListener('abort', stop, { once: true }); timer = setTimeout(run, gap); }
    return stop;
}
