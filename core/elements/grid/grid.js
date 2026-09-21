// pk-grid: the min and columns props reach the css as --pk-grid-min and --pk-grid-columns (set through CSSOM, so the strict CSP is untouched).
// A min the browser cannot parse as a length is ignored and the css default applies.
export default Base => class extends Base {
    updated() {
        const ok = this.hasAttribute('min') && this.min.trim() !== '' && CSS.supports('inline-size', this.min);
        if (ok) this.style.setProperty('--pk-grid-min', this.min); else this.style.removeProperty('--pk-grid-min');
        const n = Math.floor(this.columns);
        if (n > 0) this.style.setProperty('--pk-grid-columns', String(n)); else this.style.removeProperty('--pk-grid-columns');
    }
};
