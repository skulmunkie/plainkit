// pk-dock's pointer drag-to-dock and floater keyboard/focus handling, split out of elements/dock/dock.js (issue #639) to keep dock.js's own bundle
// under the blanket per-element gzip budget: this cluster (drag a header/tab onto another group, arrow-key move/resize a floater) is reached far
// less often than opening/closing/resizing a dock, so it is the first thing to move out once dock.js itself needed to shrink. Every export takes
// the pk-dock element instance (`el`) as its first argument and reads/writes the same private fields dock.js always did ($doc, $drag, $flyout is
// untouched here); nothing here is a public API of its own; it exists to be called from dock.js's own event listeners.
import { findFloater, floatDrag, dragFloater, tabDrag, raiseFloater, resizeFloater, moveFloater, groups, moveTab, dockPanel, floaters, floatPanel, dockFloating, describeMove } from './dock-model.js';

const gid = (doc, id) => groups(doc).find(g => g.id === id);
const rectStyle = (el, f) => Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, zIndex: f.z });

// Applies a proposed doc that needs a full redraw (unlike a resize or a tab choice, already reflected by the splitter/tabs just touched): commits,
// redraws (el.layout now equals el.$given, so updated()'s own redraw would no-op), announces and moves focus. Shared by applyMove, floatCmd and
// applyDockFloat. focusNext runs after the redraw, so it can look up a freshly-drawn element.
export function settle(el, doc, reason, said, focusNext) {
    el.$doc = doc;
    el.commit(reason);
    el.draw(Boolean(el.$mq?.matches));
    el.part('status').textContent = said;
    focusNext();
}

// The one place moveTab/dockPanel are called: from the Move menu (onMove) and a pointer drop (onDragEnd).
export function applyMove(el, kind, panel, group, zone) {
    const title = id => el.$titles.get(id) ?? id, targetGroup = gid(el.$doc, group);
    let r;
    if (kind === 'tab' && panel && group) r = moveTab(el.$doc, { panel, group });
    else if (kind === 'dock' && panel && group && zone) r = dockPanel(el.$doc, { panel, target: group, zone });
    else return;
    for (const p of r.problems) el.warnOnce(`move:${p.code}:${p.path}`, p.message, { code: p.code });
    if (r.doc === el.$doc) return;
    settle(el, r.doc, 'move', describeMove(kind, title(panel), title(targetGroup?.active), zone), () => el.focusPanel(panel));
}

// Panel menu's Float: floatPanel plus a small cascade so several in a row do not stack exactly, then focus follows to the new frame.
export function floatCmd(el, panel) {
    const title = el.$titles.get(panel) ?? panel, box = el.part('root').getBoundingClientRect(), n = floaters(el.$doc).length;
    const r = floatPanel(el.$doc, { panel, rect: { x: 24 + (n % 6) * 16, y: 24 + (n % 6) * 16, w: 320, h: 240 }, bounds: { w: box.width, h: box.height } });
    for (const p of r.problems) el.warnOnce(`float:${p.code}:${p.path}`, p.message, { code: p.code });
    if (r.doc === el.$doc) return;
    settle(el, r.doc, 'float', `${title} floating`, () => focusFloater(el, panel));
}

// Focuses panel's own floater frame (the keyboard move/resize handle above): the accessible next step after Float detaches it.
export function focusFloater(el, panel) {
    const f = floaters(el.$doc).find(fl => fl.group.panels.includes(panel));
    el.part('root').querySelector?.(`[data-floater="${f?.id}"]`)?.focus?.();
}

// Panel menu's "dock back in" (dockFloating); reads the active panel first, since dockFloating removes the floater.
export function applyDockFloat(el, floaterId, target, zone) {
    const f = findFloater(el.$doc, floaterId);
    if (!f) return;
    const title = id => el.$titles.get(id) ?? id, panel = f.group.active, targetGroup = gid(el.$doc, target);
    const r = dockFloating(el.$doc, { floater: floaterId, target, zone });
    for (const p of r.problems) el.warnOnce(`dockfloat:${p.code}:${p.path}`, p.message, { code: p.code });
    if (r.doc === el.$doc) return;
    settle(el, r.doc, 'dockfloat', describeMove(zone === 'center' ? 'tab' : 'dock', title(panel), title(targetGroup?.active), zone), () => el.focusPanel(panel));
}

// Applies a floater's current rect/z straight to its own element's inline style, never draw() (a mid-drag redraw would tear down the element the
// pointer just captured).
export function paintFloat(el, id) {
    const f = findFloater(el.$doc, id), node = el.part('root').querySelector?.(`[data-floater="${id}"]`);
    if (f && node) rectStyle(node, f);
}

// Applies a floater doc change straight to its element's own inline style (no draw()): the in-place counterpart of dock.js's settle(), used for a
// floater's own live position/size/z. said, if given, updates the status live region too.
export function paint(el, doc, id, reason, said) {
    el.$doc = doc;
    paintFloat(el, id);
    el.commit(reason);
    if (said) el.part('status').textContent = said;
}

export function grab(el, handle, id) { try { handle.setPointerCapture(id); } catch (err) { el.debug?.('pointer capture refused (no synthetic pointer active)', err); } }

// Pointer drag-to-dock: the same moveTab/dockPanel calls the Move menu makes. Pointer capture is set right away (like pk-sortable-item), but
// nothing else happens (no overlay, no preventDefault) until the pointer actually moves, so a plain click still selects a tab. A floater has no
// separate title bar element: its own group() header (or tab strip) already shows the title, so that same element doubles as the drag-to-move
// handle, plus a corner .floater-resize grip.
export function onDragStart(el, e) {
    if (e.button > 0 || e.target.closest?.('pk-dropdown, pk-button')) return;
    const floaterEl = e.target.closest?.('[data-floater]');
    if (floaterEl) {
        const grip = e.target.closest?.('.floater-resize'), handle = grip || e.target.closest?.('pk-tab, [part="header"]');
        const id = handle && floaterEl.getAttribute('data-floater'), f = id && findFloater(el.$doc, id);
        if (!f) return;
        e.stopPropagation();
        el.$doc = raiseFloater(el.$doc, { floater: id }).doc;
        paintFloat(el, id);
        grab(el, handle, e.pointerId);
        el.$drag = floatDrag(f, grip, e.pointerId, e.clientX, e.clientY);
        el.$drag.handle = handle;
        return;
    }
    if (el.$phoneStrip || groups(el.$doc).length < 2) return;
    const tab = e.target.closest?.('pk-tab');
    const handle = tab || e.target.closest?.('[part="header"]');
    const groupEl = handle?.closest?.('[data-node]');
    const groupId = groupEl?.getAttribute('data-node');
    const group = groupId && gid(el.$doc, groupId);
    if (!group) return;
    const panel = tab ? tab.getAttribute('value') : group.active;
    if (!panel) return;
    grab(el, handle, e.pointerId);
    el.$drag = tabDrag(panel, groupId, e.pointerId, e.clientX, e.clientY);
    el.$drag.handle = handle;
}

export function clearDropZone(el) { el.part('root').querySelectorAll?.('[drop-zone]')?.forEach(node => node.removeAttribute('drop-zone')); }

// Past a small movement threshold (a click is never mistaken for a drag), hit-test the group under the pointer with shadowRoot.elementFromPoint
// (e.target stays pinned to the captured handle) and mark its zone, or clear the mark over no group, a splitter, or the panel's own group.
export function onDragMove(el, e, dropZone) {
    const d = el.$drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.float) {
        e.preventDefault();
        const box = el.part('root').getBoundingClientRect();
        const r = dragFloater(el.$doc, { floater: d.id, start: d, dx: e.clientX - d.sx, dy: e.clientY - d.sy, resize: d.resize, bounds: { w: box.width, h: box.height } });
        if (r.doc !== el.$doc) { el.$doc = r.doc; paintFloat(el, d.id); }
        return;
    }
    if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
        d.moved = true;
        el.toggleAttribute('dragging', true);
    }
    e.preventDefault();
    const hit = el.shadowRoot.elementFromPoint?.(e.clientX, e.clientY);
    const groupEl = hit?.closest?.('[data-node]');
    const groupId = groupEl?.getAttribute('data-node');
    const group = groupId && groupId !== d.from && gid(el.$doc, groupId);
    if (!group) { clearDropZone(el); d.target = null; d.zone = null; return; }
    const zone = dropZone(groupEl.getBoundingClientRect(), e.clientX, e.clientY);
    if (groupId === d.target && zone === d.zone) return;
    clearDropZone(el);
    d.target = groupId; d.zone = zone;
    groupEl.setAttribute('drop-zone', zone);
}

// Zone center is moveTab, any edge is dockPanel, exactly like the matching Move menu item. Never moved, cancelled, or nowhere valid: no-op. A
// floater drag/resize has no drop zone to resolve: onDragMove already applied it live, so ending the gesture is just a settling commit.
export function onDragEnd(el, e) {
    const d = el.$drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.handle?.hasPointerCapture?.(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
    el.$drag = null;
    if (d.float) return el.commit('floater');
    el.toggleAttribute('dragging', false);
    clearDropZone(el);
    if (!d.moved || e.type === 'pointercancel' || !d.target) return;
    applyMove(el, d.zone === 'center' ? 'tab' : 'dock', d.panel, d.target, d.zone);
}

// Arrow keys on a floater's own frame move it by a step (Shift for a bigger one, like pk-splitter's own keys); Alt resizes instead. Only when the
// frame itself has focus, not a descendant. paint(), not a redraw, keeps focus on the frame the key press just moved.
export function onFloatKeys(el, e) {
    const target = e.target.closest?.('[data-floater]');
    if (!target || e.target !== target) return;
    const id = target.getAttribute('data-floater'), f = findFloater(el.$doc, id);
    if (!f) return;
    const step = e.shiftKey ? 32 : 8, resizing = e.altKey;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    const box = el.part('root').getBoundingClientRect(), bounds = { w: box.width, h: box.height };
    const r = resizing ? resizeFloater(el.$doc, { floater: id, w: f.w + dx, h: f.h + dy, bounds }) : moveFloater(el.$doc, { floater: id, x: f.x + dx, y: f.y + dy, bounds });
    if (r.doc === el.$doc) return;
    const moved = r.doc.floating.find(x => x.id === id), title = el.$titles.get(f.group.active) ?? f.group.active;
    const said = resizing ? `${title} resized to ${Math.round(moved.w)} by ${Math.round(moved.h)}` : `${title} moved to ${Math.round(moved.x)}, ${Math.round(moved.y)}`;
    paint(el, r.doc, id, resizing ? 'resize' : 'move', said);
}

// Focusing anything inside a floater raises it, the focus mirror of onDragStart's raise-on-grab.
export function onFloatFocus(el, e) {
    const id = e.target.closest?.('[data-floater]')?.getAttribute('data-floater');
    if (!id) return;
    const r = raiseFloater(el.$doc, { floater: id });
    if (r.doc !== el.$doc) paint(el, r.doc, id, 'raise');
}
