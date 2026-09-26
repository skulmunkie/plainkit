// A task manager with progress toasts (#372, step of the app framework #346): the framework runs long work and shows it as one toast per task in the bottom-end
// pk-toast-stack (title, details, progress, Cancel, Retry). The consumer supplies only the work. Framework-free (no import but the logger), so a page, the module host
// and a plain script share it.
//
//   import { createTasks } from './tasks.js';
//   const tasks = createTasks({ busy: page.begin });          // busy: label => end(), a blocking task holds a busy token (js/page.js)
//   const h = tasks.run({
//       title: 'Importing orders', details: 'Reading the file…',
//       cancellable: true,                                    // it honours ctx.signal; only then does the toast offer Cancel and unmount cancel it
//       retry: true,                                          // a failure offers Retry, which runs the same task again
//       timeout: 60000,                                       // optional; the task ends failed ("Timed out") and its signal aborts
//       blocking: false,                                      // true: also holds a busy token, so the page overlay shows
//       async run(ctx) { for (…) { await step(ctx.signal); ctx.progress(i, n); ctx.details(`Row ${i} of ${n}`); } return result; },
//   });
//   h.id; h.state; h.cancel(); await h.promise;               // promise ALWAYS resolves: { state: 'done'|'failed'|'cancelled', value?, error? } (it never rejects)
//
// States: queued -> running -> done | failed | cancelled (a queued task can be cancelled before it starts). At most `concurrency` (default 3, MAX_RUNNING) run at
// once; the rest wait in order. ctx.progress(value, max = 100) sets a determinate bar (without a call the bar is indeterminate), ctx.details(text) the second line,
// ctx.signal is an AbortSignal (aborted by cancel, timeout and destroy). Calls after the task ended are ignored. handle.cancel() works only for cancellable tasks
// (returns whether it did): a task that ignores its signal is not offered a Cancel button.
//
// Rendering is COMPOSED from existing elements, no element API: a pk-toast (heading = title, kind info while running, success, warning when cancelled, danger when failed,
// duration 0 = sticky) whose default slot holds a details line and a pk-progress (inline, sm, label = the state, value readout when determinate) and whose action slot holds
// pk-button Cancel or Retry. The toast is created once and UPDATED IN PLACE (properties and textContent), never re-created. The stack is the page's
// pk-toast-stack[position=bottom-end] (the shell's), else one is created in `container` and removed again by destroy(); the stack's own `max` decides how many show.
// After success the toast dismisses itself after DONE_DELAY (3 s, held while the pointer or focus is on it); cancelled after the same; a failure stays until dismissed
// (close button or Escape). While a task is queued or running the toast cannot be dismissed (its close button is hidden), so the work is never lost from view.
//
// Announcements (accessibility): the toast is a polite status region (role=status), the danger toast of a failure is role=alert (pk-toast's own rule). The bar's value
// is not announced while the task runs (aria-live=off on it, the native progressbar semantics stay), and its final label and value are when it ends; the details line is written at most every DETAILS_INTERVAL (1 s) and the bar at most
// every PROGRESS_INTERVAL (250 ms), the newest value wins, so a task calling ctx.progress in a loop costs one paint per interval and never a flood of announcements.
// State changes (running, done, failed, cancelled) are always written at once.
//
// Text is untrusted: title, details and errors go in with textContent and properties only, never markup. An error's own message is shown ONLY when it has
// userFacing === true; any other failure shows FAILED_TEXT and the detail goes to the SDK logger (issue 378 discusses the policy).
//
// Scopes. tasks.scope({ busy?, log? }) returns { run, end } for a page or module: tasks run through it are that scope's. end() (the page or module unmounts) CANCELS its
// cancellable tasks and DETACHES the rest: they continue, keep their toast, and stop holding the scope's busy token. destroy() on the manager cancels what it can,
// stops every timer and removes every toast it owns. No polling: progress is pushed by the task; the timers are one per task (paint), one for the timeout and one for the auto-dismiss, each cleared when done.
import { createLogger } from './log.js';

export const MAX_RUNNING = 3;
export const DONE_DELAY = 3000;
export const PROGRESS_INTERVAL = 250;
export const DETAILS_INTERVAL = 1000;
export const FAILED_TEXT = 'This task failed. Try again, or check the log.';
const TERMINAL = ['done', 'failed', 'cancelled'];
const LABEL = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };
const KIND = { queued: 'info', running: 'info', done: 'success', failed: 'danger', cancelled: 'warning' };
const clip = (v, n) => String(v ?? '').slice(0, n);

// The text to show for an error: its own message only when it is marked userFacing === true, else the generic text. Pure.
export const failureText = err => (err && err.userFacing === true && typeof err.message === 'string' && err.message ? clip(err.message, 500) : FAILED_TEXT);

export function createTasks({ container, busy, log = createLogger('tasks'), concurrency = MAX_RUNNING, position = 'bottom-end', max, doneDelay = DONE_DELAY, load } = {}) {
    const doc = container?.ownerDocument ?? globalThis.document;
    const limit = Number.isInteger(concurrency) && concurrency > 0 ? concurrency : MAX_RUNNING;
    const live = new Set(), queue = [], views = new Set();
    let running = 0, seq = 0, stack = null, ownStack = false, dead = false;

    function stackEl() {
        if (stack?.isConnected !== false && stack) return stack;
        stack = doc.querySelector?.(`pk-toast-stack[position="${position}"]`) ?? null;
        ownStack = false;
        if (!stack) {
            stack = doc.createElement('pk-toast-stack');
            stack.setAttribute('position', position);
            if (max > 0) stack.max = max;
            (container ?? doc.body).append(stack);
            ownStack = true;
        }
        return stack;
    }

    // ---- the toast of one task: built once, updated in place ----
    function makeView(task) {
        const toast = doc.createElement('pk-toast'), details = doc.createElement('div'), bar = doc.createElement('pk-progress');
        toast.heading = task.title; toast.duration = 0; toast.noClose = true;
        bar.setAttribute('inline', ''); bar.setAttribute('size', 'sm'); bar.setAttribute('aria-live', 'off'); bar.indeterminate = false;
        toast.append(details, bar);
        const v = { toast, details, bar, action: null, timer: 0, done: 0, lastPaint: -Infinity, lastDetails: -Infinity };
        toast.addEventListener('pk-dismiss', v.onDismiss = e => {
            // pk-toast turns a click on an action button into a dismiss with reason 'action': that is Cancel or Retry, and the toast itself stays
            if (e.detail?.reason === 'action') { e.preventDefault(); v.act?.(); return; }
            if (task.terminal) close(v); else e.preventDefault(); // a queued or running toast cannot be dismissed
        });
        toast.addEventListener('keydown', v.onKey = e => { if (e.key === 'Escape' && task.terminal) toast.dismiss?.('close'); });
        views.add(v);
        stackEl().append(toast);
        load?.(stack);
        return v;
    }
    function close(v) {
        clearTimeout(v.timer); clearTimeout(v.done); v.timer = v.done = 0;
        v.toast.removeEventListener?.('pk-dismiss', v.onDismiss); v.toast.removeEventListener?.('keydown', v.onKey);
        views.delete(v);
    }
    function button(label) {
        const b = doc.createElement('pk-button');
        b.slot = 'action'; b.setAttribute('variant', 'ghost'); b.setAttribute('size', 'mini'); b.textContent = label;
        return b;
    }
    // Writes what changed to the toast (each property only when it differs, so an unchanged update touches nothing).
    function paint(task, { state = false } = {}) {
        const v = task.view, now = Date.now();
        if (!v) return;
        v.lastPaint = now;
        const set = (el, k, val) => { if (el[k] !== val) el[k] = val; };
        if (state) {
            const s = task.state;
            set(v.toast, 'kind', KIND[s]); set(v.toast, 'noClose', !task.terminal);
            set(v.bar, 'label', LABEL[s]);
            v.bar.setAttribute('variant', s === 'done' ? 'ok' : s === 'failed' ? 'danger' : s === 'cancelled' ? 'warn' : 'accent');
            if (task.terminal) v.bar.removeAttribute('aria-live'); // the end of the task is announced (label and value), unlike the churn while it runs
            v.action?.remove(); v.action = v.act = null;
            if ((s === 'running' || s === 'queued') && task.cancellable) { v.action = button('Cancel'); v.act = task.cancel; }
            else if (s === 'failed' && task.spec.retry) { v.action = button('Retry'); v.act = task.retry; }
            if (v.action) v.toast.append(v.action);
            if (s === 'failed') task.text = failureText(task.error);
            if (s === 'cancelled') task.text = ''; // the state label says it
            if (s === 'queued' && !task.text) { task.text = 'Waiting for a free slot.'; task.placeholder = true; }
        }
        const determinate = task.value !== null;
        set(v.bar, 'indeterminate', !determinate && task.state === 'running');
        if (determinate) { set(v.bar, 'max', task.max); set(v.bar, 'value', task.value); } else if (task.state === 'queued') set(v.bar, 'value', 0);
        set(v.bar, 'showValue', determinate || task.state === 'queued');
        if (now - v.lastDetails >= DETAILS_INTERVAL || state) { set(v.details, 'textContent', task.text); v.details.hidden = !task.text; v.lastDetails = state ? -Infinity : now; task.textDirty = false; }
        else if (task.textDirty) arm(task, DETAILS_INTERVAL - (now - v.lastDetails));
    }
    function arm(task, wait) {
        const v = task.view;
        if (!v || v.timer || task.terminal) return;
        v.timer = setTimeout(() => { v.timer = 0; paint(task); }, Math.max(0, wait));
    }
    function touch(task) { // called by ctx.progress / ctx.details: paint now if the interval has passed, else once at its end
        const v = task.view;
        if (!v || task.terminal) return;
        const wait = PROGRESS_INTERVAL - (Date.now() - v.lastPaint);
        if (wait <= 0 && !v.timer) paint(task); else arm(task, wait);
    }
    function leave(task) { // the auto-dismiss of a finished toast, held back while the pointer or focus is on it
        const v = task.view;
        if (!v) return;
        v.done = setTimeout(() => {
            v.done = 0;
            if (v.toast.matches?.(':hover, :focus-within')) leave(task); else v.toast.dismiss?.('timeout');
        }, doneDelay);
    }

    // ---- the task itself ----
    function finish(task, state, value, error) {
        if (task.terminal) return;
        task.state = state; task.terminal = true; task.error = error ?? null; task.value = state === 'done' ? task.max : task.value;
        clearTimeout(task.tid); task.tid = 0;
        task.scope?.mine.delete(task);
        if (task.view) { clearTimeout(task.view.timer); task.view.timer = 0; }
        task.endBusy?.(); task.endBusy = null;
        live.delete(task);
        const i = queue.indexOf(task);
        if (i >= 0) queue.splice(i, 1); else if (task.started) running--;
        if (state === 'failed') log.error(`task "${task.title}" failed`, error);
        paint(task, { state: true });
        if (state !== 'failed') leave(task);
        task.resolve({ state, ...(state === 'done' ? { value } : {}), ...(state === 'failed' ? { error } : {}) });
        pump();
    }
    function start(task) {
        task.started = true; running++;
        task.state = 'running';
        if (task.placeholder) { task.text = clip(task.spec.details, 500); task.placeholder = false; }
        if (task.spec.blocking && !task.endBusy) task.endBusy = task.busy?.(task.title) ?? null;
        paint(task, { state: true });
        const ctx = {
            signal: task.ac.signal,
            progress(value, maxv = 100) { if (task.terminal) return; const ok = Number.isFinite(value) && Number.isFinite(maxv) && maxv > 0; task.value = ok ? value : null; task.max = ok ? maxv : 100; touch(task); },
            details(text) { if (task.terminal) return; task.text = clip(text, 500); task.textDirty = true; touch(task); },
        };
        if (task.spec.timeout > 0) task.tid = setTimeout(() => { task.tid = 0; task.ac.abort(); finish(task, 'failed', undefined, Object.assign(new Error(`Timed out after ${Math.round(task.spec.timeout / 1000)} s.`), { userFacing: true })); }, task.spec.timeout);
        (async () => task.spec.run(ctx))().then(v => finish(task, 'done', v), e => finish(task, 'failed', undefined, e));
    }
    function pump() {
        while (!dead && running < limit && queue.length) start(queue.shift());
    }

    function run(spec, sc = null) {
        if (dead) throw new Error('createTasks: the manager was destroyed');
        if (!spec || typeof spec.run !== 'function' || typeof spec.title !== 'string' || !spec.title.trim()) throw new TypeError('tasks.run needs { title: string, run(ctx) }');
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        const task = { id: `task-${++seq}`, spec, title: clip(spec.title, 200), state: 'queued', terminal: false, started: false, cancelled: false, cancellable: spec.cancellable === true, ac: new AbortController(),
            value: null, max: 100, text: clip(spec.details, 500), textDirty: false, error: null, tid: 0, endBusy: null, view: null, scope: sc, busy: sc?.busy ?? busy, resolve };
        task.cancel = () => {
            if (task.terminal || !task.cancellable) return false;
            task.cancelled = true; task.ac.abort();
            finish(task, 'cancelled');
            return true;
        };
        task.retry = () => { if (task.state === 'failed' && spec.retry) { task.view?.toast.dismiss?.('method'); return run(spec, task.scope); } return null; };
        const handle = { id: task.id, promise, cancel: task.cancel, retry: task.retry, get state() { return task.state; } };
        live.add(task); sc?.mine.add(task);
        queue.push(task);
        try { task.view = makeView(task); } catch (e) { log.error('could not show the toast of a task; it runs without one', e); }
        paint(task, { state: true });
        pump();
        return handle;
    }

    function scope({ busy: b } = {}) {
        const sc = { busy: b ?? busy, mine: new Set() };
        return {
            run: spec => run(spec, sc),
            end() {
                for (const t of [...sc.mine]) {
                    if (t.cancellable && !t.terminal) t.cancel();
                    else { t.endBusy?.(); t.endBusy = null; t.busy = null; t.scope = null; } // detached: it continues and keeps its toast
                }
                sc.mine.clear();
            },
        };
    }

    function destroy() {
        if (dead) return;
        dead = true;
        for (const t of [...live]) { if (t.cancellable) t.cancel(); else { t.ac.abort(); clearTimeout(t.tid); t.endBusy?.(); t.endBusy = null; } t.view = null; t.scope = null; }
        queue.length = 0; live.clear();
        for (const v of [...views]) { close(v); v.toast.remove(); }
        if (ownStack) stack.remove();
        stack = null;
    }

    return { run, scope, destroy, get active() { return live.size; }, get running() { return running; } };
}
