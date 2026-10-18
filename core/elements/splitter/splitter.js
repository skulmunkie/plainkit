// pk-splitter behaviour: two panes and a separator that resizes them by pointer or arrow keys. Sizes are percentages of the room the two panes share.
// The pure rules live in js/size.js (shared with the gallery's own inspector-width handle, #391) and are re-exported for the Node tests.
import { mediaBelow } from '../../js/breakpoints.js';
import { clampSize, keySize, pointerSize } from '../../js/size.js';

export { clampSize, keySize, pointerSize };

export default Base => class extends Base {
    connected() {
        if (typeof matchMedia === 'function') { this.$mq ??= mediaBelow('phone'); this.$mqf ??= () => this.requestUpdate(); this.$mq.addEventListener('change', this.$mqf); }
        if (this.$init) return;
        this.$init = true;
        const h = this.part('handle');
        h.addEventListener('pointerdown', e => this.grab(e));
        h.addEventListener('pointermove', e => this.drag(e));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) h.addEventListener(type, () => this.drop());
        h.addEventListener('keydown', e => this.keys(e));
        h.addEventListener('dblclick', () => this.toggle());
        this.part('toggle').addEventListener('click', () => this.toggle());
        const root = this.part('root');
        root.addEventListener('transitionend', e => { if (e.target === root) root.removeAttribute('data-anim'); });
        // Phone: a collapsible side-by-side split starts collapsed unless the host set collapsed (a saved state may still override it; it is never written).
        this.$auto = !!(this.collapsible && !this.hasAttribute('collapsed') && this.horizontal() && this.$mq?.matches);
        if (this.$auto) this.collapsed = true;
    }
    disconnected() { this.$mq?.removeEventListener('change', this.$mqf); this.$pp?.close(); this.$pp = this.$pk = undefined; }
    /** persist-key: opens the saved state (lazily) and applies it unless the host set size or collapsed; commits write it. */
    syncPersist() {
        const key = this.persistKey || '';
        if (key === (this.$pk ?? '')) return;
        this.$pp?.close(); this.$pp = undefined; this.$pk = key; this.$dirty = false;
        if (!key) return;
        import('../../js/splitter-persist.js').then(m => {
            if (this.$pk !== key) return;
            this.$pp = m.openPersist(key);
            if (this.$dirty) { this.$dirty = false; this.save(); return; }
            const s = this.$pp.read();
            if (s && !this.hasAttribute('size') && (!this.hasAttribute('collapsed') || this.$auto)) { this.size = clampSize(s.size, this.min, this.max); this.collapsed = s.collapsed; this.$auto = false; }
        }, err => this.warnOnce('persist', 'persist-key: storage could not be loaded, state is not saved', err));
    }
    save() {
        if (this.$auto) return;
        if (this.$pp) this.$pp.save({ size: this.now(), collapsed: !!this.collapsed }); else if (this.$pk) this.$dirty = true; // the store is still loading: write it once it has
    }
    /** Phone, collapsible, side by side: the panes stack (the separator is a bar between them), so there is nothing to drag. */
    stacked() { return !!(this.collapsible && this.$mq?.matches && this.horizontal()); }
    /** The user collapses or restores the end pane: the size is kept, the host hears pk-collapse-change. */
    toggle() {
        if (this.disabled || !this.collapsible) return;
        this.$auto = false;
        const next = !this.collapsed, a = this.ownerDocument.activeElement;
        if (next && [...this.children].some(k => k.getAttribute('slot') === 'end' && k.contains(a))) this.part('toggle').focus();
        this.part('root').setAttribute('data-anim', '');
        this.collapsed = next;
        this.emit('pk-collapse-change', { collapsed: next }, { cancelable: false });
        this.save();
    }
    now() { return clampSize(this.size, this.min, this.max); }
    horizontal() { return this.orientation !== 'vertical'; }
    rtl() { return this.ownerDocument.defaultView.getComputedStyle(this).direction === 'rtl'; }
    grab(e) {
        if (this.disabled || this.collapsed || this.stacked() || e.button > 0) return;
        const h = this.part('handle'), r = h.getBoundingClientRect(), horiz = this.horizontal();
        this.$drag = { id: e.pointerId, from: this.now(), grab: horiz ? e.clientX - (r.left + r.width / 2) : e.clientY - (r.top + r.height / 2) };
        try { h.setPointerCapture(e.pointerId); } catch (err) { this.debug('pointer capture refused (a synthetic pointer is not active): the drag still follows the handle\'s own events', err); }
        this.part('root').toggleAttribute('data-dragging', true);
    }
    drag(e) {
        if (!this.$drag) return;
        const horiz = this.horizontal(), box = this.part('root').getBoundingClientRect(), r = this.part('handle').getBoundingClientRect();
        const s = clampSize(horiz ? pointerSize(e.clientX, this.$drag.grab, box.left, box.width, r.width, this.rtl()) : pointerSize(e.clientY, this.$drag.grab, box.top, box.height, r.height), this.min, this.max);
        if (s === this.now()) return;
        this.size = s;
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    drop() {
        const d = this.$drag;
        if (!d) return;
        this.$drag = null;
        const h = this.part('handle');
        this.part('root').toggleAttribute('data-dragging', false);
        if (h.hasPointerCapture(d.id)) h.releasePointerCapture(d.id);
        if (this.now() !== d.from) { this.emit('pk-resize', { size: this.now() }, { cancelable: false }); this.save(); }
    }
    keys(e) {
        if (this.disabled) return;
        if (this.collapsible && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.toggle(); return; }
        if (this.collapsed || this.stacked()) return;
        const next = keySize(e.key, this.now(), { min: this.min, max: this.max, step: this.step, horizontal: this.horizontal(), rtl: this.horizontal() && this.rtl() });
        if (next === null) return;
        e.preventDefault();
        const s = clampSize(next, this.min, this.max);
        if (s === this.now()) return;
        this.size = s;
        this.emit('pk-resize', { size: s }, { cancelable: false });
        this.save();
    }
    updated() {
        this.syncPersist();
        const s = this.now(), root = this.part('root'), h = this.part('handle');
        const c = !!(this.collapsible && this.collapsed), t = this.part('toggle');
        root.style.setProperty('--_a', c ? '1fr' : `${s}fr`); root.style.setProperty('--_b', c ? '0fr' : `${Math.round((100 - s) * 10) / 10}fr`);
        this.part('end').inert = c;
        h.setAttribute('aria-valuenow', c ? '0' : String(s));
        t.hidden = !this.collapsible;
        t.setAttribute('aria-expanded', String(!c));
        t.setAttribute('aria-label', this.toggleLabel || (c ? 'Expand panel' : 'Collapse panel'));
        h.setAttribute('aria-orientation', this.horizontal() && !this.stacked() ? 'vertical' : 'horizontal');
        h.tabIndex = this.disabled ? -1 : 0;
        if (this.disabled) h.setAttribute('aria-disabled', 'true'); else h.removeAttribute('aria-disabled');
    }
};
