export default Base => class extends Base {
    connected() { if (!this.slot) this.slot = 'panel'; this.updated(); }
    updated() { this.aria({ role: 'tabpanel' }); }
};
