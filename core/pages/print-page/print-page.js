// pk-print-page (issue #1024): a page whose document is the only thing that prints. On screen it is a paper-like sheet (flat on a phone) under an
// optional toolbar slot; in print the toolbar and anything marked [data-screen-only] disappear, the app shell's chrome is hidden, the page size and
// margins come from props, and cards, field lists and table rows are kept whole (a table's header repeats on every page).
// @page and the rules that reach outside this shadow tree cannot live in the shadow stylesheet, so the element adopts one constructed stylesheet onto the
// document while it is connected (CSP allows constructed sheets, not <style>) and removes it again when it leaves.
const SAFE = /^[\w\s.%-]*$/; // a CSS length or paper name only, never a rule
export const printRules = (size, margin) => `@page { ${size ? `size: ${size}; ` : ''}margin: ${margin}; }
@media print {
    body :not(:has(pk-print-page), pk-print-page, pk-print-page *), [data-screen-only] { display: none !important; }
    :has(pk-print-page):not(body, html), :has(pk-print-page)::part(main) { display: block; height: auto; overflow: visible; }
    :has(pk-print-page)::part(header), :has(pk-print-page)::part(footer) { display: none; }
    :has(pk-print-page)::part(body) { overflow: visible; padding: 0; }
    pk-card, pk-field-list, pk-property-grid, pk-field-group, figure { break-inside: avoid; }
    pk-table::part(scroll) { overflow: visible; max-height: none; }
    pk-table::part(head) { display: table-header-group; }
}`;

export default Base => class extends Base {
    disconnected() { this.drop(); }
    updated() {
        if (!this.isConnected) return;
        const bad = k => this.warnOnce(`bad:${k}`, `${k} may only hold a length or a paper name (letters, digits, spaces, . % -): using the default`);
        const size = SAFE.test(this.size) ? this.size.trim() : (bad('size'), '');
        const margin = SAFE.test(this.margin) && this.margin.trim() ? this.margin.trim() : (bad('margin'), '15mm');
        const doc = this.ownerDocument;
        this.drop();
        this.$sh = new doc.defaultView.CSSStyleSheet();
        this.$sh.replaceSync(printRules(size, margin));
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.$sh];
    }
    drop() {
        if (!this.$sh) return;
        const doc = this.ownerDocument;
        doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(s => s !== this.$sh);
        this.$sh = null;
    }
};
