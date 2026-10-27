import { loadElements } from '../../js/loader.js';
import { mediaBelow } from '../../js/breakpoints.js';
import { paramGet, paramKeep } from '../../js/tab-param.js';
// Sticky sidebar: measure it so a sidebar taller than the viewport docks by its bottom edge instead of its top (issue 281).
// Phone tabs (issue 272): elements carrying data-pk-section are grouped into tabs when the layout has collapsed to one column and names two or more sections.
// tabsFrom (issue 342) moves that point: 'collapse' (default, the container query), 'phone' or 'tablet' (the viewport at or below it), or 'always' (the two-column layout keeps its tabs).
const SECTION_ATTRS = ['data-pk-section', 'data-pk-section-label', 'data-pk-section-order', 'data-pk-section-count'];
export default Base => class extends Base {
    connected() {
        const side = this.part('sidebar');
        if (!this.$w) {
            this.$w = true;
            loadElements(this.shadowRoot); // the strip and the Next button are pk-* elements in this shadow tree: define them even when the host page uses none itself
            this.part('tabs').addEventListener('pk-tab-change', e => this.pick(e.detail.value));
            this.part('next').addEventListener('click', () => { this.pick(this.$next); this.part('tabs').scrollIntoView({ block: 'start' }); });
            this.addEventListener('invalid', e => { const c = e.target.closest?.('[data-pk-section-hidden]'); if (c) this.pick(c.dataset.pkSection); }, true);
        }
        if (typeof ResizeObserver !== 'undefined') {
            this.$ro ||= new ResizeObserver(() => { side.style.setProperty('--pk-detail-layout-height', side.offsetHeight + 'px'); this.sync(); });
            this.$ro.observe(side); this.$ro.observe(this);
        }
        this.$mo ||= new MutationObserver(() => this.sync());
        this.$mo.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: SECTION_ATTRS });
        this.watch_();
        this.sync();
    }
    disconnected() { this.$ro?.disconnect(); this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$sync); this.$mq = null; }
    changed(name) { if (name === 'section' || name === 'nextLabel' || name === 'tabsFrom' || name === 'hideTabs' || name === 'hideNext' || name === 'sectionsAbove') this.sync(); }
    pick(name) {
        const previous = this.$active;
        if (!name || name === previous) return;
        this.section = name;
        if (!this.emit('pk-section-change', { section: name, previous })) this.section = previous;
        this.sync();
    }
    /** tab-param (issue 1241): the first sync opens the section the query parameter names; a later change writes it with replaceState (other parameters and the hash kept, no history entry). */
    keep_(active) {
        const win = this.ownerDocument.defaultView;
        if (this.$last !== undefined && this.$last !== active) paramKeep(win, this.tabParam, active);
        this.$last = active;
    }
    /** sections-above (issue 1241): the tagged preceding siblings, in document order. */
    above_() { const out = []; if (this.sectionsAbove) for (let e = this.previousElementSibling; e; e = e.previousElementSibling) if (e.dataset.pkSection) out.unshift(e); return out; }
    watch_() {
        const p = this.parentElement;
        if (!this.sectionsAbove || !p || !this.$mo) return; // changed() can run before connected() has made the observer (issue 1681)
        this.$mo.observe(p, { childList: true });
        for (let e = this.previousElementSibling; e; e = e.previousElementSibling) this.$mo.observe(e, { attributes: true, attributeFilter: SECTION_ATTRS });
    }
    sync() {
        this.watch_();
        const cards = [...this.above_(), ...this.querySelectorAll('[data-pk-section]')];
        const first = (n, k) => cards.find(c => c.dataset.pkSection === n && c.dataset[k] !== undefined)?.dataset[k];
        const rank = n => { const v = parseFloat(first(n, 'pkSectionOrder')); return Number.isFinite(v) ? v : Infinity; }; // data-pk-section-order: ascending, stable; sections without one keep document order after the ordered ones
        const names = [...new Set(cards.map(c => c.dataset.pkSection))].sort((x, y) => rank(x) === rank(y) ? 0 : rank(x) < rank(y) ? -1 : 1);
        const tabs = this.part('tabs'), next = this.part('next');
        const on = names.length > 1;
        tabs.hidden = !on || this.hideTabs; // hideTabs (issue 1241): the strip is the host's (a pk-page-header tabs-from), so the layout draws none but still shows one section at a time
        const from = this.tabsFrom;
        if (this.$from !== from) { this.$mq?.removeEventListener('change', this.$sync); this.$from = from; this.$mq = from === 'phone' || from === 'tablet' ? mediaBelow(from) : null; this.$sync ??= () => this.sync(); this.$mq?.addEventListener('change', this.$sync); }
        tabs.toggleAttribute('data-on', on && (from === 'always' || !!this.$mq?.matches));
        // hideTabs (issue 1680) only hides the layout's own strip: sections still go one at a time only where that strip would show (tabsFrom), measured here because a hidden strip has no display to read
        const narrow = from === 'always' || (this.$mq ? this.$mq.matches : this.clientWidth <= 48 * parseFloat(getComputedStyle(this.ownerDocument.documentElement).fontSize));
        const collapsed = on && (this.hideTabs ? narrow : getComputedStyle(tabs).display !== 'none');
        if (this.section && on && !names.includes(this.section)) this.warnOnce('section:' + this.section, `section="${this.section}" matches no data-pk-section: showing the first`, { section: this.section, sections: names });
        if (on && this.tabParam && this.$last === undefined) { const want = paramGet(this.ownerDocument.defaultView, this.tabParam); if (names.includes(want)) this.section = want; }
        const active = this.$active = names.includes(this.section) ? this.section : names[0];
        if (on && this.tabParam) this.keep_(active);
        const key = names.map(n => n + '\n' + (cards.find(c => c.dataset.pkSection === n).dataset.pkSectionLabel || '') + '\n' + (first(n, 'pkSectionCount') ?? '')).join('\r');
        if (on && tabs.$key !== key) {
            tabs.$key = key;
            tabs.replaceChildren(...names.map(n => { const t = document.createElement('pk-tab'); t.value = n; t.textContent = cards.find(c => c.dataset.pkSection === n).dataset.pkSectionLabel || n[0].toUpperCase() + n.slice(1); const k = first(n, 'pkSectionCount'); if (k !== undefined && k !== '') t.setAttribute('count', k); return t; }));
            loadElements(tabs);
        }
        if (on) tabs.value = active;
        const after = names[names.indexOf(active) + 1];
        this.$next = after;
        next.hidden = this.hideNext || !collapsed || !after;
        if (after) next.textContent = this.nextLabel + ': ' + (cards.find(c => c.dataset.pkSection === after).dataset.pkSectionLabel || after[0].toUpperCase() + after.slice(1)) + ' \u2192';
        for (const c of cards) {
            const off = collapsed && c.dataset.pkSection !== active;
            c.toggleAttribute('data-pk-section-hidden', off);
            if (off) c.style.display = 'none'; else if (c.style.display === 'none') c.style.removeProperty('display');
        }
        if (on) for (const c of this.querySelectorAll('pk-card:not([data-pk-section])')) if (c.parentElement.closest(`[data-pk-section],${this.localName}`) === this) this.warnOnce('nosection', 'a pk-card in a layout with sections has no data-pk-section: it shows on every tab', { card: c.getAttribute('heading') }); // a card inside a [data-pk-section] wrapper is in that section (#1806)
    }
};
