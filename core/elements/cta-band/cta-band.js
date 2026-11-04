export default Base => class extends Base {
    connected() { this.watchSlot('heading', () => this.requestUpdate()); }
    updated() { if (this.slotted('heading').length === 0) this.warnOnce('heading', 'pk-cta-band has no heading: put your own h2 in slot="heading" (the element never invents one)'); }
};
