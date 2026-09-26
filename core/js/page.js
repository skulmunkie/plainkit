// A page's own state — not a component: the bookkeeping a concrete page (list-detail, form, a workspace pane) repeats by hand
// otherwise — a title, a status/error notice, a busy overlay around an action, and breadcrumbs — as one small object built from
// elements the host already placed in its markup. createPage never creates or owns those elements (one exception, below: the loading
// overlay); it only drives the props and slots they already expose (pk-alert's kind/heading, pk-loading-overlay's busy/label,
// pk-breadcrumb's slotted <a> trail).
// Framework-free, so a plain page and PlainKit.Blazor's PageBase (blazor/src/PlainKit.Blazor/PageBase.cs) share the same model;
// the Blazor wrapper calls the same functions from the framework's own lifecycle instead of reimplementing them.
//
//   import { createPage } from './page.js';
//   const page = createPage({
//       alert: document.querySelector('#page-alert'),
//       breadcrumb: document.querySelector('#page-crumbs'),
//       body: document.querySelector('#page-body'),   // the framework wraps this in its own pk-loading-overlay: no overlay markup
//       scope: 'orders',
//   });
//   page.setTitle('Orders');
//   page.setBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Orders' }]);
//   await page.busy(() => fetchOrders(), 'Loading orders…');
//   // a fetchOrders() rejection is logged, shown as a danger status and rethrown
//
// Busy is COUNTED: every busy action (page.busy(fn, label), or begin(label) -> end() for work that is not a promise) holds a token;
// page.isBusy is true while any token is held, so overlapping actions never clear each other. page.busyLabel is the label of the most
// recent action still running. Tokens are released in `finally` (and end() is idempotent); destroy() releases them all. Subscribe with
// page.onBusyChange(fn): fn({ busy, label }) on every change of either; it returns its unsubscribe.
//
// The overlay. Pass `overlay` (an element you placed) and it is driven exactly as before: immediately, no delay (delay and minTime
// default to 0 for it; pass them to opt in). Pass `body` (the element that holds the page) with no overlay and the framework CREATES a
// pk-loading-overlay and wraps `body` in it once, inside createPage (one element with no layout of its own: it is display:block and the
// shade is absolutely positioned, so nothing moves when it shows); destroy() unwraps and removes it. `fullscreen: true` (app scope)
// creates a fullscreen overlay appended to the document body instead and wraps nothing. A framework-owned overlay obeys two documented
// timings, both exported and both options:
//   BUSY_DELAY    (150 ms)  it appears only when busy lasts longer than this, so a fast action never flashes it;
//   BUSY_MIN_TIME (300 ms)  once shown it stays at least this long, so it never flickers.
// createPage({ body, delay: 150, minTime: 300 }). The busy region (`body`, else the overlay) gets aria-busy while any token is held; the
// overlay announces its label politely (it is a status region) and inerts what it wraps, but never traps or moves focus. Labels are text
// (the element's own label prop, rendered as text), never markup. No polling: at most two timeouts, cleared when idle and on destroy.

import { createLogger } from './log.js';

export const BUSY_DELAY = 150;
export const BUSY_MIN_TIME = 300;

// The text to show for a status or error: an Error's own message, a string as-is, anything else stringified defensively. Pure.
export function messageFor(input) {
    if (input instanceof Error) return input.message || String(input);
    if (typeof input === 'string') return input;
    try { return String(input); } catch { return 'Something went wrong.'; }
}

// { title?, alert?, overlay?, breadcrumb?, router?, scope?, body?, fullscreen?, delay?, minTime? } — each of title/alert/overlay/breadcrumb
// is an element already in the host's markup (or null to skip that concern); scope names the logger (createLogger(scope), default 'page');
// body / fullscreen / delay / minTime: see "The overlay" above. `router` is a route-tree router
// (modules/router/router.js, duck-typed: crumbs() and subscribe(fn)): the page then derives its breadcrumbs and title from the current
// route now and on every route change, and destroy() stops following it. setBreadcrumbs/setTitle still override by hand.
export function createPage({ title = null, alert = null, overlay = null, breadcrumb = null, router = null, scope = 'page', body = null, fullscreen = false, delay, minTime } = {}) {
    const log = createLogger(scope);
    const doc = globalThis.document;
    let owned = null; // the overlay this page created (and removes again)
    if (!overlay && (body || fullscreen) && doc?.createElement) {
        owned = overlay = doc.createElement('pk-loading-overlay');
        if (fullscreen) { overlay.fullscreen = true; doc.body.append(overlay); }
        else { body.replaceWith(overlay); overlay.append(body); }
    }
    const region = body ?? overlay; // where aria-busy goes
    const wait = delay ?? (owned ? BUSY_DELAY : 0);
    const hold = minTime ?? (owned ? BUSY_MIN_TIME : 0);

    function setTitle(text) {
        try { if (globalThis.document) globalThis.document.title = text; } catch { /* no document (SSR, a worker) */ }
        if (title) title.textContent = text;
    }

    function setStatus(message, { kind = 'info', heading = '' } = {}) {
        if (!alert) return;
        alert.kind = kind;
        alert.heading = heading;
        alert.textContent = message;
        alert.hidden = false;
    }

    function clearStatus() {
        if (alert) alert.hidden = true;
    }

    function setError(err, message = messageFor(err)) {
        log.error(message, err);
        setStatus(message, { kind: 'danger' });
    }

    function setBreadcrumbs(items = []) {
        if (!breadcrumb) return;
        const d = breadcrumb.ownerDocument ?? globalThis.document;
        const crumbs = items.map(({ label, href }) => {
            const a = d.createElement('a');
            a.textContent = label;
            if (href) a.href = href;
            return a;
        });
        if (breadcrumb.replaceChildren) breadcrumb.replaceChildren(...crumbs);
        else { breadcrumb.textContent = ''; for (const a of crumbs) breadcrumb.append(a); }
    }

    const tokens = []; // one entry per running busy action; the last is the most recent
    const listeners = new Set();
    let destroyed = false, shown = false, shownAt = 0, showTimer = 0, hideTimer = 0, seen = { busy: false, label: '' };

    const currentLabel = () => (tokens.length ? tokens[tokens.length - 1].label : '');

    function paint(on) {
        shown = on;
        if (!overlay) return;
        if (on) { shownAt = Date.now(); overlay.label = currentLabel(); }
        overlay.busy = on;
    }

    // Brings the overlay and aria-busy in line with the tokens: shows after the delay, hides after the minimum time.
    function settle() {
        clearTimeout(hideTimer); hideTimer = 0;
        if (tokens.length) {
            if (region?.setAttribute) region.setAttribute('aria-busy', 'true');
            if (shown && overlay) overlay.label = currentLabel();
            else if (!showTimer) {
                if (wait > 0) showTimer = setTimeout(() => { showTimer = 0; paint(true); }, wait);
                else paint(true);
            }
            return;
        }
        if (region?.removeAttribute) region.removeAttribute('aria-busy');
        clearTimeout(showTimer); showTimer = 0;
        const left = hold - (Date.now() - shownAt);
        if (shown && left > 0 && !destroyed) hideTimer = setTimeout(() => { hideTimer = 0; paint(false); }, left);
        else if (shown) paint(false);
    }

    function changed() {
        settle();
        const now = { busy: tokens.length > 0, label: currentLabel() };
        if (now.busy === seen.busy && now.label === seen.label) return;
        seen = now;
        for (const fn of [...listeners]) {
            try { fn({ ...now }); } catch (err) { log.error('an onBusyChange listener threw', err); }
        }
    }

    // begin(label) takes a busy token and returns end(), which releases it (once; a second call does nothing). Use it for work that is
    // not a promise; page.busy(fn, label) is begin/end around an async function.
    function begin(label = '') {
        if (destroyed) return () => {};
        const token = { label: String(label ?? '') };
        tokens.push(token);
        changed();
        return () => {
            const i = tokens.indexOf(token);
            if (i < 0) return;
            tokens.splice(i, 1);
            changed();
        };
    }

    // Runs fn under a busy token; a rejection is logged and shown as a status, then rethrown so the caller's own error handling
    // (a form's own field errors, for instance) still runs. The token is released in finally, so overlapping actions each hold their own.
    async function busy(fn, label = '') {
        const end = begin(label);
        try {
            return await fn();
        } catch (err) {
            setError(err);
            throw err;
        } finally {
            end();
        }
    }

    function onBusyChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function followRoute() {
        const crumbs = router.crumbs();
        setBreadcrumbs(crumbs);
        if (crumbs.length) setTitle(crumbs[crumbs.length - 1].label);
    }
    const unfollow = router ? (followRoute(), router.subscribe(followRoute)) : null;

    // Releases every token, timer and listener; hides the overlay and, when the page created it, unwraps and removes it. Safe to call twice.
    function destroy() {
        if (destroyed) return;
        destroyed = true;
        if (unfollow) unfollow();
        tokens.length = 0;
        clearTimeout(showTimer); clearTimeout(hideTimer); showTimer = hideTimer = 0;
        if (shown) paint(false);
        if (region?.removeAttribute) region.removeAttribute('aria-busy');
        listeners.clear();
        if (owned) {
            if (body) owned.replaceWith(body); else owned.remove();
            owned = null;
        }
    }

    return {
        log, setTitle, setStatus, clearStatus, setError, setBreadcrumbs, busy, begin, onBusyChange, destroy,
        get isBusy() { return tokens.length > 0; },
        get busyLabel() { return currentLabel(); },
    };
}
