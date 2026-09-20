export default Base => class extends Base {
    connected() {
        if (this.$t) return;
        this.$t = () => { const open = this.part('details').open; if (open !== this.open) { this.open = open; this.emit('pk-toggle', { open }); } };
        this.part('details').addEventListener('toggle', this.$t);
    }
    updated() { const d = this.part('details'); if (d.open !== this.open) d.open = this.open; }
};
