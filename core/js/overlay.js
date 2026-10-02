// Shared by the overlays whose trigger is slotted (pk-dropdown, pk-popover). The slotted trigger may be a wrapper (the display: contents span the
// Blazor wrapper adds): it cannot take focus and is not the control assistive technology sees, so the real control inside it gets both.

// The element that carries aria-haspopup and aria-expanded: the trigger itself, or the first focusable descendant of a display: contents wrapper.
export const triggerControl = t => (t && globalThis.getComputedStyle?.(t).display === 'contents' ? t.querySelector('button, a[href], input, select, textarea, [tabindex]') ?? t : t);

// Gives focus back to the trigger, or to the first descendant that holds it when the trigger is a wrapper.
export function focusTrigger(t) {
    if (!t) return;
    const held = () => t.matches?.(':focus-within') !== false;
    t.focus({ preventScroll: true });
    if (!held()) for (const d of t.querySelectorAll('*')) { d.focus({ preventScroll: true }); if (held()) return; }
}
