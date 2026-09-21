// Declarative openers for the overlay elements, so a page needs no script to open a dialog:
//
//   <pk-button data-open="#confirm">Delete</pk-button>
//   <pk-dialog id="confirm" heading="Delete this item?"> ... <pk-button data-close>Cancel</pk-button> </pk-dialog>
//
// data-open="<selector>" calls show() on the first element the selector matches (pk-dialog, pk-drawer, pk-popover); data-toggle="<selector>"
// calls toggle() (pk-popover) and data-close hides the dialog, drawer or popover the control sits in. One delegated listener per root,
// installed by initPlainkit(); the pure resolution is exported for tests.

import { createLogger } from './log.js';

const log = createLogger('invokers');
const OVERLAYS = 'pk-dialog, pk-drawer, pk-popover';

// What a click on `target` asks for: { type: 'open' | 'toggle' | 'close', element } or null. `root` resolves selectors (a Document or Element).
export function resolveInvoker(target, root) {
    const opener = target?.closest?.('[data-open]');
    if (opener) { const element = safeQuery(root, opener.getAttribute('data-open'), 'data-open'); return element ? { type: 'open', element } : null; }
    const toggler = target?.closest?.('[data-toggle]');
    if (toggler) { const element = safeQuery(root, toggler.getAttribute('data-toggle'), 'data-toggle'); return element ? { type: 'toggle', element } : null; }
    const closer = target?.closest?.('[data-close]');
    if (closer) {
        const element = closer.closest(OVERLAYS);
        if (!element) log.warn('data-close is not inside a pk-dialog, pk-drawer or pk-popover, so it closes nothing', { control: closer.localName });
        return element ? { type: 'close', element } : null;
    }
    return null;
}

// A selector from markup can be invalid or match nothing; that is a page mistake, so it is logged (warn) and the click does nothing.
function safeQuery(root, selector, attribute) {
    if (!selector) { log.warn(`${attribute} is empty: it needs a selector such as "#dialog-id"`); return null; }
    let element = null;
    try { element = root.querySelector(selector); } catch (error) { log.warn(`${attribute}="${selector}" is not a valid selector`, error); return null; }
    if (!element) log.warn(`${attribute}="${selector}" matched no element on the page`);
    return element;
}

export function runInvoker(action) {
    if (!action) return false;
    const { type, element } = action;
    if (type === 'open') element.show?.();
    else if (type === 'toggle') element.toggle?.();
    else element.hide?.();
    return true;
}

const installed = new WeakSet();

// Installs the delegated click listener once per root (idempotent, like the other initX functions).
export function initInvokers(root = document) {
    if (installed.has(root)) return;
    installed.add(root);
    root.addEventListener('click', event => { runInvoker(resolveInvoker(event.target, root)); });
}
