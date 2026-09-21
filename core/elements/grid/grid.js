// pk-grid: the min and columns props reach the css as --pk-grid-min and --pk-grid-columns (set through CSSOM, so the strict CSP is untouched).
// The ratio prop (2:1, 1:2:1) sets explicit proportional columns in --pk-grid-ratio; on a phone the grid is back to auto columns.
// A min the browser cannot parse as a length is ignored and the css default applies.
// "2:1" -> "minmax(0, 2fr) minmax(0, 1fr)" (any number of positive parts); null when the text is not a ratio.
export const ratioColumns = text => {
    const t = String(text).trim();
    return /^\d+(\.\d+)?(\s*:\s*\d+(\.\d+)?)+$/.test(t) && t.split(':').every(p => Number(p) > 0) ? t.split(':').map(p => `minmax(0, ${Number(p)}fr)`).join(' ') : null;
};

export default Base => class extends Base {
    updated() {
        const ok = this.hasAttribute('min') && this.min.trim() !== '' && CSS.supports('inline-size', this.min);
        if (ok) this.style.setProperty('--pk-grid-min', this.min); else this.style.removeProperty('--pk-grid-min');
        const r = this.ratio ? ratioColumns(this.ratio) : null;
        if (this.ratio && !r) this.warnOnce('ratio', `ratio="${this.ratio}" is not like 2:1: using equal columns`);
        if (r) this.style.setProperty('--pk-grid-ratio', r); else this.style.removeProperty('--pk-grid-ratio');
        const n = Math.floor(this.columns);
        if (n > 0) this.style.setProperty('--pk-grid-columns', String(n)); else this.style.removeProperty('--pk-grid-columns');
    }
};
