// pk-list: a plain ordered or unordered prose list. Marker and numbering are native CSS (list-style-type, ::marker) on
// display: list-item items, so the list role and item count reach assistive technology without a ul/ol/li in the host's markup.
export default Base => class extends Base {
    connected() { this.watchSlot('', () => this.requestUpdate()); }
    updated() {
        this.aria({ role: 'list', ariaLabel: this.label || null });
        for (const item of this.slotted()) if (!item.hasAttribute('role')) item.setAttribute('role', 'listitem');
    }
};
