export default Base => class extends Base {
    connected() {
        if (!this.$t) {
            this.$t = () => { const open = this.part('details').open; if (open !== this.open) { this.open = open; this.emit('pk-toggle', { open }); } };
            this.part('details').addEventListener('toggle', this.$t);
            const a = this.part('actions'), h = this.part('heading');
            this.$r = new ResizeObserver(() => { const w = a.offsetWidth; h.style.paddingInlineEnd = w ? `calc(${w}px + var(--space-3))` : ''; });
        }
        this.$r.observe(this.part('actions'));
    }
    disconnected() { this.$r.disconnect(); }
    updated() { const d = this.part('details'); if (d.open !== this.open) d.open = this.open; }
};
