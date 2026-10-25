// The selection layer of pk-canvas (#430 phase C3), loaded the first time `selectable` is set. Items are the host's light-DOM children that declare a world rect
// (data-id with data-x, data-y, data-w, data-h, or the host's `geometry(el)` callback, which wins); the canvas never writes to them. This layer
//   - draws a frame around each selected item in the shadow tree (from the numbers, no layout read while the view moves),
//   - selects on a click (the canvas's pk-canvas-pick), toggles with Shift, Ctrl or Cmd, selects every item with Ctrl+A, clears with Escape,
//   - selects an item that takes keyboard focus (Tab walks the items in DOM order; the items bring their own tab stops),
//   - draws a marquee while a primary-button drag runs over bare ground in mode="select" and selects what it touches,
//   - moves the selection with the arrow keys (one grid step, Shift ten, Alt one screen pixel) through a cancelable pk-canvas-move the page answers by writing the item back (not when readonly),
// and says what changed in the canvas's live region. The host owns the `selection` property (an array of ids); this layer sets it and emits pk-canvas-select.
import { declaredRect, between, marquee, combine, toFrame, fromFrame, moved, nudge } from './canvas-geometry.js';
import { adopt } from './canvas-style.js';

export function mount(host) {
    adopt(host, 'select');
    const frame = host.part('frame'), layer = host.part('selection'), box = host.part('marquee'), status = host.part('status');
    layer.hidden = false;
    let drag = null;
    // The items that declare geometry: [{ id, el, x, y, w, h }].
    const items = () => [...host.querySelectorAll('[data-id]')].flatMap(el => { const r = typeof host.geometry === 'function' ? host.geometry(el) : declaredRect(el); return r ? [{ id: el.dataset.id, el, ...r }] : []; });
    const view = () => ({ x: host.panX, y: host.panY, zoom: host.zoom });
    const put = (n, r) => { for (const [k, v] of Object.entries({ left: r.x, top: r.y, width: r.w, height: r.h })) n.style.setProperty(k, `${v}px`); };
    const say = ids => { status.textContent = ids.length === 0 ? 'Selection cleared' : ids.length === 1 ? '1 item selected' : `${ids.length} items selected`; };
    // Set the selection, tell the page and the screen reader; nothing happens when it did not change.
    const set = ids => {
        const cur = host.selection;
        if (ids.length === cur.length && ids.every((id, i) => id === cur[i])) return;
        host.selection = ids;
        host.emit('pk-canvas-select', { ids }, { cancelable: false });
        say(ids);
    };
    const local = e => { const r = frame.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const marqueeIds = (a, b) => marquee(items(), fromFrame(view(), between(a.x, a.y, b.x, b.y)));
    const idOf = el => el?.closest?.('[data-id]')?.dataset.id;
    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const round = v => Math.round(v * 100) / 100;
    // Ask the page to move the selection by (dx, dy) world units: a cancelable pk-canvas-move with the new positions (the page writes them back; the
    // canvas never writes to items). `done` is false while a drag runs and true when the move is complete; only a complete, uncancelled move is announced.
    const move = (dx, dy, done) => {
        const moves = moved(items(), host.selection, dx, dy);
        if (!moves.length) return false;
        if (host.emit('pk-canvas-move', { moves, done }) && done) status.textContent = moves.length === 1 ? `Moved to ${round(moves[0].x)}, ${round(moves[0].y)}` : `Moved ${moves.length} items`;
        return true;
    };

    const onPick = e => {
        const id = idOf(e.detail.target);
        if (id !== undefined) set(combine(host.selection, [id], e.detail.additive));
        else if (!e.detail.additive) set([]);
    };
    const onDown = e => { if (host.$mq && e.isPrimary) drag = { id: e.pointerId, from: local(e), on: false }; };
    const onMove = e => {
        if (!drag || e.pointerId !== drag.id) return;
        const p = local(e);
        if (!drag.on && Math.hypot(p.x - drag.from.x, p.y - drag.from.y) < 4) return;
        drag.on = true; box.hidden = false;
        put(box, between(drag.from.x, drag.from.y, p.x, p.y));
    };
    const onUp = e => {
        if (!drag || e.pointerId !== drag.id) return;
        const { on, from } = drag;
        drag = null; box.hidden = true;
        if (on && e.type === 'pointerup') set(combine(host.selection, marqueeIds(from, local(e)), e.shiftKey || e.ctrlKey || e.metaKey));
    };
    // Captured so a handled key does not also reach the canvas's own handler (Escape clears first and is only reported when nothing is selected).
    const onKey = e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.target.matches?.('input, textarea, select, [contenteditable]')) set(items().map(i => i.id));
        else if (e.key === 'Escape' && host.selection.length) set([]);
        else if (ARROWS[e.key] && !host.readonly && !e.ctrlKey && !e.metaKey && host.selection.length && !e.target.matches?.('input, textarea, select, [contenteditable]')) {
            const d = nudge(host.steps().minor, host.zoom, e), [ux, uy] = ARROWS[e.key];
            if (!move(ux * d, uy * d, true)) return;
        }
        else return;
        e.preventDefault(); e.stopImmediatePropagation();
    };
    // Not while a pointer is down: a click selects (or toggles) through the pick.
    const onFocus = e => { const id = idOf(e.target); if (id !== undefined && !host.selection.includes(id) && !host.$pts.size) set([id]); };

    host.addEventListener('pk-canvas-pick', onPick);
    host.addEventListener('focusin', onFocus);
    frame.addEventListener('keydown', onKey, true);
    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerup', onUp);
    frame.addEventListener('pointercancel', onUp);
    return {
        // One frame per selected item that still exists and declares geometry.
        draw() {
            const sel = new Set(host.selection), v = view();
            layer.replaceChildren(box, ...items().filter(i => sel.has(i.id)).map(i => { const d = document.createElement('div'); d.dataset.sel = ''; put(d, toFrame(v, i)); return d; }));
        },
        stop() {
            host.removeEventListener('pk-canvas-pick', onPick);
            host.removeEventListener('focusin', onFocus);
            frame.removeEventListener('keydown', onKey, true);
            for (const [t, f] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]]) frame.removeEventListener(t, f);
            layer.replaceChildren(box); layer.hidden = true; box.hidden = true;
        },
    };
}
