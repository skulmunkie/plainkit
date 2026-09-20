export default Base => class extends Base {
    connected() { this.watchSlot('', () => this.requestUpdate()); }
    updated() {
        this.toggleAttribute('data-labelled', this.slotted().length > 0 || this.textContent.trim() !== '');
        this.aria(this.decorative ? { role: 'none' } : { role: 'separator', ariaOrientation: this.vertical ? 'vertical' : 'horizontal' });
    }
};
