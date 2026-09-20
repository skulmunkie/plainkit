// Plainkit overlay behaviour: Escape closes, focus is trapped while open and restored on close,
// and the element gets the dialog semantics. Framework-free; no imports.
//
// Vanilla use: put data-pk-overlay on a .modal-card or .flyout-panel, toggle its `hidden` attribute (or the
// data-pk-open attribute on a trigger: data-pk-open="#id"), and call initOverlays() once.
// Host-framework use: attachOverlay(element, { onClose }) and call the returned detach() when it goes away.

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'summary',
].join(',');

const stack = [];
let listening = false;
let idCounter = 0;

export function focusableWithin(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => !el.hidden && el.getClientRects().length > 0);
}

// Where Tab should land. Pure so it can be tested without a DOM: index of the focused element in the
// focusable list (-1 = outside), the list length, and whether Shift is held. Returns the index to focus,
// or null to let the browser move focus normally.
export function tabTarget(activeIndex, count, shift) {
    if (count === 0) return -1;
    if (activeIndex === -1) return shift ? count - 1 : 0;
    if (shift && activeIndex === 0) return count - 1;
    if (!shift && activeIndex === count - 1) return 0;
    return null;
}

function onKeydown(event) {
    const top = stack.findLast(entry => entry.holdFocus);
    if (!top) return;

    if (event.key === 'Escape') {
        event.stopPropagation();
        top.onClose?.();
        return;
    }

    if (event.key !== 'Tab') return;
    const items = focusableWithin(top.element);
    const target = tabTarget(items.indexOf(document.activeElement), items.length, event.shiftKey);
    if (target === null) return;
    event.preventDefault();
    (target === -1 ? top.element : items[target]).focus();
}

function ensureLabel(element) {
    if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) return;
    const heading = element.querySelector('h1, h2, h3, [data-pk-title]');
    if (!heading) return;
    if (!heading.id) heading.id = `pk-title-${++idCounter}`;
    element.setAttribute('aria-labelledby', heading.id);
}

export function attachOverlay(element, options = {}) {
    if (!element) return { detach() {} };
    const restoreTo = document.activeElement;

    // holdFocus:false is for a docked or backdrop-less inspector that leaves the page usable: no focus hold, no Escape capture, no aria-modal.
    const holdFocus = options.holdFocus !== false;
    // A modal's outer .modal-overlay is only the dimmed backdrop; the dialog is the card inside it.
    const dialog = element.querySelector(':scope > .modal-card') ?? element;
    if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
    if (holdFocus) dialog.setAttribute('aria-modal', 'true');
    ensureLabel(dialog);
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');

    const entry = { element, onClose: options.onClose, holdFocus };
    stack.push(entry);
    if (!listening) {
        document.addEventListener('keydown', onKeydown, true);
        listening = true;
    }

    if (holdFocus) {
        const autofocus = element.querySelector('[autofocus]');
        (autofocus ?? focusableWithin(element)[0] ?? element).focus({ preventScroll: true });
    }

    return {
        detach() {
            const at = stack.indexOf(entry);
            if (at >= 0) stack.splice(at, 1);
            if (stack.length === 0 && listening) {
                document.removeEventListener('keydown', onKeydown, true);
                listening = false;
            }
            if (holdFocus && restoreTo && restoreTo.isConnected && typeof restoreTo.focus === 'function') restoreTo.focus({ preventScroll: true });
        },
    };
}

// Bridge for a host framework: `remote` is any object with invokeMethodAsync('Close'), called when Escape closes the overlay.
export function attachRemote(element, remote, options = {}) {
    return attachOverlay(element, { ...options, onClose: () => remote.invokeMethodAsync('Close') });
}

// Vanilla wiring: an element with data-pk-overlay is "open" while it is not [hidden]; a data-pk-open
// trigger shows its target, a data-pk-close control (or Escape) hides the nearest overlay.
export function initOverlays(root = document) {
    const handles = new WeakMap();

    // A flyout panel's backdrop is the sibling before it; it shows and hides with the panel.
    const backdrop = el => { const b = el.previousElementSibling; return b?.classList.contains('flyout-backdrop') ? b : null; };
    const show = el => {
        if (!el || !el.hidden) return;
        el.hidden = false;
        const bd = backdrop(el); if (bd) bd.hidden = false;
        handles.set(el, attachOverlay(el, { onClose: () => hide(el) }));
    };
    const hide = el => {
        if (!el || el.hidden) return;
        el.hidden = true;
        const bd = backdrop(el); if (bd) bd.hidden = true;
        handles.get(el)?.detach();
        handles.delete(el);
    };

    root.addEventListener('click', event => {
        const opener = event.target.closest('[data-pk-open]');
        if (opener) {
            show(root.querySelector(opener.getAttribute('data-pk-open')));
            return;
        }
        if (event.target.closest('[data-pk-close]')) hide(event.target.closest('[data-pk-overlay]'));
    });

    root.querySelectorAll('[data-pk-overlay]').forEach(el => { el.hidden = true; });
}
