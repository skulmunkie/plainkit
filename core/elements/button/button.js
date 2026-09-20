export default Base => class extends Base {
    connected() { if (!this.$c) { this.$c = e => this.press(e); this.addEventListener('click', this.$c); } }
    press(e) {
        if (this.disabled || this.busy) { e.stopImmediatePropagation(); e.preventDefault(); return; }
        if (this.toggle) { this.pressed = !this.pressed; this.emit('pk-toggle', { pressed: this.pressed, value: this.value }); }
        if (this.type === 'submit') this.form?.requestSubmit();
        else if (this.type === 'reset') this.form?.reset();
    }
    updated() {
        const c = this.part('control');
        if (this.toggle) c.setAttribute('aria-pressed', String(this.pressed)); else c.removeAttribute('aria-pressed');
        this.toggleAttribute('has-busy-text', this.busy && this.busyText !== '');
    }
};
