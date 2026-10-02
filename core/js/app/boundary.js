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
//
// The boundary alert's text is untrusted (#378, security tenet): a rejected import or a throwing mount/page can carry a raw message with internal
// detail (a stack path, backend text), so it is never shown as-is. `failureText` shows it only when the error opts in (`err.userFacing === true`,
// the same idea as PlainKit.Blazor's IPkUserFacingException, js/tasks.js's own failureText) or when the 'app' scope's log level is 'debug' (the same
// switch host.js already reads with `isLogEnabled('debug', 'app')`, set with configureLogging, ?pk-log=debug or data-pk-log="debug"); every error is
// always logged in full at the call site regardless, so nothing is lost for a developer. A host-authored message (the timeout text, host.js `within`)
// is marked userFacing itself, since it never carries anything but the timeout it already announces.
import { messageFor } from '../page.js';
import { isLogEnabled } from '../log.js';
import { h } from './shell.js';

export const BOUNDARY_FAILED_TEXT = 'Something went wrong loading this part of the app. Try again.';

// The text to show for a boundary error: its own message when it is marked userFacing or the 'app' scope logs at debug, else the generic text. Pure but
// for the log-level check.
export const failureText = err => ((err && err.userFacing === true) || isLogEnabled('debug', 'app') ? messageFor(err) : BOUNDARY_FAILED_TEXT);

// A boundary state: a pk-empty-state whose heading is also the page's one level 1 title (#859). app.js focuses `h1,pk-heading[level="1"]` after a route change, and the
// empty state's own heading lives in its shadow tree, out of that query's reach, so the same text goes in the empty state's heading slot as a focusable pk-heading level 1
// (the way page-shell.js titleHeading does for the page types). The slot replaces the attribute's text, so the heading is drawn once; level 1 makes the heading wrapper agree.
const titled = (doc, attrs) => {
    const state = h(doc, 'pk-empty-state', { ...attrs, level: 1 });
    state.append(h(doc, 'pk-heading', { slot: 'heading', level: 1, variant: 'h3', tabindex: -1 }, attrs.heading));
    return state;
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
    const state = (heading, description, tone = 'error') => { clear(); body.replaceChildren(titled(doc, { heading, description, tone, announce: '' })); rendered(); };
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
            const retry = h(doc, 'pk-button', { slot: 'action', variant: 'secondary' }, 'Retry');
            retry.addEventListener('click', onRetry);
            error.setAttribute('heading', heading);
            error.textContent = `${failureText(err)}${globalThis.navigator?.onLine === false ? ' You appear to be offline.' : ''}`;
            error.append(retry);
            error.hidden = false;
            if (!body.firstChild) body.replaceChildren(titled(doc, { heading: 'Nothing to show', description: 'This part of the app did not load.', tone: 'compact' }));
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
