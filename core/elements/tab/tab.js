export default Base => class extends Base {
    connected() {
        if (!this.slot) this.slot = 'tab';
        if (!this.$x) { this.$x = true; this.part('close').addEventListener('click', e => { e.stopPropagation(); this.emit('pk-tab-close', { value: this.value }); }); }
        this.updated();
    }
    updated() { this.aria({ role: 'tab', ariaSelected: String(this.selected), ariaDisabled: this.disabled ? 'true' : null }); }
};
