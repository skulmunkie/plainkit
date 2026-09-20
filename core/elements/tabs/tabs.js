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
        if (!this.noneActive && !tabs.some(t => t.value === this.value && !t.disabled)) this.value = (tabs.find(t => !t.disabled) ?? tabs[0]).value;
        for (const t of tabs) {
            t.id ||= 'pk-tab-' + (++ids.n);
            const on = !this.noneActive && t.value === this.value;
            t.selected = on; t.tabIndex = on || this.noneActive ? 0 : -1;
            const p = this.panels.find(x => x.value === t.value);
            if (p) { p.id ||= 'pk-panel-' + (++ids.n); t.setAttribute('aria-controls', p.id); p.setAttribute('aria-labelledby', t.id); }
        }
        for (const p of this.panels) { p.selected = !this.noneActive && p.value === this.value; p.tabIndex = p.selected ? 0 : -1; }
        if (this.scroll) this.tabs.find(t => t.selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        this.fade();
    }
    // Edge fades on a scrolling strip: the side that still has tabs beyond it.
    fade() {
        const l = this.part('list'); if (!l) return;
        const max = l.scrollWidth - l.clientWidth;
        const side = !this.scroll || max <= 1 ? '' : l.scrollLeft <= 1 ? 'end' : l.scrollLeft >= max - 1 ? 'start' : 'both';
        if (side) l.setAttribute('data-fade', side); else l.removeAttribute('data-fade');
    }
    choose(tab, focus = false) {
        if (tab.disabled || (!this.noneActive && tab.value === this.value)) { if (focus) tab.focus(); return; }
        const previous = this.value;
        if (!this.noneActive) this.value = tab.value;
        if (!this.emit('pk-tab-change', { value: tab.value, previous })) { if (!this.noneActive) this.value = previous; return; }
        if (focus) tab.focus();
    }
    key(e) {
        const tabs = this.shown; const i = tabs.indexOf(e.target.closest('pk-tab'));
        if (i < 0) return;
        const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        if (this.activation === 'manual' || this.noneActive) { for (const t of this.tabs) t.tabIndex = t === tabs[to] ? 0 : -1; tabs[to].focus(); } else this.choose(tabs[to], true);
    }
};
