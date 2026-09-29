// pk-splitter behaviour: two panes and a separator that resizes them by pointer or arrow keys. Sizes are percentages of the room the two panes share.
// The pure rules live in js/size.js (shared with the gallery's own inspector-width handle, #391) and are re-exported for the Node tests.
import { clampSize, keySize, pointerSize } from '../../js/size.js';

export { clampSize, keySize, pointerSize };

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        const h = this.part('handle');
        h.addEventListener('pointerdown', e => this.grab(e));
        h.addEventListener('pointermove', e => this.drag(e));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) h.addEventListener(type, () => this.drop());
        h.addEventListener('keydown', e => this.keys(e));
    }
    now() { return clampSize(this.size, this.min, this.max); }
    horizontal() { return this.orientation !== 'vertical'; }
    rtl() { return this.ownerDocument.defaultView.getComputedStyle(this).direction === 'rtl'; }
    grab(e) {
        if (this.disabled || e.button > 0) return;
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
        if (this.now() !== d.from) this.emit('pk-resize', { size: this.now() }, { cancelable: false });
    }
    keys(e) {
        if (this.disabled) return;
        const next = keySize(e.key, this.now(), { min: this.min, max: this.max, step: this.step, horizontal: this.horizontal(), rtl: this.horizontal() && this.rtl() });
        if (next === null) return;
        e.preventDefault();
        const s = clampSize(next, this.min, this.max);
        if (s === this.now()) return;
        this.size = s;
        this.emit('pk-resize', { size: s }, { cancelable: false });
    }
    updated() {
        const s = this.now(), root = this.part('root'), h = this.part('handle');
        root.style.setProperty('--_a', `${s}fr`); root.style.setProperty('--_b', `${Math.round((100 - s) * 10) / 10}fr`);
        h.setAttribute('aria-valuenow', String(s));
        h.setAttribute('aria-orientation', this.horizontal() ? 'vertical' : 'horizontal');
        h.tabIndex = this.disabled ? -1 : 0;
        if (this.disabled) h.setAttribute('aria-disabled', 'true'); else h.removeAttribute('aria-disabled');
    }
};
