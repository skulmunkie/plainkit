import { loadElements } from '../../js/loader.js';
const ids = { n: 0 };
// Which tabs collapse behind the overflow menu (overflow="menu") when the strip is narrower than the tabs need. Pure, so it is
// tested without a DOM: given each tab's width (already including its share of the gap), the space available for the strip and
// the width the trailing "more" trigger needs, it hides tabs from the end until the rest (plus the trigger) fits. The active
// tab is pinned: it is never hidden, however far along the strip it sits, so the current selection always stays visible.
export function hiddenTabs(widths, available, moreWidth = 0, activeIndex = -1) {
    const n = widths.length;
    if (!n) return [];
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= available) return [];
    const visible = new Set(widths.map((_, i) => i));
    let used = total;
    for (let i = n - 1; i >= 0 && used + moreWidth > available; i--) {
        if (i === activeIndex || !visible.has(i)) continue;
        visible.delete(i); used -= widths[i];
    }
    return widths.map((_, i) => i).filter(i => !visible.has(i));
}
export default Base => class extends Base {
    connected() {
        this.watchSlot('tab', () => this.sync()); this.watchSlot('panel', () => this.sync());
        const list = this.part('list');
        if (!this.$k) {
            this.$k = true;
            if (this.shadowRoot) loadElements(this.shadowRoot); // the overflow menu (overflow="menu") is pk-dropdown, defined here even when the host page uses none itself
            list.addEventListener('click', e => { const t = e.target.closest?.('pk-tab'); if (t) this.choose(t); });
            list.addEventListener('keydown', e => this.key(e));
            list.addEventListener('scroll', () => this.fade());
            list.addEventListener('wheel', e => this.wheel(e, list), { passive: false });
            this.addEventListener('pk-select', e => this.pick(e));
            if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { this.fade(); this.overflowMenu(); }).observe(list);
        }
        this.sync();
    }
    changed(name) { if (name === 'value' || name === 'noneActive') this.sync(); if (name === 'overflow') { this.fade(); this.overflowMenu(); } }
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
        this.reveal(this.tabs.find(t => t.selected), this.$s);
        this.$s = true; this.fade(); this.overflowMenu();
    }
    // Edge fades on a scrolling strip: the side that still has tabs beyond it (logical, so it holds in right-to-left).
    fade() {
        const l = this.part('list'); if (!l) return;
        const max = l.scrollWidth - l.clientWidth, at = Math.abs(l.scrollLeft);
        const side = this.overflow !== 'scroll' || max <= 1 ? '' : at <= 1 ? 'end' : at >= max - 1 ? 'start' : 'both';
        if (side) l.setAttribute('data-fade', side); else l.removeAttribute('data-fade');
        if (typeof getComputedStyle === 'function' && getComputedStyle(l).direction === 'rtl') l.setAttribute('data-rtl', ''); else l.removeAttribute('data-rtl');
    }
    // Scroll the strip so the tab lies fully inside it, clear of the fade (scroll-padding); smooth unless the reader prefers reduced motion.
    reveal(tab, smooth) {
        const l = this.part('list'); if (this.overflow !== 'scroll' || !l || !tab || typeof getComputedStyle !== 'function') return;
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
        if (this.overflow !== 'scroll' || e.deltaX || !e.deltaY || max <= 0) return;
        const rtl = getComputedStyle(l).direction === 'rtl', d = rtl ? -e.deltaY : e.deltaY;
        const next = Math.min(rtl ? 0 : max, Math.max(rtl ? -max : 0, l.scrollLeft + d));
        if (next !== l.scrollLeft) { e.preventDefault(); l.scrollLeft = next; }
    }
    // overflow="menu": measure the tabs at their natural width and hide whichever ones do not fit (the active one is pinned,
    // see hiddenTabs) behind the trailing "..." button, whose menu lists them so a hidden tab is still one click away.
    overflowMenu() {
        const more = this.part('more'); if (!more) return;
        const tabs = this.tabs;
        if (this.overflow !== 'menu' || !tabs.length) { for (const t of tabs) t.removeAttribute?.('data-overflow-hidden'); more.hidden = true; return; }
        const list = this.part('list');
        for (const t of tabs) t.removeAttribute?.('data-overflow-hidden');
        more.hidden = false;
        const gap = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(list).columnGap) || 0 : 0;
        const widths = tabs.map(t => t.getBoundingClientRect().width + gap);
        const moreWidth = more.getBoundingClientRect().width + gap;
        const activeIndex = tabs.findIndex(t => t.value === this.value);
        const hidden = hiddenTabs(widths, list.clientWidth, moreWidth, activeIndex);
        tabs.forEach((t, i) => t.toggleAttribute('data-overflow-hidden', hidden.includes(i)));
        more.hidden = hidden.length === 0;
        this.part('more-trigger')?.setAttribute('label', hidden.length ? `${hidden.length} more tab${hidden.length === 1 ? '' : 's'}` : 'More tabs');
        for (const c of [...more.children]) if (c.getAttribute('slot') !== 'trigger') c.remove();
        for (const i of hidden) {
            const t = tabs[i], mi = document.createElement('pk-menu-item');
            mi.value = t.value; mi.textContent = t.textContent.trim(); if (t.disabled) mi.disabled = true;
            more.appendChild(mi);
        }
        if (hidden.length) loadElements(more); // pk-menu-item is created here, after connected()'s own scan, so define it now
    }
    // A tab chosen from the overflow menu (pk-select, bubbled up from pk-menu-item through pk-dropdown) selects the real tab.
    pick(e) {
        if (this.overflow !== 'menu') return;
        const tab = this.tabs.find(t => t.value === e.detail?.value);
        if (tab) this.choose(tab, true);
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
        // In a right-to-left layout the next tab sits to the left, so ArrowLeft/ArrowRight swap meaning.
        const rtl = typeof getComputedStyle === 'function' && getComputedStyle(this).direction === 'rtl';
        const next = rtl ? 'ArrowLeft' : 'ArrowRight', prev = rtl ? 'ArrowRight' : 'ArrowLeft';
        const to = { [next]: (i + 1) % tabs.length, [prev]: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        if (this.activation === 'manual' || this.noneActive) { for (const t of this.tabs) t.tabIndex = t === tabs[to] ? 0 : -1; tabs[to].focus({ preventScroll: true }); this.reveal(tabs[to], true); } else this.choose(tabs[to], true);
    }
};
