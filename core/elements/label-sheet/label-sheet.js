// pk-label-sheet (issue #1674): a grid of fixed physical cells for labels and cards, one light-DOM child per cell. Lengths are validated like
// pk-print-page validates its size (a number and mm|cm|in|pt|px only); the element sets private custom properties from them, the stylesheet does the layout.
const LEN = /^(?:\d+\.?\d*|\.\d+)(?:mm|cm|in|pt|px)?$/;
const DEFAULTS = { cellWidth: '50mm', cellHeight: '25mm', gap: '0', offsetX: '0', offsetY: '0' };
const VARS = { cellWidth: '--_cw', cellHeight: '--_ch', gap: '--_gap', offsetX: '--_ox', offsetY: '--_oy' };
export const length = v => { const s = String(v ?? '').trim(); return LEN.test(s) ? s : null; };

export default Base => class extends Base {
    connected() { this.watchSlot('', () => this.requestUpdate()); }
    updated() {
        for (const k in VARS) {
            const ok = length(this[k]);
            if (ok === null) this.warnOnce(`bad:${k}`, `${k} must be a number with a unit (mm, cm, in, pt, px): using ${DEFAULTS[k]}`);
            this.style.setProperty(VARS[k], ok ?? DEFAULTS[k]);
        }
        const cols = Math.floor(Number(this.columns));
        this.style.setProperty('--_cols', cols > 0 ? String(cols) : 'auto-fill');
        for (const c of this.slotted()) c.toggleAttribute('data-clipped', c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1);
        if (this.scrollWidth > this.clientWidth + 1) this.warnOnce('wide', 'the cells and gaps are wider than the sheet: they scroll on screen and may be cut off in print');
    }
};
