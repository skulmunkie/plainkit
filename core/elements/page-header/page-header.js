// True when a slot has an element or non-blank text assigned.
const filled = (el, name) => el.slotted(name).length > 0 || [...el.shadowRoot.querySelector(name ? `slot[name="${name}"]` : 'slot:not([name])').assignedNodes({ flatten: true })].some(n => n.textContent.trim() !== '');

export default Base => class extends Base {
    connected() { for (const s of ['breadcrumb', '', 'actions', 'meta', 'tabs']) this.watchSlot(s, () => this.requestUpdate()); }
    updated() {
        this.part('crumbs').hidden = !filled(this, 'breadcrumb');
        this.part('actions').hidden = !filled(this, 'actions');
        this.part('meta').hidden = !filled(this, 'meta');
        this.part('tabs').hidden = !filled(this, 'tabs');
        this.part('chips').hidden = !filled(this, '');
        this.part('titlebar').hidden = !this.heading && !filled(this, '') && !filled(this, 'actions');
    }
};
