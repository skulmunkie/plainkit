export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = () => { if (!this.disabled && this.emit('pk-remove', { value: this.value || this.textContent.trim() })) this.remove(); };
        this.part('remove').addEventListener('click', this.$c);
    }
    updated() { this.part('remove').setAttribute('aria-label', `Remove ${this.value || this.textContent.trim()}`); }
};
