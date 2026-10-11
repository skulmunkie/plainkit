// pk-specimen behaviour: a design-token sample for the non-colour tokens (pk-swatch draws colours). It resolves a token (a CSS custom
// property such as "--space-4") against its own computed style, draws it by kind (a bar of the resolved length, a corner, an elevated
// tile or a layer chip) and shows the token name and the resolved value as text, so the result never depends on the drawing alone.

// The five kinds, matched on the token's prefix ("--touch-" and "--size-" are sizes).
const PREFIXES = [['--space-', 'space'], ['--radius-', 'radius'], ['--shadow-', 'shadow'], ['--z-', 'layer'], ['--touch-', 'size'], ['--size-', 'size']];
const KINDS = ['space', 'radius', 'shadow', 'size', 'layer'];

// The kind a token name implies, or '' when the prefix is not one of the five.
export function inferKind(token) {
    const name = String(token ?? '').trim();
    return PREFIXES.find(([p]) => name.startsWith(p))?.[1] ?? '';
}

// The value of a custom property as `host` sees it (theme and density in effect), trimmed; '' for a name that is not a token.
export function resolveToken(host, token) {
    const name = String(token ?? '').trim();
    return name.startsWith('--') ? getComputedStyle(host).getPropertyValue(name).trim() : '';
}

export default Base => class extends Base {
    connected() {
        if (this.$obs) return;
        // A token's resolved value follows the theme and density attributes on <html>, which this element does not own: watch them (ownership rule 5).
        this.$obs = new MutationObserver(() => this.requestUpdate());
        this.$obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density'] });
    }
    disconnected() { this.$obs?.disconnect(); this.$obs = null; }
    updated() {
        const token = String(this.token ?? '').trim();
        const kind = KINDS.includes(this.kind) ? this.kind : inferKind(token);
        const value = resolveToken(this, token);
        const shape = this.part('shape');
        this.part('sample').dataset.kind = kind; // inside the shadow tree: the host's attributes stay the author's
        // The drawing is set through CSSOM, not a style attribute: its whole purpose is to show an arbitrary token value.
        const bar = kind === 'space' || kind === 'size';
        shape.style.inlineSize = bar ? value : '';
        shape.style.borderRadius = kind === 'radius' ? value : '';
        shape.style.boxShadow = kind === 'shadow' ? value : '';
        shape.textContent = kind === 'layer' ? value : '';
        this.part('token').textContent = token;
        const px = bar ? Math.round(shape.getBoundingClientRect().width * 100) / 100 : 0;
        this.part('value').textContent = !value ? '—' : px && !value.endsWith('px') ? `${value} (${px}px)` : value;
    }
};
