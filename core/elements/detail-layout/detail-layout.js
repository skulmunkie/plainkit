// Sticky sidebar: measure it so a sidebar taller than the viewport docks by its bottom edge instead of its top (issue 281).
// Phone tabs (issue 272): elements carrying data-pk-section are grouped into tabs when the layout has collapsed to one column and names two or more sections.
export default Base => class extends Base {
    connected() {
        const side = this.part('sidebar');
        if (!this.$w) {
            this.$w = true;
            this.part('tabs').addEventListener('pk-tab-change', e => this.pick(e.detail.value));
            this.part('next').addEventListener('click', () => { this.pick(this.$next); this.part('tabs').scrollIntoView({ block: 'start' }); });
            this.addEventListener('invalid', e => { const c = e.target.closest?.('[data-pk-section-hidden]'); if (c) this.pick(c.dataset.pkSection); }, true);
        }
        if (typeof ResizeObserver !== 'undefined') {
            this.$ro ||= new ResizeObserver(() => { side.style.setProperty('--pk-detail-layout-height', side.offsetHeight + 'px'); this.sync(); });
            this.$ro.observe(side); this.$ro.observe(this);
        }
        this.$mo ||= new MutationObserver(() => this.sync());
        this.$mo.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pk-section', 'data-pk-section-label'] });
        this.sync();
    }
    disconnected() { this.$ro?.disconnect(); this.$mo?.disconnect(); }
    changed(name) { if (name === 'section' || name === 'nextLabel') this.sync(); }
    pick(name) {
        const previous = this.$active;
        if (!name || name === previous) return;
        this.section = name;
        if (!this.emit('pk-section-change', { section: name, previous })) this.section = previous;
        this.sync();
    }
    sync() {
        const cards = [...this.querySelectorAll('[data-pk-section]')];
        const names = [...new Set(cards.map(c => c.dataset.pkSection))];
        const tabs = this.part('tabs'), next = this.part('next');
        const on = names.length > 1;
        tabs.hidden = !on;
        const collapsed = on && getComputedStyle(tabs).display !== 'none';
        if (this.section && on && !names.includes(this.section)) this.warnOnce('section:' + this.section, `section="${this.section}" matches no data-pk-section: showing the first`, { section: this.section, sections: names });
        const active = this.$active = names.includes(this.section) ? this.section : names[0];
        const key = names.map(n => n + '\n' + (cards.find(c => c.dataset.pkSection === n).dataset.pkSectionLabel || '')).join('\r');
        if (on && tabs.$key !== key) {
            tabs.$key = key;
            tabs.replaceChildren(...names.map(n => { const t = document.createElement('pk-tab'); t.value = n; t.textContent = cards.find(c => c.dataset.pkSection === n).dataset.pkSectionLabel || n[0].toUpperCase() + n.slice(1); return t; }));
        }
        if (on) tabs.value = active;
        const after = names[names.indexOf(active) + 1];
        this.$next = after;
        next.hidden = !collapsed || !after;
        if (after) next.textContent = this.nextLabel + ': ' + (cards.find(c => c.dataset.pkSection === after).dataset.pkSectionLabel || after[0].toUpperCase() + after.slice(1)) + ' \u2192';
        for (const c of cards) {
            const off = collapsed && c.dataset.pkSection !== active;
            c.toggleAttribute('data-pk-section-hidden', off);
            if (off) c.style.display = 'none'; else if (c.style.display === 'none') c.style.removeProperty('display');
        }
        if (on) for (const c of this.querySelectorAll('pk-card:not([data-pk-section])')) this.warnOnce('nosection', 'a pk-card in a layout with sections has no data-pk-section: it shows on every tab', { card: c.getAttribute('heading') });
    }
};
