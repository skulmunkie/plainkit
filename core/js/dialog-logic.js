// The part of the dialog family (dialog, drawer, command palette, lightbox) that is not menu logic, in its own module so a page with a dialog does not
// download the menu keyboard and typeahead helpers of js/menu-logic.js (issue 1644).
// Shared by the elements that host a native <dialog> (dialog, drawer, command palette, lightbox): keep the dialog in step with the `open`
// prop, ask before closing (a cancelable pk-close the Blazor side may veto), and clean up the top layer when the element leaves the page.
export function syncDialog(el, dlg) {
    if (el.open && !dlg.open && el.isConnected) { if (el.docked) dlg.show(); else dlg.showModal(); el.emit('pk-open', {}); }
    else if (!el.open && dlg.open) { dlg.$sync = true; dlg.close(); el.dispatchEvent(new Event('close')); }
}

// A close request: the host hears a cancelable pk-close first; a controlled element (Blazor owns `open`) never closes itself, it waits for open to change.
export const requestClose = (el, reason) => el.emit('pk-close', { reason }) && !el.controlled;

export function wireDialog(el, dlg, { backdrop = false } = {}) {
    dlg.addEventListener('cancel', e => { if (!requestClose(el, 'escape')) e.preventDefault(); });
    dlg.addEventListener('close', () => { if (dlg.$sync) { dlg.$sync = false; return; } if (el.open) el.open = false; el.dispatchEvent(new Event('close')); });
    if (backdrop) dlg.addEventListener('click', e => { if (e.target === dlg && backdrop() && requestClose(el, 'backdrop')) el.open = false; });
    if (el.docked !== undefined) dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && el.docked && requestClose(el, 'escape')) el.open = false; });
    el.shadowRoot.addEventListener('click', e => { if (e.target.closest?.('[data-action="close"]') && requestClose(el, 'close')) el.open = false; });
}
