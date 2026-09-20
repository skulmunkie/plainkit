export default Base => class extends Base {
    connected() { this.aria({ role: 'list' }); }
    updated() { this.aria({ ariaLabel: this.label || null }); }
};
