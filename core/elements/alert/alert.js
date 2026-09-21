// pk-alert: a persistent message. Warnings and errors are announced assertively (role alert), the rest politely (role status).
export default Base => class extends Base {
    connected() {
        if (!this.$w) { this.$w = true; this.shadowRoot.addEventListener('click', e => { if (e.target.closest?.('[part="close"]')) this.dismiss(); }); }
    }
    updated() { this.aria({ role: this.kind === 'danger' || this.kind === 'warning' ? 'alert' : 'status' }); }
    dismiss() { if (this.emit('pk-dismiss', null)) this.hidden = true; }
};
