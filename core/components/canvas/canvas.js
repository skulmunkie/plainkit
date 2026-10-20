import { loadElements } from '../../js/loader.js';
import { toWorld, toScreen, zoomAt, zoomToFit, centerOn, toOrigin, fromOrigin, gridSteps } from '../../js/viewport-logic.js';

// The canvas keeps a view as { x, y, zoom }: the world origin sits at (x, y) in frame pixels and a world unit is `zoom` pixels. The maths is js/viewport-logic.js.
export const snap = (n, grid) => (grid > 0 ? Math.round(n / grid) * grid : n);
// A node's box inside the frame, for the marks layer.
export const markBox = (node, frame) => ({ left: node.left - frame.left, top: node.top - frame.top, width: node.width, height: node.height });
export const STEP = 1.25;

// pk-canvas: pan (drag the ground, arrows, wheel), zoom (pinch, Ctrl+wheel, + and -, the buttons), an optional grid and marks around nodes the host flags with data-surface-selected.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            const frame = this.part('frame');
            frame.addEventListener('pointerdown', e => this.down(e));
            frame.addEventListener('pointermove', e => this.move(e));
            frame.addEventListener('pointerup', e => this.up(e));
            frame.addEventListener('pointercancel', e => this.up(e, true));
            // Ctrl/Cmd+wheel (and a trackpad pinch) always zoom. A plain wheel is the page's unless `wheel` says otherwise (auto: pan only while the frame has focus).
            frame.addEventListener('wheel', e => {
                const z = e.ctrlKey || e.metaKey, m = this.wheel;
                if (!z && !(m === 'zoom' || m === 'pan' || (m === 'auto' && this.shadowRoot.activeElement === frame))) return;
                e.preventDefault();
                const p = this.local(e);
                if (z || m === 'zoom') this.zoomAt(Math.exp(-e.deltaY * 0.01), p.x, p.y);
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
    disconnected() { this.$mo?.disconnect(); this.$ro?.disconnect(); this.$rl?.then(r => r?.stop()); this.$rl = null; }
    // Px per display unit (unit mm: 96/25.4). The grid in world units: the set spacing, or with auto-grid the 1-2-5 step that keeps the lines 8 to 20 px apart (major: five minors or more).
    ppu() { return this.pxPerUnit || { mm: 96 / 25.4, in: 96, pt: 96 / 72 }[this.unit] || 1; }
    steps() { const p = this.ppu(), s = gridSteps(this.zoom * p); return this.autoGrid ? { minor: s.minor * p, major: s.major * p } : { minor: this.grid, major: 0 }; }
    view() { return { x: this.panX, y: this.panY, zoom: this.zoom }; }
    // Frame pixels of a pointer or wheel event.
    local(e) { const r = this.part('frame').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    // The view as the user changed it: written, announced once.
    set(v) {
        this.panX = v.x; this.panY = v.y; this.zoom = v.zoom;
        this.emit('pk-view-change', { x: v.x, y: v.y, zoom: v.zoom }, { cancelable: false });
    }
    // The view as a viewport-logic viewport (the world point at the frame's top-left) is what the maths takes; `say` also announces the zoom to a screen reader.
    put(v, say) { this.set(toOrigin(v)); if (say) this.part('status').textContent = `Zoom ${Math.round(this.zoom * 100)} percent`; }
    zoomAt(f, px, py, say) { this.put(zoomAt(fromOrigin(this.view()), f, px, py, { min: this.minZoom, max: this.maxZoom }), say); }
    frameSize() { const r = this.part('frame').getBoundingClientRect(); return [r.width, r.height]; }
    zoomBy(f) { const [w, h] = this.frameSize(); this.zoomAt(f, w / 2, h / 2, true); }
    // Zoom to `z` around the frame pixel `anchor` ({ x, y }, the middle by default).
    zoomTo(z, a) { const [w, h] = this.frameSize(); this.zoomAt(z / this.zoom, a ? a.x : w / 2, a ? a.y : h / 2, true); }
    reset() { this.put(fromOrigin({ x: 0, y: 0, zoom: 1 }), true); }
    // Fit a world rect { x, y, w, h } (default: the content area at the world origin) in the frame with a 16px margin.
    zoomToFit(rect) {
        const [w, h] = this.frameSize(), world = this.part('world');
        rect ||= { x: 0, y: 0, w: world.offsetWidth, h: world.offsetHeight };
        if (rect.w > 0 && rect.h > 0 && w > 0) this.put(zoomToFit(rect, w, h, 16, { min: this.minZoom, max: this.maxZoom }), true);
    }
    // Put the world point (x, y) in the middle of the frame.
    centerOn(x, y) { this.put(centerOn(fromOrigin(this.view()), x, y, ...this.frameSize())); }
    // A client point as world units, and a world point as client pixels (for a host that snaps what it drags).
    pointToWorld(clientX, clientY) { const r = this.part('frame').getBoundingClientRect(), w = toWorld(fromOrigin(this.view()), { x: clientX - r.left, y: clientY - r.top }); return { x: snap(w.x, this.steps().minor), y: snap(w.y, this.steps().minor) }; }
    worldToPoint(wx, wy) { const r = this.part('frame').getBoundingClientRect(), s = toScreen(fromOrigin(this.view()), { x: wx, y: wy }); return { x: s.x + r.left, y: s.y + r.top }; }
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
            if (before > 0) this.zoomAt(after / before, mid.x, mid.y);
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
        this.emit('pk-canvas-pick', { target: node, additive: e.shiftKey || e.ctrlKey || e.metaKey }, { cancelable: false });
    }
    key(e) {
        // Left and right follow the reading direction; the world itself is never mirrored.
        const s = getComputedStyle(this).direction === 'rtl' ? -1 : 1, pan = { ArrowLeft: [40 * s, 0], ArrowRight: [-40 * s, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
        if (e.target !== this.part('frame')) return;
        if (pan && !e.shiftKey) this.set({ ...this.view(), x: this.panX + pan[0], y: this.panY + pan[1] });
        else if (e.key === '+' || e.key === '=') this.zoomBy(STEP);
        else if (e.key === '-') this.zoomBy(1 / STEP);
        else if (e.key === '0') this.reset();
        else if (e.key === '1' || e.key === 'Home') this.zoomToFit();
        else if (pan || e.key === 'Delete' || e.key === 'Escape') this.emit('pk-canvas-key', { key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey }, { cancelable: false });
        else return;
        e.preventDefault();
    }
    // One box per flagged node, in frame pixels, so they follow pan and zoom without scaling their outline.
    marks() {
        const overlay = this.part('overlay'), f = this.part('frame').getBoundingClientRect();
        overlay.replaceChildren(...[...this.querySelectorAll('[data-surface-selected]')].map(n => {
            const b = markBox(n.getBoundingClientRect(), f), d = this.part('mark').cloneNode();
            d.hidden = false;

            for (const [k, v] of Object.entries({ left: b.left, top: b.top, width: b.width, height: b.height })) d.style.setProperty(k, `${v}px`);
            return d;
        }));
    }
    updated() {
        this.style.setProperty('--ds-x', String(this.panX)); this.style.setProperty('--ds-y', String(this.panY));
        this.style.setProperty('--ds-zoom', String(this.zoom)); const g = this.steps(); this.style.setProperty('--ds-grid', String(g.minor)); this.style.setProperty('--ds-major', String(g.major));
        this.part('level').textContent = `${Math.round(this.zoom * 100)}%`;
        this.part('in').disabled = this.zoom >= this.maxZoom; this.part('out').disabled = this.zoom <= this.minZoom;
        this.marks();
        if (this.autoGrid) this.$gs ??= import('../../js/canvas-style.js').then(m => m.adopt(this, 'grid'), e => this.log.error('canvas-style failed to load', e));
        if (this.rulers) (this.$rl ??= import('../../js/canvas-rulers.js').then(m => m.mount(this), e => this.log.error('canvas-rulers failed to load', e))).then(r => r?.draw());
        else if (this.$rl) { this.$rl.then(r => r?.stop()); this.$rl = null; }
        if (!this.label) this.warnOnce('label', 'has no label: the surface has no accessible name');
    }
};
