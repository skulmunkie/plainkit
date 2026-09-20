export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = e => {
            if (this.disabled) return;
            if (e.composedPath().includes(this.part('toggle')) && this.expandable) this.setExpanded(!this.expanded);
            else this.select();
        };
        this.part('row').addEventListener('click', this.$c);
        this.watchSlot('', () => this.requestUpdate());
    }
    setExpanded(value) { if (value === this.expanded || !this.expandable) return; this.expanded = value; this.emit('pk-toggle', { id: this.value || this.label, expanded: value }); }
    select() { if (!this.disabled) this.emit('pk-select', { id: this.value || this.label }); }
    updated() {
        this.expandable = this.slotted().some(c => c.localName === 'pk-tree-item');
        this.part('children').hidden = !this.expanded || !this.expandable;
        let level = 1;
        for (let p = this.parentElement?.closest('pk-tree-item'); p; p = p.parentElement?.closest('pk-tree-item')) level++;
        this.style.setProperty('--pk-tree-item-level', String(level));
    }
};
