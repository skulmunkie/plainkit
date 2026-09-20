export default Base => class extends Base {
    connected() { this.watchSlot('heading', () => this.requestUpdate()); }
    updated() { this.part('heading').hidden = !this.heading && this.slotted('heading').length === 0; }
};
