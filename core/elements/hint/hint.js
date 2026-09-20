export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = () => { this.open = !this.open; this.emit('pk-toggle', { open: this.open }); };
        this.part('toggle').addEventListener('click', this.$c);
    }
    updated() { this.part('toggle').setAttribute('aria-expanded', String(this.open)); this.part('panel').hidden = !this.open; }
};
