// Plainkit lightbox logic: which image is next, what may be shown, and when a swipe changes it. Pure, so it can be tested without a DOM.
// The element (<pk-lightbox>) is a native modal dialog with the image, a caption, a counter, previous/next and close.

export const SWIPE_MIN = 48;

// Neighbouring index, wrapping around. delta is +1 or -1.
export const step = (index, count, delta) => (count <= 0 ? -1 : (((index + delta) % count) + count) % count);

// Which key moves the gallery, or null.
export const keyDelta = key => (key === 'ArrowRight' || key === 'PageDown' ? 1 : key === 'ArrowLeft' || key === 'PageUp' ? -1 : null);

// A horizontal swipe changes the image when it is long enough and mostly horizontal; left swipe shows the next one.
export function swipeDelta(dx, dy) {
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
    return dx < 0 ? 1 : -1;
}

// Only same-site paths, http(s) and raster or svg data are shown; nothing else is ever given to an <img>.
export function safeSrc(src) {
    if (typeof src !== 'string' || !src.trim()) return null;
    const s = src.trim();
    if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(s)) return s;
    if (/^[\w+.-]+:/.test(s) && !/^https?:/i.test(s)) return null;
    return s;
}

// Images to warm up: the neighbours on each side, so a step is instant.
export const preloadIndexes = (index, count) => (count <= 1 ? [] : [...new Set([step(index, count, 1), step(index, count, -1)])].filter(i => i !== index));

export const counterText = (index, count) => (count > 1 ? `${index + 1} / ${count}` : '');

import { syncDialog, wireDialog } from '../../js/menu-logic.js';

// pk-lightbox: a full-screen viewer on a native modal dialog. `items` ({ src, alt, caption }[]) is a property; the default slot is the trigger.
export default Base => class extends Base {
    constructor() { super(); this.$items = []; }
    get items() { return this.$items; }
    set items(v) { this.$items = Array.isArray(v) ? v : []; if (this.open) this.paint(); }
    connected() {
        const dlg = this.part('dialog');
        if (!this.$w) {
            this.$w = true;
            wireDialog(this, dlg, { backdrop: () => true });
            this.addEventListener('click', e => { if (!dlg.contains(e.target) && e.target.closest('button, a, [role="button"]')) { e.preventDefault?.(); this.show(0); } });
            dlg.addEventListener('click', e => { const a = e.target.closest?.('[data-action]')?.getAttribute('data-action'); if (a === 'next') this.go(1); else if (a === 'prev') this.go(-1); });
            dlg.addEventListener('keydown', e => { const d = keyDelta(e.key); if (d) { e.preventDefault(); this.go(d); } });
            dlg.addEventListener('pointerdown', e => { this.$g = { x: e.clientX, y: e.clientY }; });
            dlg.addEventListener('pointerup', e => { const g = this.$g; this.$g = null; if (g) { const d = swipeDelta(e.clientX - g.x, e.clientY - g.y); if (d) this.go(-d); } });
        }
        syncDialog(this, dlg);
    }
    disconnected() { const d = this.part('dialog'); if (d.open) d.close(); }
    changed(name) { if (name === 'open') { if (this.open) this.paint(); syncDialog(this, this.part('dialog')); } else if (name === 'index' && this.open) this.paint(); }
    show(i = this.index) { this.index = step(i, this.$items.length, 0) < 0 ? 0 : i; this.open = true; }
    hide() { if (this.emit('pk-close', { reason: 'method' })) this.open = false; }
    go(d) { const to = step(this.index, this.$items.length, d); if (to >= 0 && this.emit('pk-change', { index: to })) this.index = to; }
    paint() {
        const n = this.$items.length; const it = this.$items[this.index] ?? {};
        const img = this.part('image'); const src = safeSrc(it.src);
        if (src) img.src = src; else img.removeAttribute('src');
        img.alt = it.alt ?? ''; this.part('caption').textContent = it.caption ?? ''; this.part('counter').textContent = counterText(this.index, n);
        this.toggleAttribute('single', n <= 1);
        for (const i of preloadIndexes(this.index, n)) { const s = safeSrc(this.$items[i]?.src); if (s) new Image().src = s; }
    }
};
