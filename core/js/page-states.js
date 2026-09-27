// Shared, framework-free logic for the "not ready" content a page type shows in place of its own: loading, empty, error and forbidden -
// the same vocabulary core/js/app/boundary.js uses for a whole module, scoped instead to one page's own content region. DOM APIs only
// (attributes before upgrade, text never markup), so it works whichever of pk-skeleton/pk-empty-state/pk-alert/pk-button is defined yet,
// and needs no property write an undefined element would drop. Every page type (core/js/app/pages/*) composes this instead of hand-
// rolling its own version, so "loading/empty/error/forbidden" looks and behaves the same everywhere a page type shows it.
//
//   import { renderState } from '../js/page-states.js';
//   renderState(container, 'loading', { label: 'Loading orders' });
//   renderState(container, 'error', { description: 'The request failed.', retry: () => reload() });
//   renderState(container, 'ready');   // clears it: the page type draws its own content into `container` itself

export const STATES = Object.freeze(['ready', 'loading', 'empty', 'error', 'forbidden']);

const h = (doc, tag, attrs = {}) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== '') el.setAttribute(k, v);
    return el;
};

/** Fills `container` (cleared and redrawn each call) with the markup for `state`, or empties it for 'ready' so the caller draws its own
 * content there instead. `opts`: `label` (loading), `heading`/`description` (empty, error, forbidden), `retry` (error only: a `() => void`
 * shown as a Retry action). `heading`/`description`/`label` are always text, never markup. Throws on an unknown state (a caller mistake,
 * not a runtime condition to recover from). */
export function renderState(container, state, opts = {}) {
    if (!STATES.includes(state)) throw new TypeError(`renderState: unknown state "${state}" (one of ${STATES.join(', ')})`);
    const doc = container.ownerDocument ?? globalThis.document;
    container.replaceChildren();
    if (state === 'ready') return;
    if (state === 'loading') { container.append(h(doc, 'pk-skeleton', { variant: 'block', size: '10rem', label: opts.label || 'Loading' })); return; }
    if (state === 'empty') { container.append(h(doc, 'pk-empty-state', { heading: opts.heading || 'Nothing here yet', description: opts.description || '' })); return; }
    if (state === 'forbidden') { container.append(h(doc, 'pk-empty-state', { heading: opts.heading || 'Not allowed', description: opts.description || '' })); return; }
    const alert = h(doc, 'pk-alert', { kind: 'danger', heading: opts.heading || 'Something went wrong' });
    alert.textContent = opts.description || '';
    if (opts.retry) {
        const retry = h(doc, 'pk-button', { slot: 'action', size: 'mini', variant: 'ghost' });
        retry.textContent = 'Retry';
        retry.addEventListener('click', opts.retry);
        alert.append(retry);
    }
    container.append(alert);
}
