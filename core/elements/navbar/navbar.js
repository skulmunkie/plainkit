// pk-navbar: below 1024px the links fold behind a hamburger; Escape or choosing a link folds them again.
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        const toggle = this.part('toggle'); const links = this.part('links');
        links.id = 'links'; toggle.setAttribute('aria-controls', 'links');
        toggle.addEventListener('click', () => this.set(!this.open));
        this.addEventListener('keydown', e => { if (e.key === 'Escape' && this.open) { this.set(false); toggle.focus(); } });
        this.addEventListener('click', e => { if (this.open && e.target.closest('a[href]')) this.set(false); });
    }
    changed(name) { if (name === 'open') this.part('toggle').setAttribute('aria-expanded', String(this.open)); }
    set(v) { if (v === this.open) return; this.open = v; this.emit('pk-toggle', { open: v }); }
};
