// Dialog open/close wiring, apart from js/menu-logic.js so a dialog page skips the menu helpers (#1644).
// Shared by the elements that host a native <dialog> (dialog, drawer, command palette, lightbox): keep the dialog in step with the `open`
// prop, ask before closing (a cancelable pk-close the Blazor side may veto), and clean up the top layer when the element leaves the page.
const closed = el => el.dispatchEvent(new Event('close'));
export function syncDialog(el, dlg) {
    if (el.open && !dlg.open && el.isConnected) { el.docked ? dlg.show() : dlg.showModal(); el.emit('pk-open', {}); }
    else if (!el.open && dlg.open) { dlg.$sync = true; dlg.close(); closed(el); }
}

// A close request: the host hears a cancelable pk-close first; a controlled element (Blazor owns `open`) never closes itself, it waits for open to change.
export const requestClose = (el, reason) => el.emit('pk-close', { reason }) && !el.controlled;

export function wireDialog(el, dlg, { backdrop = false } = {}) {
    const shut = reason => requestClose(el, reason) && (el.open = false);
    dlg.addEventListener('cancel', e => requestClose(el, 'escape') || e.preventDefault());
    dlg.addEventListener('close', () => { if (dlg.$sync) dlg.$sync = false; else { el.open &&= false; closed(el); } });
    if (backdrop) dlg.addEventListener('click', e => e.target === dlg && backdrop() && shut('backdrop'));
    if (el.docked !== undefined) dlg.addEventListener('keydown', e => e.key === 'Escape' && el.docked && shut('escape'));
    el.shadowRoot.addEventListener('click', e => e.target.closest?.('[data-action="close"]') && shut('close'));
}
