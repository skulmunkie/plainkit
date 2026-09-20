export default Base => class extends Base {
    connected() { this.aria({ role: 'list' }); this.watchSlot('', () => this.requestUpdate()); }
    updated() {
        this.aria({ ariaLabel: this.label || null });
        for (const row of this.slotted()) if (!row.hasAttribute('role')) row.setAttribute('role', 'listitem');
    }
};
