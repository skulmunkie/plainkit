// Plainkit menu logic: the keyboard decisions shared by <pk-dropdown>, <pk-context-menu> and <pk-select>. Pure, so they can be
// tested without a DOM. Items are the enabled rows in order; `current` is the focused index (-1 when none).
//
// Keys: ArrowDown/Up (wrap), Home/End, typeahead (a letter jumps to the next label starting with it; typing more narrows), ArrowRight
// opens a submenu and ArrowLeft closes it, Escape closes and returns focus to the trigger, Tab closes, Enter/Space choose.

export const TYPEAHEAD_RESET = 600;

// Whether an element can take part in keyboard navigation.
export const isEnabled = el => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && !el.hidden;

// Next index for a movement key over `count` enabled items, or null for any other key.
export function nextIndex(current, count, key) {
    if (count <= 0) return null;
    switch (key) {
        case 'ArrowDown': return current < 0 ? 0 : (current + 1) % count;
        case 'ArrowUp': return current < 0 ? count - 1 : (current - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
}

// Index of the label a typed buffer selects, or -1. A repeated single letter cycles through matches; a longer buffer matches a prefix,
// starting at the current item so the selection does not jump while you keep typing.
export function typeaheadIndex(labels, current, buffer) {
    const b = buffer.toLowerCase();
    if (!b || labels.length === 0) return -1;
    const repeated = [...b].every(c => c === b[0]);
    const needle = repeated ? b[0] : b;
    const start = repeated ? current + 1 : Math.max(current, 0);
    for (let i = 0; i < labels.length; i++) {
        const at = (((start + i) % labels.length) + labels.length) % labels.length;
        if (labels[at].trim().toLowerCase().startsWith(needle)) return at;
    }
    return -1;
}

// The typeahead buffer after a key: it restarts once TYPEAHEAD_RESET ms have passed since the last one.
export const typeaheadBuffer = (buffer, key, sinceLastMs) => (sinceLastMs > TYPEAHEAD_RESET ? key : buffer + key);

// The state an item takes when chosen: a checkbox flips, a radio becomes checked, others are unchanged.
export function checkedAfter(role, checked) {
    if (role === 'menuitemcheckbox') return !checked;
    if (role === 'menuitemradio') return true;
    return checked;
}

// What a key does inside a menu: 'move', 'open-sub', 'close-sub', 'close' (Escape, refocus the trigger), 'tab-close', 'choose', 'type', or null.
export function keyAction(key, { hasSubmenu = false, inSubmenu = false, modified = false } = {}) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return 'move';
    if (key === 'ArrowRight' && hasSubmenu) return 'open-sub';
    if (key === 'ArrowLeft' && inSubmenu) return 'close-sub';
    if (key === 'Escape') return inSubmenu ? 'close-sub' : 'close';
    if (key === 'Tab') return 'tab-close';
    if (key === 'Enter' || key === ' ') return 'choose';
    if (key.length === 1 && !modified) return 'type';
    return null;
}

// A row's label text for typeahead and for the value pk-select reports: its text without the description slot, which is a secondary line, not part of the name.
export const labelOf = el => (el.querySelector?.(':scope > [slot="description"]') ? Array.from(el.childNodes).filter(n => n.nodeType !== 1 || n.getAttribute('slot') !== 'description').map(n => n.textContent).join('') : el.textContent);

// DOM side of the keyboard model, shared by the dropdown, the context menu, submenus and the select list. `items` are the enabled elements
// in order; `label(el)` gives the text typeahead matches. Returns true when the key was a movement or typeahead key (and was handled).
// `state` is a { buffer, at } object kept by the caller between keys.
export function moveFocus(event, items, state, label = labelOf, focus = el => el.focus({ preventScroll: true })) {
    const at = items.indexOf(event.target.closest?.('pk-menu-item, [role="option"]') ?? event.target);
    const to = nextIndex(at, items.length, event.key);
    if (to !== null) { event.preventDefault(); focus(items[to]); return true; }
    if (keyAction(event.key, { modified: event.ctrlKey || event.metaKey || event.altKey }) !== 'type' || event.key === ' ') return false;
    const now = Date.now();
    state.buffer = typeaheadBuffer(state.buffer ?? '', event.key, now - (state.at ?? 0));
    state.at = now;
    const hit = typeaheadIndex(items.map(label), at, state.buffer);
    if (hit >= 0) { event.preventDefault(); focus(items[hit]); }
    return true;
}

// Only a same-site path or an http(s) link may be navigated to from a menu row or a command.
export const safeLink = href => (typeof href === 'string' && href && !(/^[\w+.-]+:/.test(href) && !/^https?:/i.test(href)) ? href : null);

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
