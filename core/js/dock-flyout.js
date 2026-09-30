// pk-dock's collapse-to-rail flyout, split out of elements/dock/dock.js (issue #639) to keep dock.js's own bundle under the blanket per-element
// gzip budget: collapsing a group to a rail button and opening it as a flyout is a less-common edge-docked-panel path than the everyday
// open/close/resize/tab dock interactions dock.js keeps for itself. Every export takes the pk-dock element instance (`el`) as its first argument
// and reads/writes the same private fields dock.js always did ($flyout); nothing here is a public API of its own.
import { place, onOutside, unplace } from './positioning.js';
import { loadElements } from './loader.js';
import { findGroup } from './dock-model.js';

// Close panel: it stops being declared to the model (updated() drops it from its group, or removes an emptied group, the same repair path a
// panel leaving the host's DOM already takes), but the host keeps the child in its light DOM, so reopening loses nothing about it.
export function closePanel(el, panel) {
    if (el.$closed.has(panel) || !el.$titles.has(panel)) return;
    const said = `${el.$titles.get(panel) ?? panel} closed`;
    el.$closed.add(panel);
    // synchronous, like a move: the redraw (a panel leaving its group, or the group itself) needs to happen before focus moves
    el.updated();
    el.part('status').textContent = said;
    el.part('toolbar').querySelector('pk-button[slot="trigger"]')?.focus?.();
}

// Reopen a closed panel: declaring it again makes updated() add it back (to a group, per the same "a declared panel the layout lacks" repair a
// panel newly appearing in the DOM already takes; no memory of its last group in this smallest version, see #432).
export function openPanel(el, panel) {
    if (!el.$closed.has(panel)) return;
    const said = `${el.$titles.get(panel) ?? panel} opened`;
    el.$closed.delete(panel);
    el.updated();
    el.part('status').textContent = said;
    el.focusPanel(panel);
}

// Focus the tab of panel after a move (or its group's Move trigger, when it landed alone with no tab strip): the accessible outcome of an
// operation is where focus goes next.
export function focusPanel(el, panel) {
    const root = el.part('root'), tab = root.querySelector(`pk-tab[value="${panel}"]`);
    if (tab) return tab.focus?.();
    const group = findGroup(el.$doc, panel), section = group && root.querySelector(`[data-node="${group.id}"]`);
    section?.querySelector('pk-button[slot="trigger"]')?.focus?.();
}

// Re-finds the rail button for an open flyout after a redraw (draw() rebuilds the tree from scratch, so the old button is gone) and repositions
// over it; closes the flyout quietly when its panel is no longer a collapsed edge group (it moved, expanded, or the layout changed under it).
export function reflyout(el) {
    if (!el.$flyout) return;
    const btn = el.part('root').querySelector?.(`[data-rail-panel="${el.$flyout}"]`);
    const flyoutEl = el.part('flyout');
    if (!btn) { el.$flyout = null; el.$o?.(); el.$o = undefined; unplace(flyoutEl); flyoutEl.hidden = true; return; }
    btn.setAttribute('aria-expanded', 'true');
    place(btn, flyoutEl, { placement: 'right-start', offset: 4 });
}

// Opens (or, on a second activation of the same rail button, closes) a panel as a flyout positioned over the content area, next to the rail button
// it belongs to. The panel stays collapsed in the model throughout: the flyout is a transient view, not a layout change, so it raises no
// pk-layout-change. Only one flyout is open at a time (a second rail button replaces it, IDE-fashion).
export function toggleFlyout(el, panel, btn) {
    if (el.$flyout === panel) { closeFlyout(el); return; }
    el.$flyout = panel;
    const flyoutEl = el.part('flyout'), x = flyoutEl.firstElementChild;
    flyoutEl.hidden = false;
    x.setAttribute('data-panel', panel);
    const slotEl = el.ownerDocument.createElement('slot');
    slotEl.setAttribute('name', panel);
    flyoutEl.replaceChildren(x, slotEl);
    loadElements(flyoutEl);
    place(btn, flyoutEl, { placement: 'right-start', offset: 4 });
    btn.setAttribute('aria-expanded', 'true');
    el.$o?.();
    el.$o = onOutside([btn, flyoutEl], ev => closeFlyout(el, ev));
}

// Closes the open flyout (a no-op when none is open). Escape returns focus to the rail button that opened it; an outside click or a blur out of
// the flyout does not steal focus back, since it has already moved somewhere the user chose.
export function closeFlyout(el, e) {
    const panel = el.$flyout;
    if (!panel) return;
    el.$flyout = null;
    el.$o?.(); el.$o = undefined;
    const flyoutEl = el.part('flyout');
    unplace(flyoutEl); flyoutEl.hidden = true;
    const btn = el.part('root').querySelector?.(`[data-rail-panel="${panel}"]`);
    btn?.setAttribute('aria-expanded', 'false');
    if (e?.type === 'keydown') btn?.focus?.();
}

// Closes when focus leaves both the flyout and its rail button (Tab out, not just a pointerdown elsewhere, which onOutside already covers).
export function onFlyoutBlur(el, e) {
    if (!el.$flyout) return;
    const flyoutEl = el.part('flyout'), btn = el.part('root').querySelector?.(`[data-rail-panel="${el.$flyout}"]`);
    const to = e.relatedTarget;
    if (to && (flyoutEl.contains?.(to) || to === btn)) return;
    closeFlyout(el);
}

// The chevron button in a single-panel header, a rail button, or the flyout's own Expand button (issue #636 - it carries the same data-panel as
// the header's collapse-toggle, since restoring from the flyout is the same expandPanel call; reflyout(), called from dock.js's draw(), then
// notices the rail button is gone and closes the now-stale flyout on its own). Enter/Space activate any of them, no extra key handling needed.
export function onToggle(el, e, collapsePanel, expandPanel) {
    const btn = e.target.closest?.('button');
    const railPanel = btn?.getAttribute('data-rail-panel');
    if (railPanel) { e.stopPropagation(); toggleFlyout(el, railPanel, btn); return; }
    const panel = btn?.getAttribute('data-panel');
    if (!panel) return;
    e.stopPropagation();
    const collapsed = (el.$doc.collapsed ?? []).includes(panel);
    const r = (collapsed ? expandPanel : collapsePanel)(el.$doc, { panel });
    if (r.doc === el.$doc) return;
    el.$doc = r.doc; el.commit('collapse');
    el.draw(Boolean(el.$mq?.matches));
    // draw() rebuilds the whole group subtree (a new button), so the one the pointer or keyboard just used is gone: without this the next Tab (or
    // the next Enter, for a screen reader user who does not re-locate the button) would land somewhere else.
    el.part('root').querySelector?.(`[data-panel="${panel}"]`)?.focus?.();
}
