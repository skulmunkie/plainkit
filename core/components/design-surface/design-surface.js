import { loadElements } from '../../js/loader.js';

// Design-surface maths. Pure, so it can be tested without a DOM. A view is { x, y, zoom }: the world origin sits at (x, y) in frame pixels and a world unit is `zoom` pixels.
export const clampZoom = (z, min, max) => Math.min(max, Math.max(min, z));
export const toWorld = (v, px, py) => ({ x: (px - v.x) / v.zoom, y: (py - v.y) / v.zoom });
export const toScreen = (v, wx, wy) => ({ x: wx * v.zoom + v.x, y: wy * v.zoom + v.y });
export const snap = (n, grid) => (grid > 0 ? Math.round(n / grid) * grid : n);
// Zoom by `factor` keeping the world point under the frame pixel (px, py) where it is.
export function zoomAt(v, factor, px, py, min, max) {
    const zoom = clampZoom(v.zoom * factor, min, max), k = zoom / v.zoom;
    return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, zoom };
}
// A node's box inside the frame, for the marks layer.
export const markBox = (node, frame) => ({ left: node.left - frame.left, top: node.top - frame.top, width: node.width, height: node.height });
export const STEP = 1.25;

// pk-design-surface: pan (drag the ground, arrows, wheel), zoom (pinch, Ctrl+wheel, + and -, the buttons), an optional grid and marks around nodes the host flags with data-surface-selected.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            const frame = this.part('frame');
            frame.addEventListener('pointerdown', e => this.down(e));
            frame.addEventListener('pointermove', e => this.move(e));
            frame.addEventListener('pointerup', e => this.up(e));
            frame.addEventListener('pointercancel', e => this.up(e, true));
            frame.addEventListener('wheel', e => {
                e.preventDefault();
                const p = this.local(e);
                if (e.ctrlKey || e.metaKey) this.set(zoomAt(this.view(), Math.exp(-e.deltaY * 0.01), p.x, p.y, this.minZoom, this.maxZoom));
                else this.set({ ...this.view(), x: this.panX - e.deltaX, y: this.panY - e.deltaY });
            }, { passive: false });
            frame.addEventListener('keydown', e => this.key(e));
            this.part('in').addEventListener('click', () => this.zoomBy(STEP));
            this.part('out').addEventListener('click', () => this.zoomBy(1 / STEP));
            this.part('reset').addEventListener('click', () => this.reset());
            this.$pts = new Map();
        }
        this.$mo ??= new MutationObserver(() => this.marks());
        this.$mo.observe(this, { subtree: true, attributes: true, attributeFilter: ['data-surface-selected'], childList: true });
        if (typeof ResizeObserver === 'function') { this.$ro ??= new ResizeObserver(() => this.marks()); this.$ro.observe(this.part('world')); }
        loadElements(this.shadowRoot);
    }
    disconnected() { this.$mo?.disconnect(); this.$ro?.disconnect(); }
    view() { return { x: this.panX, y: this.panY, zoom: this.zoom }; }
    // Frame pixels of a pointer or wheel event.
    local(e) { const r = this.part('frame').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    // The view as the user changed it: written, announced once.
    set(v) {
        this.panX = v.x; this.panY = v.y; this.zoom = v.zoom;
        this.emit('pk-view-change', { x: v.x, y: v.y, zoom: v.zoom }, { cancelable: false });
    }
    zoomBy(f) { const r = this.part('frame').getBoundingClientRect(); this.set(zoomAt(this.view(), f, r.width / 2, r.height / 2, this.minZoom, this.maxZoom)); }
    reset() { this.set({ x: 0, y: 0, zoom: 1 }); }
    // A client point as world units, and a world point as client pixels (for a host that snaps what it drags).
    pointToWorld(clientX, clientY) { const r = this.part('frame').getBoundingClientRect(); const w = toWorld(this.view(), clientX - r.left, clientY - r.top); return { x: snap(w.x, this.grid), y: snap(w.y, this.grid) }; }
    worldToPoint(wx, wy) { const r = this.part('frame').getBoundingClientRect(); const s = toScreen(this.view(), wx, wy); return { x: s.x + r.left, y: s.y + r.top }; }
    down(e) {
        if (e.target.closest?.('pk-button')) return;
        const frame = this.part('frame');
        this.$pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
        if (this.$pts.size === 1) { this.$ground = e.button === 1 || !(e.target !== this && this.contains(e.target)); this.$moved = false; }
        else { this.$ground = true; this.$moved = true; }
        frame.setPointerCapture?.(e.pointerId);
    }
    move(e) {
        const p = this.$pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (this.$pts.size === 2) { // pinch: zoom by the change of distance around the midpoint, and follow it
            const [a, b] = [...this.$pts.values()], before = Math.hypot(a.x - b.x, a.y - b.y);
            p.x = e.clientX; p.y = e.clientY;
            const after = Math.hypot(a.x - b.x, a.y - b.y), mid = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
            if (before > 0) this.set(zoomAt(this.view(), after / before, mid.x, mid.y, this.minZoom, this.maxZoom));
            return;
        }
        p.x = e.clientX; p.y = e.clientY;
        if (!this.$moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4) return;
        this.$moved = true;
        if (this.$ground) this.set({ ...this.view(), x: this.panX + dx, y: this.panY + dy });
    }
    up(e, cancelled) {
        const had = this.$pts.delete(e.pointerId);
        if (!had || cancelled || this.$moved || this.$pts.size) return;
        const node = e.target !== this && this.contains(e.target) ? e.target : null; // a press without movement picks the deepest node under it, or none
        this.emit('pk-surface-pick', { target: node, additive: e.shiftKey || e.ctrlKey || e.metaKey }, { cancelable: false });
    }
    key(e) {
        const pan = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
        if (e.target !== this.part('frame')) return;
        if (pan && !e.shiftKey) this.set({ ...this.view(), x: this.panX + pan[0], y: this.panY + pan[1] });
        else if (e.key === '+' || e.key === '=') this.zoomBy(STEP);
        else if (e.key === '-') this.zoomBy(1 / STEP);
        else if (e.key === '0') this.reset();
        else if (pan || e.key === 'Delete' || e.key === 'Escape') this.emit('pk-surface-key', { key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey }, { cancelable: false });
        else return;
        e.preventDefault();
    }
    // One box per flagged node, in frame pixels, so they follow pan and zoom without scaling their outline.
    marks() {
        const overlay = this.part('overlay'), f = this.part('frame').getBoundingClientRect();
        overlay.replaceChildren(...[...this.querySelectorAll('[data-surface-selected]')].map(n => {
            const b = markBox(n.getBoundingClientRect(), f), d = this.part('mark').cloneNode();
            d.hidden = false;

            for (const [k, v] of Object.entries({ 'inset-inline-start': b.left, 'inset-block-start': b.top, 'inline-size': b.width, 'block-size': b.height })) d.style.setProperty(k, `${v}px`);
            return d;
        }));
    }
    updated() {
        this.style.setProperty('--ds-x', String(this.panX)); this.style.setProperty('--ds-y', String(this.panY));
        this.style.setProperty('--ds-zoom', String(this.zoom)); this.style.setProperty('--ds-grid', String(this.grid));
        this.part('level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.part('in').disabled = this.zoom >= this.maxZoom; this.part('out').disabled = this.zoom <= this.minZoom;
        this.marks();
        if (!this.label) this.warnOnce('label', 'has no label: the surface has no accessible name');
    }
};
