// A page's own state — not a component: the bookkeeping a concrete page (list-detail, form, a workspace pane) repeats by hand
// otherwise — a title, a status/error notice, a busy overlay around an action, and breadcrumbs — as one small object built from
// elements the host already placed in its markup. createPage never creates or owns those elements; it only drives the props and
// slots they already expose (pk-alert's kind/heading, pk-loading-overlay's busy/label, pk-breadcrumb's slotted <a> trail).
// Framework-free, so a plain page and PlainKit.Blazor's PageBase (blazor/src/PlainKit.Blazor/PageBase.cs) share the same model;
// the Blazor wrapper calls the same functions from the framework's own lifecycle instead of reimplementing them.
//
//   import { createPage } from './page.js';
//   const page = createPage({
//       alert: document.querySelector('#page-alert'),
//       overlay: document.querySelector('#page-overlay'),
//       breadcrumb: document.querySelector('#page-crumbs'),
//       scope: 'orders',
//   });
//   page.setTitle('Orders');
//   page.setBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Orders' }]);
//   await page.busy(() => fetchOrders(), 'Loading orders…');
//   // a fetchOrders() rejection is logged, shown as a danger status and rethrown

import { createLogger } from './log.js';

// The text to show for a status or error: an Error's own message, a string as-is, anything else stringified defensively. Pure.
export function messageFor(input) {
    if (input instanceof Error) return input.message || String(input);
    if (typeof input === 'string') return input;
    try { return String(input); } catch { return 'Something went wrong.'; }
}

// { title?, alert?, overlay?, breadcrumb?, router?, scope? } — each of title/alert/overlay/breadcrumb is an element already in the host's
// markup (or null to skip that concern); scope names the logger (createLogger(scope), default 'page'). `router` is a route-tree router
// (modules/router/router.js, duck-typed: crumbs() and subscribe(fn)): the page then derives its breadcrumbs and title from the current
// route now and on every route change, and destroy() stops following it. setBreadcrumbs/setTitle still override by hand.
export function createPage({ title = null, alert = null, overlay = null, breadcrumb = null, router = null, scope = 'page' } = {}) {
    const log = createLogger(scope);

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
        const doc = breadcrumb.ownerDocument ?? globalThis.document;
        const crumbs = items.map(({ label, href }) => {
            const a = doc.createElement('a');
            a.textContent = label;
            if (href) a.href = href;
            return a;
        });
        if (breadcrumb.replaceChildren) breadcrumb.replaceChildren(...crumbs);
        else { breadcrumb.textContent = ''; for (const a of crumbs) breadcrumb.append(a); }
    }

    // Runs fn under the busy overlay (if one was given); a rejection is logged and shown as a status, then rethrown so the
    // caller's own error handling (a form's own field errors, for instance) still runs.
    async function busy(fn, label = '') {
        if (overlay) { overlay.label = label; overlay.busy = true; }
        try {
            return await fn();
        } catch (err) {
            setError(err);
            throw err;
        } finally {
            if (overlay) overlay.busy = false;
        }
    }

    function followRoute() {
        const crumbs = router.crumbs();
        setBreadcrumbs(crumbs);
        if (crumbs.length) setTitle(crumbs[crumbs.length - 1].label);
    }
    const unfollow = router ? (followRoute(), router.subscribe(followRoute)) : null;

    function destroy() { if (unfollow) unfollow(); }

    return { log, setTitle, setStatus, clearStatus, setError, setBreadcrumbs, busy, destroy };
}
