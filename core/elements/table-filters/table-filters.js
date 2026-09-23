// <pk-table-filters> behaviour: a debounced search box plus a Filters trigger (with an active-count badge) that opens a panel
// around the host's own filter fields (the default slot). Meant to sit in pk-table's toolbar slot (issue 203), but standalone:
// nothing here reads or writes pk-table itself. The element never searches, filters or clears anything itself — it only reports
// the interactions (pk-search, pk-toggle, pk-clear-filters) for the host to act on, the same shape pk-app-bar-search and
// pk-table's own pk-sort/pk-filter already use. :host { display: contents } in the css means these controls flow into
// whatever flex/grid row the host places <pk-table-filters> in (pk-table's toolbar), and the panel (flex-basis: 100%) wraps
// onto its own line there when open, without pk-table needing to know anything about it.

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = 1;
        this.part('search').addEventListener('input', () => {
            clearTimeout(this.$t);
            this.$t = setTimeout(() => this.emit('pk-search', { query: this.part('search').value }), this.debounce);
        });
        this.part('trigger').addEventListener('click', () => this.toggle(!this.open));
        this.part('close').addEventListener('click', () => this.toggle(false));
        this.part('clear').addEventListener('click', () => this.emit('pk-clear-filters'));
        this.watchSlot('', () => this.requestUpdate());
    }
    toggle(open) { if (this.emit('pk-toggle', { open })) this.open = open; }
    updated() {
        const has = this.slotted().length > 0;
        this.part('trigger').hidden = !has;
        this.part('trigger').setAttribute('aria-expanded', String(!!this.open));
        this.part('count').hidden = !this.filterCount;
        this.part('count').textContent = String(this.filterCount ?? 0);
        this.part('panel').hidden = !has || !this.open;
    }
};
