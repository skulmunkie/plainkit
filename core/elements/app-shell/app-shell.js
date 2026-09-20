// pk-app-shell: the frame. A control marked data-nav-toggle in the header toggles the slotted side nav drawer; navOpen mirrors its state.
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.addEventListener('click', e => { if (e.target.closest?.('[data-nav-toggle]')) { const nav = this.nav; if (nav) { nav.open = !nav.open; this.navOpen = nav.open; this.emit('pk-nav-toggle', { open: nav.open }); } } });
        this.addEventListener('pk-close', e => { if (e.target === this.nav && !e.defaultPrevented) this.navOpen = false; });
        this.addEventListener('pk-open', e => { if (e.target === this.nav) this.navOpen = true; });
    }
    get nav() { return this.slotted('nav')[0]; }
    changed(name) { if (name === 'navOpen' && this.nav) this.nav.open = this.navOpen; }
};
