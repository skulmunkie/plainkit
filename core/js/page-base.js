// The page-only base mixin and its helpers (#1929 step 2; STANDARDS "Page types", rule 6). PkElement stays frozen: this wraps an element class
// and adds methods a page calls itself; nothing here is a hook PkElement calls, except that disconnected() is wrapped to end the runs.
// Not in the app entry graph: the page-type chunks that use it import it. A test caps its size (core/tests/page-base.test.mjs).
//   export default Base => class extends pageBase(Base) { ... }
//   this.once(() => { wire(); loadElements(this.shadowRoot); });       // the body runs for the first call only, however often the element connects
//   const data = await this.startRun(key, async signal => load(signal)); // a newer startRun (or leaving the page) supersedes this one: it never settles
// startRun is createLifecycle's load, one lifecycle per element, destroyed (work aborted, late results dropped) when the element disconnects and
// made again on the next connect. Pass `page` (createPage(...) or anything with setError/busy) once per element to get the standard error state.
import { createLifecycle } from './page-lifecycle.js';

const done = new WeakSet(), lives = new WeakMap();

/** Run `fn` the first time it is called for `host`; later calls do nothing and return false. Rule 5: connect wiring is idempotent. */
export const once = (host, fn) => {
    if (done.has(host)) return false;
    done.add(host);
    fn();
    return true;
};

/** The element's current lifecycle (made on first use). `page` is read only when it is made. */
export const runsOf = (host, page) => {
    let life = lives.get(host);
    if (!life) lives.set(host, life = createLifecycle({ page: page ?? host.page ?? null }));
    return life;
};

/** Start a run: state 'loading' synchronously, the earlier run aborted, a superseded or destroyed result never delivered. */
export const startRun = (host, key, fn, page) => runsOf(host, page).load(key, fn);

/** End every run of `host` (abort, drop late results). The next startRun makes a fresh lifecycle. */
export const endRuns = host => { lives.get(host)?.destroy(); lives.delete(host); };

/** The one static-mode rule (STANDARDS "Static slotted pages"): `test()` is asked until it says yes; once static, always static. */
export const decideStatic = (host, test) => host.$static ||= !!test();

export const pageBase = Base => class extends Base {
    once(fn) { return once(this, fn); }
    startRun(key, fn, page) { return startRun(this, key, fn, page); }
    get runs() { return runsOf(this); }
    disconnected() { endRuns(this); super.disconnected?.(); }
};
