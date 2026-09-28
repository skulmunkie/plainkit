// pk-swatch behaviour: a colour or design-token sample. It resolves a token (a CSS custom property such as "--color-accent") or a literal
// colour, paints the swatch, shows the resolved value as text, and measures the WCAG contrast ratio against a comparison colour (another
// token or literal, default the page background) with an AA pass/fail grade. Devtools-flavored (issue #525): useful in the scorecard and
// docs tooling for showing what a token or a literal colour actually renders as, not just a design-time preview.

import { parseColour, contrast } from '../../js/colour.js';

// "4.63:1" from a ratio, or "n/a" when it could not be measured.
export function formatRatio(ratio) {
    return ratio === null || ratio === undefined ? 'n/a' : `${ratio.toFixed(2)}:1`;
}

// WCAG AA text contrast: 4.5:1 for normal text, 3:1 for large text (>=18.66px bold or >=24px regular). Null when the ratio is unknown.
export function passesAA(ratio, large = false) {
    return ratio !== null && ratio !== undefined && ratio >= (large ? 3 : 4.5);
}

// The literal colour a token or a raw value resolves to. A custom property name (starts with "--") is read as `host`'s computed style
// (so it follows the theme and density that are actually in effect); anything else is a literal colour, passed through unchanged.
export function resolveColour(host, tokenOrValue) {
    const s = String(tokenOrValue ?? '').trim();
    if (!s) return '';
    return s.startsWith('--') ? getComputedStyle(host).getPropertyValue(s).trim() : s;
}

export default Base => class extends Base {
    connected() {
        if (this.$obs) return;
        // The resolved colour of a token follows the theme/density attributes on <html>, which this element does not own: watch them
        // and re-render, per ownership rule 5 (a subscription outside the element's own subtree is added/removed with connected/disconnected).
        this.$obs = new MutationObserver(() => this.requestUpdate());
        this.$obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density'] });
    }
    disconnected() { this.$obs?.disconnect(); this.$obs = null; }
    updated() {
        const swatchColour = resolveColour(this, this.token || this.value);
        const compareColour = resolveColour(this, this.compare);

        // Set through CSSOM, not an inline style attribute or a token: the swatch's whole purpose is to show an arbitrary colour value.
        this.part('swatch').style.backgroundColor = swatchColour || 'transparent';

        const fg = parseColour(swatchColour);
        const bg = parseColour(compareColour);
        const ratio = fg && bg ? contrast(fg, bg) : null;
        const pass = passesAA(ratio, this.large);

        this.part('value').textContent = swatchColour || '—';
        this.part('ratio').textContent = formatRatio(ratio);
        const grade = this.part('grade');
        grade.textContent = ratio === null ? 'n/a' : pass ? 'AA pass' : 'AA fail';
        grade.classList.toggle('is-pass', ratio !== null && pass);
        grade.classList.toggle('is-fail', ratio !== null && !pass);
    }
};
