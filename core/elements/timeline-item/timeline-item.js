export default Base => class extends Base {
    connected() { this.aria({ role: 'listitem' }); this.watchSlot('', () => this.requestUpdate()); }
    updated() { this.part('body').hidden = !this.shadowRoot.querySelector('slot:not([name])').assignedNodes({ flatten: true }).some(n => n.nodeType === 1 || n.textContent.trim() !== ''); }
};
