// pk-loading-overlay: while busy the wrapped content is inert (no pointer, no Tab) and marked aria-busy; the overlay is a polite status.
// The one busy rule (#682): with delay the overlay appears only when busy lasts longer than that many ms (a fast action never flashes it), and with min-time it stays
// at least that long once shown (it never flickers). Both default to 0: the overlay follows busy at once. aria-busy follows busy itself, at once.
export default Base => class extends Base {
    connected() { this.sync(); this.watchSlot('', () => this.watchSize()); }
    disconnected() { clearTimeout(this.$later); clearTimeout(this.$hold); this.$later = this.$hold = 0; this.part('content').inert = false; this.$ro?.disconnect(); this.$ro = null; }
    changed(name) { if (name === 'busy' || name === 'delay' || name === 'minTime') this.sync(); else if (name === 'fill') this.watchSize(); }
    // With fill the host is clamped to the height left by its parent while the content may overflow it and be scrolled by an ancestor (#1947): while shown the overlay is as
    // tall as the content, not just the host box, so the scrim covers everything below the first screenful and the sticky panel stays in the scroller's view.
    watchSize() {
        const ov = this.part('overlay');
        if (!this.$on || !this.fill) { this.$ro?.disconnect(); this.$ro = null; ov.style.blockSize = ''; return; }
        const fit = () => { ov.style.blockSize = `${Math.max(this.clientHeight, this.part('content').scrollHeight)}px`; };
        this.$ro ??= new ResizeObserver(fit); this.$ro.disconnect();
        for (const e of [this, this.part('content'), ...this.slotted()]) this.$ro.observe(e);
        fit();
    }
    sync() {
        clearTimeout(this.$hold); this.$hold = 0;
        this.part('content').toggleAttribute('aria-busy', this.busy); this.toggleAttribute('aria-busy', this.busy);
        if (this.busy) {
            if (this.$on || this.$later) return;
            if (this.delay > 0) this.$later = setTimeout(() => { this.$later = 0; this.paint(true); }, this.delay); else this.paint(true);
            return;
        }
        clearTimeout(this.$later); this.$later = 0;
        const left = this.minTime - (Date.now() - (this.$at ?? 0));
        if (this.$on && left > 0) this.$hold = setTimeout(() => { this.$hold = 0; this.paint(false); }, left); else this.paint(false);
    }
    // Shows or hides the overlay and makes the content inert with it.
    paint(on) {
        this.$on = on; if (on) this.$at = Date.now();
        this.part('overlay').toggleAttribute('data-on', on); this.part('content').inert = on; this.watchSize();
    }
};
