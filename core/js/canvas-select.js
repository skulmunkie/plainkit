// The selection layer of pk-canvas (#430 phase C3), loaded the first time `selectable` is set. Items are the host's light-DOM children that declare a world rect
// (data-id with data-x, data-y, data-w, data-h, or the host's `geometry(el)` callback, which wins); the canvas never writes to them. This layer
//   - draws a frame around each selected item in the shadow tree (from the numbers, no layout read while the view moves),
//   - selects on a click (the canvas's pk-canvas-pick), toggles with Shift, Ctrl or Cmd, selects every item with Ctrl+A, clears with Escape,
//   - selects an item that takes keyboard focus (Tab walks the items in DOM order; the items bring their own tab stops),
//   - draws a marquee while a primary-button drag runs over bare ground in mode="select" and selects what it touches,
//   - moves the selection with the arrow keys (one grid step, Shift ten, Alt one screen pixel) through a cancelable pk-canvas-move the page answers by writing the item back (not when readonly),
//   - moves the selection when an already selected item is dragged (pk-canvas-move with done false while it runs, done true at the end; Escape puts it back),
//   - draws eight resize handles on a single selected item; dragging one asks for a new rect through a cancelable pk-canvas-resize (Shift keeps the ratio, Alt the centre, Escape puts it back),
//   - snaps a dragged selection to what `snap` lists (grid, guides, edges, centres of the other items and the `targets` property), drawing the lines that hold it, and draws the `guides`,
// and says what changed in the canvas's live region. The host owns the `selection` property (an array of ids); this layer sets it and emits pk-canvas-select.
import { declaredRect, between, marquee, combine, toFrame, fromFrame, moved, nudge, handles, resizeRect } from './canvas-geometry.js';
import { snapRect } from './canvas-snap.js';
import { adopt } from './canvas-style.js';

export function mount(host) {
    adopt(host, 'select');
    const frame = host.part('frame'), layer = host.part('selection'), box = host.part('marquee'), status = host.part('status');
    layer.hidden = false;
    let drag = null, grab = null, size = null;     // drag: the marquee; grab: a selected item being moved; size: a handle being dragged
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
    const move = (dx, dy, done, base = items()) => {
        const moves = moved(base, host.selection, dx, dy);
        if (!moves.length) return false;
        if (host.emit('pk-canvas-move', { moves, done }) && done) status.textContent = moves.length === 1 ? `Moved to ${round(moves[0].x)}, ${round(moves[0].y)}` : `Moved ${moves.length} items`;
        return true;
    };

    const onPick = e => {
        const id = idOf(e.detail.target);
        if (id !== undefined) set(combine(host.selection, [id], e.detail.additive));
        else if (!e.detail.additive) set([]);
    };
    const onDown = e => {
        const handle = e.target.dataset?.handle;
        if (handle) {
            const it = e.isPrimary && !host.readonly && host.selection.length === 1 && items().find(i => i.id === host.selection[0]);
            if (it) { size = { id: e.pointerId, name: handle, from: local(e), base: { x: it.x, y: it.y, w: it.w, h: it.h }, item: it.id, on: false }; frame.setPointerCapture?.(e.pointerId); }
            return;
        }
        if (host.$mq && e.isPrimary) drag = { id: e.pointerId, from: local(e), on: false };
        const id = idOf(e.target);
        if (e.isPrimary && e.button === 0 && !host.readonly && id !== undefined && host.selection.includes(id)) grab = { id: e.pointerId, from: local(e), on: false, base: items() };
    };
    // The pointer distance since the press, in world units.
    const by = (g, p) => [(p.x - g.from.x) / host.zoom, (p.y - g.from.y) / host.zoom];
    // Ask the page to resize the one selected item: a cancelable pk-canvas-resize with its new world rect (the page writes it back). No pointer: the original rect.
    const resize = (s, p, done, e) => {
        const [dx, dy] = p ? by(s, p) : [0, 0];
        const r = resizeRect(s.base, s.name, dx, dy, { min: 1, ratio: !!e?.shiftKey, centre: !!e?.altKey });
        if (host.emit('pk-canvas-resize', { id: s.item, ...r, done }) && done) status.textContent = `Resized to ${round(r.w)} by ${round(r.h)}`;
    };
    // Snap lines shown while a drag is held by them ([{ axis, at }] in world units); drawn by draw().
    let held = [];
    const lines = h => { held = h; api.draw(); };
    // The pointer delta (world units) after snapping the box around the moving selection to what `snap` lists; the threshold is in screen pixels.
    const snapped = (g, d) => {
        const on = new Set(String(host.snap || '').split(/\s+/).filter(Boolean)), mine = g.base.filter(i => host.selection.includes(i.id));
        if (!on.size || !mine.length) return d;
        const x = Math.min(...mine.map(i => i.x)), y = Math.min(...mine.map(i => i.y));
        const rect = { x: x + d[0], y: y + d[1], w: Math.max(...mine.map(i => i.x + i.w)) - x, h: Math.max(...mine.map(i => i.y + i.h)) - y };
        const others = [...g.base.filter(i => !host.selection.includes(i.id)), ...(Array.isArray(host.targets) ? host.targets : [])];
        const r = snapRect(rect, { grid: on.has('grid') ? host.steps().minor : 0, guides: on.has('guides') && Array.isArray(host.guides) ? host.guides : [], targets: others, threshold: (host.snapThreshold ?? 6) / host.zoom, edges: on.has('edges'), centres: on.has('centres') });
        lines(r.hits);
        return [d[0] + r.rect.x - rect.x, d[1] + r.rect.y - rect.y];
    };
    const onMove = e => {
        if (size && e.pointerId === size.id) {
            const p = local(e);
            if (!size.on && Math.hypot(p.x - size.from.x, p.y - size.from.y) < 2) return;
            size.on = true;
            resize(size, p, false, e);
            return;
        }
        if (grab && e.pointerId === grab.id) {
            const p = local(e);
            if (!grab.on && Math.hypot(p.x - grab.from.x, p.y - grab.from.y) < 4) return;
            grab.on = true;
            move(...snapped(grab, by(grab, p)), false, grab.base);
            return;
        }
        if (!drag || e.pointerId !== drag.id) return;
        const p = local(e);
        if (!drag.on && Math.hypot(p.x - drag.from.x, p.y - drag.from.y) < 4) return;
        drag.on = true; box.hidden = false;
        put(box, between(drag.from.x, drag.from.y, p.x, p.y));
    };
    const onUp = e => {
        if (size && e.pointerId === size.id) { const s = size; size = null; if (s.on) resize(s, e.type === 'pointerup' ? local(e) : null, true, e); return; }
        if (grab && e.pointerId === grab.id) {
            const g = grab;
            grab = null;
            if (g.on) { move(...(e.type === 'pointerup' ? snapped(g, by(g, local(e))) : [0, 0]), true, g.base); lines([]); }      // a cancelled pointer puts it back
            return;
        }
        if (!drag || e.pointerId !== drag.id) return;
        const { on, from } = drag;
        drag = null; box.hidden = true;
        if (on && e.type === 'pointerup') set(combine(host.selection, marqueeIds(from, local(e)), e.shiftKey || e.ctrlKey || e.metaKey));
    };
    // Captured so a handled key does not also reach the canvas's own handler (Escape clears first and is only reported when nothing is selected).
    const onKey = e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.target.matches?.('input, textarea, select, [contenteditable]')) set(items().map(i => i.id));
        else if (e.key === 'Escape' && size?.on) { const s = size; size = null; resize(s, null, true); }
        else if (e.key === 'Escape' && grab?.on) { const g = grab; grab = null; move(0, 0, true, g.base); lines([]); }
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
    const api = {
        // One frame per selected item that still exists and declares geometry.
        draw() {
            const sel = new Set(host.selection), v = view(), shown = items().filter(i => sel.has(i.id));
            const marks = shown.map(i => { const d = document.createElement('div'); d.dataset.sel = ''; put(d, toFrame(v, i)); return d; });
            // One selected item that may change gets eight handles, centred on its corners and edges (the CSS gives each a 44px hit area).
            const grips = shown.length === 1 && !host.readonly ? handles(toFrame(v, shown[0])).map(h => {
                const d = document.createElement('div');
                d.setAttribute('part', 'handle'); d.dataset.handle = h.name;
                d.style.setProperty('left', `${h.x}px`); d.style.setProperty('top', `${h.y}px`);
                return d;
            }) : [];
            // Guides across the whole surface and the snap lines of a held drag: one positioned div each (the world never mirrors: physical left/top).
            const line = (part, axis, at) => { const d = document.createElement('div'); d.setAttribute('part', part); d.dataset.axis = axis; d.style.setProperty(axis === 'x' ? 'left' : 'top', `${(axis === 'x' ? v.x : v.y) + at * v.zoom}px`); return d; };
            const guides = (Array.isArray(host.guides) ? host.guides : []).filter(g => (g?.axis === 'x' || g?.axis === 'y') && Number.isFinite(g.at)).map(g => line('guide', g.axis, g.at));
            layer.replaceChildren(box, ...guides, ...marks, ...grips, ...held.map(h => line('snap-line', h.axis, h.at)));
        },
        stop() {
            host.removeEventListener('pk-canvas-pick', onPick);
            host.removeEventListener('focusin', onFocus);
            frame.removeEventListener('keydown', onKey, true);
            for (const [t, f] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp]]) frame.removeEventListener(t, f);
            layer.replaceChildren(box); layer.hidden = true; box.hidden = true;
        },
    };
    return api;
}
