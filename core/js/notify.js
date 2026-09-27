// Notifications (#373, step of the app framework #346): short messages as pk-toast in the bottom-end pk-toast-stack, the SAME stack the task manager uses (js/tasks.js,
// toastStack()). Framework-free (no import but the logger and that helper), so a page, the module host and a plain script share it.
//
//   import { createNotify } from './notify.js';
//   const notify = createNotify({ container });
//   notify.success('Order saved');                            // title, details?, opts?
//   notify.error('Could not sync', 'The server did not answer.', { duration: 0 });
//   const h = notify.warn('Low stock'); h.dismiss();
//
// Kinds: info and success last INFO_DURATION (4 s), warn WARN_DURATION (8 s), error is sticky until dismissed; opts.duration overrides (0 = sticky). pk-toast runs
// that timer itself and pauses it on hover and focus, so the manager owns no timer. The stack's own `max` decides how many show at once; the rest wait in order (the
// stack's queue). `max` here (default MAX_KEPT) caps how many notifications are kept, shown plus waiting: past it the oldest is dismissed. An identical
// notification (same kind and title) raised again within DEDUPE_WINDOW (2 s) while the first is still up is not stacked twice: the first is returned, its
// details updated. Text is untrusted: heading and message are set as properties (the element renders them as text), never markup.
//
// Scopes. notify.scope() returns { info, success, warn, error, end } for a page or module. end() (it unmounts) LETS ITS NOTIFICATIONS FINISH: a message such as "Order
// saved" stays true after the page is left, so it keeps its toast and its timer; later calls through the ended scope are ignored (logged). destroy() on the manager
// removes every toast it made and the stack when it created it. A bad call is logged, never thrown: a notification can never break the page that raised it.
import { createLogger } from './log.js';
import { toastStack } from './tasks.js';

export const INFO_DURATION = 4000;
export const WARN_DURATION = 8000;
export const DEDUPE_WINDOW = 2000;
export const MAX_KEPT = 5;
const KINDS = { info: ['info', INFO_DURATION], success: ['success', INFO_DURATION], warn: ['warning', WARN_DURATION], error: ['danger', 0] };
const clip = (v, n) => String(v ?? '').slice(0, n);

export function createNotify({ container, log = createLogger('notify'), position = 'bottom-end', max = MAX_KEPT, dedupe = DEDUPE_WINDOW, load } = {}) {
    const doc = container?.ownerDocument ?? globalThis.document;
    const live = []; // oldest first: { key, at, toast, off, handle }
    let stack = null, own = false, dead = false;

    const drop = n => { const i = live.indexOf(n); if (i >= 0) live.splice(i, 1); n.toast.removeEventListener('pk-dismiss', n.off); };
    function show(kind, title, details, opts = {}) {
        if (dead) return null;
        try {
            const [k, auto] = KINDS[kind], head = clip(title, 200), text = clip(details, 500), key = `${kind}\n${head}`, now = Date.now();
            if (!head.trim()) throw new TypeError(`notify.${kind} needs a title`);
            const same = live.find(n => n.key === key && now - n.at < dedupe);
            if (same) { if (text && same.toast.message !== text) same.toast.message = text; return same.handle; }
            if (!stack?.isConnected) ({ stack, own } = toastStack(doc, container, position));
            const toast = doc.createElement('pk-toast');
            toast.kind = k; toast.heading = head; toast.message = text;
            toast.duration = Number.isFinite(opts?.duration) && opts.duration >= 0 ? opts.duration : auto;
            const n = { key, at: now, toast, handle: { dismiss: () => toast.dismiss?.('method'), get open() { return live.includes(n); } } };
            n.off = () => drop(n);
            toast.addEventListener('pk-dismiss', n.off);
            live.push(n);
            while (live.length > Math.max(1, max)) { const old = live[0]; drop(old); old.toast.remove(); }
            stack.append(toast);
            load?.(stack);
            return n.handle;
        } catch (e) {
            log.error(`notify.${kind} could not show "${clip(title, 80)}"`, e);
            return null;
        }
    }
    const api = gate => Object.fromEntries(Object.keys(KINDS).map(kind => [kind, (t, d, o) => (gate() ? show(kind, t, d, o) : null)]));

    return {
        ...api(() => true),
        scope() {
            let ended = false;
            return { ...api(() => !ended || (log.warn('a notification after the end of its scope was ignored'), false)), end() { ended = true; } };
        },
        destroy() {
            if (dead) return;
            dead = true;
            for (const n of [...live]) { drop(n); n.toast.remove(); }
            if (own) stack?.remove();
            stack = null;
        },
        get active() { return live.length; },
    };
}
