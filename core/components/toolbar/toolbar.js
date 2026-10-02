export default Base => class extends Base {
    connected() { this.watchSlot('actions', () => this.requestUpdate()); }
    updated() { this.part('actions').hidden = this.slotted('actions').length === 0; }
};
