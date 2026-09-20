// True when a slot has an element or non-blank text assigned.
const filled = (el, name) => el.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])').assignedNodes({ flatten: true }).some(n => n.nodeType === 1 || n.textContent.trim() !== '');

export default Base => class extends Base {
    connected() { for (const s of ['heading', '', 'icon', 'actions']) this.watchSlot(s, () => this.requestUpdate()); }
    updated() {
        this.part('heading').hidden = !this.heading && !filled(this, 'heading');
        this.part('description').hidden = !this.description && !filled(this, '');
        this.part('icon').hidden = !filled(this, 'icon');
        this.part('actions').hidden = !filled(this, 'actions');
        this.aria({ role: this.announce ? 'status' : null });
    }
};
