import { place, onOutside, unplace } from '../../js/positioning.js';

// pk-nav-item: a link row, or a branch (no href) that folds its `children`; in the icon rail a branch opens as a flyout beside the rail.
export default Base => class extends Base {
    connected() { this.setup(); if (this.flyout) this.layer(); }
    setup() {
        if (this.$w) return;
        this.$w = true;
        this.shadowRoot.addEventListener('click', e => { if (!this.href && e.target.closest?.('[part="link"]')) this.branch(); });
        this.shadowRoot.addEventListener('keydown', e => { if (!this.href && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.branch(); } });
        this.addEventListener('pointerover', e => { if (e.pointerType === 'mouse' && this.rail && !this.href && !this.flyout && this.children.length) this.flyout = true; });
        this.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.flyout) this.$t = setTimeout(() => { if (!this.matches(':hover')) this.flyout = false; }, 250); });
    }
    disconnected() { this.$o?.(); this.$o = null; clearTimeout(this.$t); }
    changed(name) { if (name === 'flyout') this.layer(); }
    get row() { return this.shadowRoot.querySelector('[part="link"]'); }
    focusRow() { this.row?.focus({ preventScroll: true }); }
    get hasChildren() { return this.slotted('children').length > 0; }
    branch() {
        if (this.group) return;
        if (this.rail) { this.flyout = !this.flyout; return; }
        this.expanded = !this.expanded; this.emit('pk-toggle', { expanded: this.expanded });
    }
    updated() {
        const row = this.row; if (!row) return;
        if (this.group) { for (const a of ['href', 'tabindex', 'aria-current', 'aria-disabled', 'aria-expanded', 'title']) row.removeAttribute(a); row.setAttribute('role', 'presentation'); return; }
        if (this.href) { row.setAttribute('href', this.href); row.removeAttribute('role'); row.removeAttribute('tabindex'); } else { row.removeAttribute('href'); row.setAttribute('role', 'button'); row.tabIndex = 0; }
        if (this.current) row.setAttribute('aria-current', 'page'); else row.removeAttribute('aria-current');
        if (this.disabled) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
        const label = this.textContent.trim().split('\n')[0];
        if (this.rail) row.setAttribute('title', (this.firstChild?.textContent ?? label).trim()); else row.removeAttribute('title');
        if (!this.href) row.setAttribute('aria-expanded', String(this.rail ? this.flyout : this.expanded)); else row.removeAttribute('aria-expanded');
    }
    layer() {
        const sub = this.part('sub'); this.$o?.(); this.$o = null;
        if (this.flyout && this.rail) {
            place(this.row, sub, { placement: 'right-start', offset: 4 });
            this.$o = onOutside([this], e => { if (e.type === 'keydown') { this.flyout = false; this.focusRow(); } else this.flyout = false; });
        } else unplace(sub);
    }
};
