const ids = { n: 0 };
export default Base => class extends Base {
    connected() {
        this.watchSlot('tab', () => this.sync()); this.watchSlot('panel', () => this.sync());
        const list = this.part('list');
        if (!this.$k) {
            this.$k = true;
            list.addEventListener('click', e => { const t = e.target.closest?.('pk-tab'); if (t) this.choose(t); });
            list.addEventListener('keydown', e => this.key(e));
            list.addEventListener('scroll', () => this.fade());
            list.addEventListener('wheel', e => this.wheel(e, list), { passive: false });
            if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fade()).observe(list);
        }
        this.sync();
    }
    changed(name) { if (name === 'value' || name === 'noneActive') this.sync(); if (name === 'scroll') this.fade(); }
    get tabs() { return this.slotted('tab').filter(t => t.localName === 'pk-tab'); }
    get panels() { return this.slotted('panel').filter(p => p.localName === 'pk-tab-panel'); }
    get shown() { return this.tabs.filter(t => !t.disabled && t.offsetParent !== null); }
    sync() {
        const tabs = this.tabs;
        if (!tabs.length) return;
        if (this.value && !tabs.some(t => t.value === this.value)) this.warnOnce(`value:${this.value}`, `value="${this.value}" matches no <pk-tab value>: falling back to the first enabled tab`, { value: this.value, tabs: tabs.map(t => t.value) });
        if (!this.noneActive && !tabs.some(t => t.value === this.value && !t.disabled)) { const previous = this.value; this.value = (tabs.find(t => !t.disabled) ?? tabs[0]).value; if (this.value !== previous) this.emit('pk-tab-change', { value: this.value, previous, fallback: true }, { cancelable: false }); }
        for (const t of tabs) {
            t.id ||= 'pk-tab-' + (++ids.n);
            const on = !this.noneActive && t.value === this.value;
            t.selected = on; t.tabIndex = on || this.noneActive ? 0 : -1;
            const p = this.panels.find(x => x.value === t.value);
            if (p) { p.id ||= 'pk-panel-' + (++ids.n); t.setAttribute('aria-controls', p.id); p.setAttribute('aria-labelledby', t.id); }
        }
        for (const p of this.panels) { p.selected = !this.noneActive && p.value === this.value; p.tabIndex = p.selected ? 0 : -1; }
        if (this.scroll) this.reveal(this.tabs.find(t => t.selected), this.$s);
        this.$s = true; this.fade();
    }
    // Edge fades on a scrolling strip: the side that still has tabs beyond it (logical, so it holds in right-to-left).
    fade() {
        const l = this.part('list'); if (!l) return;
        const max = l.scrollWidth - l.clientWidth, at = Math.abs(l.scrollLeft);
        const side = !this.scroll || max <= 1 ? '' : at <= 1 ? 'end' : at >= max - 1 ? 'start' : 'both';
        if (side) l.setAttribute('data-fade', side); else l.removeAttribute('data-fade');
        l.toggleAttribute('data-rtl', getComputedStyle(l).direction === 'rtl');
    }
    // Scroll the strip so the tab lies fully inside it, clear of the fade (scroll-padding); smooth unless the reader prefers reduced motion.
    reveal(tab, smooth) {
        const l = this.part('list'); if (!l || !tab) return;
        const a = tab.getBoundingClientRect(), b = l.getBoundingClientRect(), pad = parseFloat(getComputedStyle(l).scrollPaddingLeft) || 0;
        let left = a.left < b.left + pad ? a.left - b.left - pad : a.right > b.right - pad ? a.right - b.right + pad : 0;
        if (!left) return;
        // The first and the last tab go all the way to the start or the end of the strip (the last one shows the trailing content too).
        const s = getComputedStyle(l).direction === 'rtl' ? -1 : 1, ts = this.tabs;
        if (tab === ts[0] && left * s < 0) left = -l.scrollLeft; else if (tab === ts.at(-1) && left * s > 0) left = s * (l.scrollWidth - l.clientWidth) - l.scrollLeft;
        l.scrollBy({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
    }
    // A mouse wheel turns the strip sideways (the strip only scrolls on one axis).
    wheel(e, l) {
        const max = l.scrollWidth - l.clientWidth;
        if (!this.scroll || e.deltaX || !e.deltaY || max <= 0) return;
        const rtl = getComputedStyle(l).direction === 'rtl', d = rtl ? -e.deltaY : e.deltaY;
        const next = Math.min(rtl ? 0 : max, Math.max(rtl ? -max : 0, l.scrollLeft + d));
        if (next !== l.scrollLeft) { e.preventDefault(); l.scrollLeft = next; }
    }
    choose(tab, focus = false) {
        if (tab.disabled || (!this.noneActive && tab.value === this.value)) { if (focus) tab.focus({ preventScroll: true }); return; }
        const previous = this.value;
        if (!this.noneActive) this.value = tab.value;
        if (!this.emit('pk-tab-change', { value: tab.value, previous })) { if (!this.noneActive) this.value = previous; return; }
        if (focus) tab.focus({ preventScroll: true });
    }
    key(e) {
        const tabs = this.shown; const i = tabs.indexOf(e.target.closest('pk-tab'));
        if (i < 0) return;
        const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        if (this.activation === 'manual' || this.noneActive) { for (const t of this.tabs) t.tabIndex = t === tabs[to] ? 0 : -1; tabs[to].focus({ preventScroll: true }); this.reveal(tabs[to], true); } else this.choose(tabs[to], true);
    }
};
