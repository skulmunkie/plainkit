import { syncDialog, wireDialog, requestClose } from '../../js/menu-logic.js';

// Drawer logic: which way it slides and when a swipe closes it. Pure, so it can be tested without a DOM.
export const SIDES = ['left', 'right', 'bottom'];
export const normalizeSide = s => (SIDES.includes(s) ? s : 'right');
export const AXIS_LOCK = 8;
export const CLOSE_FRACTION = 0.35;
export const CLOSE_VELOCITY = 0.5;
export const axisOf = side => (side === 'bottom' ? 'y' : 'x');

// Which axis a drag has committed to once it has moved AXIS_LOCK px, or null while undecided.
export function lockedAxis(dx, dy) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) return null;
    return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

// How far the panel follows the finger: only in the closing direction, never against it.
export function dragOffset(side, dx, dy) {
    if (side === 'left') return Math.max(0, -dx);
    if (side === 'right') return Math.max(0, dx);
    return Math.max(0, dy);
}

// Releasing past a third of the size, or flicking fast enough, closes it.
export function shouldClose(offset, size, elapsedMs) {
    if (offset <= 0 || size <= 0) return false;
    if (offset >= size * CLOSE_FRACTION) return true;
    return elapsedMs > 0 && offset / elapsedMs >= CLOSE_VELOCITY && offset > AXIS_LOCK;
}

// The outcome of a whole gesture: 'none', 'cancel' or 'close'.
export function swipeOutcome(side, dx, dy, elapsedMs, size) {
    const axis = lockedAxis(dx, dy);
    if (axis === null) return 'none';
    if (axis !== axisOf(side)) return 'cancel';
    return shouldClose(dragOffset(side, dx, dy), size, elapsedMs) ? 'close' : 'cancel';
}

// pk-drawer: a panel on a native modal <dialog>, pinned to an edge, closed by Escape, the backdrop (unless persistent), the close button or a swipe.
export default Base => class extends Base {
    connected() {
        const dlg = this.part('panel');
        if (!this.$w) {
            this.$w = true;
            wireDialog(this, dlg, { backdrop: () => !this.persistent });
            dlg.addEventListener('pointerdown', e => this.down(e));
            dlg.addEventListener('pointermove', e => this.move(e));
            dlg.addEventListener('pointerup', e => this.up(e));
            dlg.addEventListener('pointercancel', () => this.reset());
        }
        syncDialog(this, dlg);
        if (this.open && !this.heading && !this.childElementCount && !this.textContent.trim()) this.warnOnce('empty', 'was opened with no heading and no content: it will show an empty panel');
    }
    disconnected() { const d = this.part('panel'); if (d.open) d.close(); }
    changed(name) { if (name === 'open') { syncDialog(this, this.part('panel')); if (this.open && !this.heading && !this.childElementCount && !this.textContent.trim()) this.warnOnce('empty', 'was opened with no heading and no content: it will show an empty panel'); } }
    show() { this.open = true; }
    hide() { if (requestClose(this, 'method')) this.open = false; }
    down(e) { if (e.pointerType === 'mouse' || e.target.closest('[part="body"]')?.scrollTop > 0) return; this.$g = { x: e.clientX, y: e.clientY, t: performance.now(), on: false }; }
    move(e) {
        const g = this.$g; if (!g) return;
        const dx = e.clientX - g.x; const dy = e.clientY - g.y; const side = normalizeSide(this.side);
        const axis = lockedAxis(dx, dy);
        if (axis === null) return;
        if (axis !== axisOf(side)) { this.$g = null; return; }
        g.on = true;
        const off = dragOffset(side, dx, dy); const dlg = this.part('panel');
        dlg.style.transition = 'none'; dlg.style.transform = side === 'bottom' ? `translateY(${off}px)` : `translateX(${side === 'left' ? -off : off}px)`;
    }
    up(e) {
        const g = this.$g; if (!g?.on) { this.$g = null; return; }
        const dlg = this.part('panel'); const side = normalizeSide(this.side);
        const size = side === 'bottom' ? dlg.offsetHeight : dlg.offsetWidth;
        const out = swipeOutcome(side, e.clientX - g.x, e.clientY - g.y, performance.now() - g.t, size);
        this.reset();
        if (out === 'close' && requestClose(this, 'swipe')) this.open = false;
    }
    reset() { this.$g = null; const d = this.part('panel'); d.style.transition = ''; d.style.transform = ''; }
};
