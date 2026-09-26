// The loading and error boundaries of an app module (#349): the DOM a module lives in, and what shows instead of it when it is loading, failed, denied or not found.
// Built from SDK elements only, with attributes and textContent (no markup strings, no properties set on an element that may not be upgraded yet), so it does not
// depend on which elements are defined when it is created. The host (js/app/host.js) owns one boundary per app container.
//
//   <pk-stack data-pk-app>
//     <pk-alert kind="danger" heading="...">message <pk-button slot="action">Retry</pk-button></pk-alert>   the boundary error (import failed, mount threw, page threw)
//     <pk-alert>                                                                                              the page's own status (createPage alert: ctx.page.setError)
//     <pk-loading-overlay>                                                                                    covers the previous module while the next one loads (page.js begin/end)
//       <div data-pk-app-body>...</div>                                                                       the page host, or a skeleton, or the denied / not-found state
// A module's ctx.page wraps the body in its own pk-loading-overlay (createPage's `body` option) while the module is mounted.
import { messageFor } from '../page.js';

const h = (doc, tag, attrs = {}) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
};

// `rendered()` is called after the boundary drew something new (so the host can load the elements it uses: none is created defined).
export function createBoundary(doc, rendered = () => {}) {
    const error = h(doc, 'pk-alert', { kind: 'danger' });
    const status = h(doc, 'pk-alert');
    const busy = h(doc, 'pk-loading-overlay');
    const body = h(doc, 'div', { 'data-pk-app-body': '' });
    error.hidden = status.hidden = true;
    busy.append(body);
    const root = h(doc, 'pk-stack', { gap: 'md', 'data-pk-app': '' });
    root.append(error, status, busy);

    const clear = () => { error.hidden = true; error.replaceChildren(); };
    const state = (heading, description, tone = 'error') => { clear(); body.replaceChildren(h(doc, 'pk-empty-state', { heading, description, tone, announce: '' })); rendered(); };
    return {
        root, body, status, busy,
        // A module is loading: with nothing shown yet a skeleton holds the space; otherwise the previous module stays (the host covers it with the busy overlay).
        loading(title, first) {
            clear();
            if (first) { body.replaceChildren(h(doc, 'pk-skeleton', { variant: 'block', size: '16rem', label: `Loading ${title}` })); rendered(); }
        },
        // Whatever was loading is done (the page host replaces the body itself).
        ready: clear,
        // A boundary error: heading, the error's message, and Retry (onRetry). The shell and the other modules keep working; the body is left as it is.
        fail(heading, err, onRetry) {
            clear();
            const retry = h(doc, 'pk-button', { slot: 'action', variant: 'secondary' });
            retry.textContent = 'Retry';
            retry.addEventListener('click', onRetry);
            error.setAttribute('heading', heading);
            error.textContent = `${messageFor(err)}${globalThis.navigator?.onLine === false ? ' You appear to be offline.' : ''}`;
            error.append(retry);
            error.hidden = false;
            if (!body.firstChild) body.replaceChildren(h(doc, 'pk-empty-state', { heading: 'Nothing to show', description: 'This part of the app did not load.', tone: 'compact' }));
            rendered();
        },
        forbidden: title => state('Not allowed', `You do not have access to ${title}.`),
        notFound: text => state('Not found', text, 'boxed'),
        dispose() { root.remove(); },
    };
}

// Runs load() with a timeout (ms) and `retries` more attempts, waiting backoff * 2^n ms between them. `wait(ms)` and `within(promise, ms)` are the host's tracked timers;
// `alive()` turns false when the request was superseded or the host destroyed, which stops the loop. Rejects with the last error.
export async function loadWithRetry(load, { retries, backoff, timeout, wait, within, alive, log }) {
    for (let n = 0; ; n++) {
        try {
            return await within(Promise.resolve().then(load), timeout);
        } catch (err) {
            if (n >= retries || !alive()) throw err;
            log.warn(`module import failed (${messageFor(err)}), retrying in ${backoff * 2 ** n} ms`, err);
            await wait(backoff * 2 ** n);
            if (!alive()) throw err;
        }
    }
}
