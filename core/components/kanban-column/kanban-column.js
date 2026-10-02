// pk-kanban-column behaviour: one column of a pk-kanban. It shows its title and card count, and an empty message when it has no cards; the board owns every move.
export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => this.requestUpdate());
    }
    get cards() { return Array.from(this.children).filter(c => c.localName === 'pk-sortable-item'); }
    updated() {
        const n = this.cards.length, empty = this.part('empty');
        this.aria({ role: 'list', ariaLabel: this.label || this.value || null });
        this.part('title').textContent = this.label || this.value;
        this.part('count').textContent = String(n);
        empty.hidden = n > 0;
        empty.textContent = this.emptyText;
    }
};
