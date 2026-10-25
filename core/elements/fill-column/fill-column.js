// pk-fill-column (#1675): a column of a definite height. The `fixed` slot keeps its height (the fixed prop, a CSS length, sets it; empty keeps the
// natural height) and the default slot fills what is left and scrolls on its own, so a page needs no wrapper or :has() rule. With nothing in the fixed slot its region is hidden.
export const fixedLength = v => { const s = String(v ?? '').trim(); return s && CSS.supports('block-size', s) ? s : null; };

export default Base => class extends Base {
    connected() { this.watchSlot('fixed', () => this.requestUpdate()); }
    updated() {
        const f = fixedLength(this.fixed);
        if (String(this.fixed ?? '').trim() && !f) this.warnOnce('fixed', `fixed="${this.fixed}" is not a CSS length: the fixed region keeps its natural height`);
        if (f) this.style.setProperty('--_fh', f); else this.style.removeProperty('--_fh');
        this.part('fixed').hidden = this.slotted('fixed').length === 0;
    }
};
