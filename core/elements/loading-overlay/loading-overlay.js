// pk-loading-overlay: while busy the wrapped content is inert (no pointer, no Tab) and marked aria-busy; the overlay is a polite status.
export default Base => class extends Base {
    connected() { this.sync(); }
    disconnected() { this.part('content').inert = false; }
    changed(name) { if (name === 'busy') this.sync(); }
    sync() { const c = this.part('content'); c.inert = this.busy; c.toggleAttribute('aria-busy', this.busy); this.toggleAttribute('aria-busy', this.busy); }
};
