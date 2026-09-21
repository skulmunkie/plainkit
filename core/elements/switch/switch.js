export default Base => class extends Base {
    connected() {
        this.$initial ??= this.checked; // once: a move in the DOM (disconnect, connect) must not replace the state a form reset returns to
        if (!this.$c) { this.$c = () => { if (!this.disabled) { this.checked = !this.checked; this.emit('change', { checked: this.checked }); this.emit('pk-change', { checked: this.checked }); } }; this.part('control').addEventListener('click', this.$c); }
    }
    updated() { this.setFormValue(this.checked ? this.value : null); }
    onReset() { this.checked = this.$initial; }
    onRestore(state) { this.checked = state === 'checked'; }
};
