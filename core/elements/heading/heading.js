// <pk-heading> behaviour: the shadow tree renders a real h1..h6 (assistive tech gets the outline), while variant, tone,
// weight and truncate are a look only, decoupled from the level. See core/elements/text/text.js for the sibling case
// (pk-text's h1..h6 variants are a look with no heading role: a real heading stays this element).

// 1..6, clamped and rounded; anything else falls back to 2 (h2), the median heading, and warns once.
export function clampLevel(level) {
    const n = Math.round(Number(level));
    return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 2;
}

export default Base => class extends Base {
    // The control is an h1..h6: the shadow tree swaps it when level changes, moving the slot across (issue 521; the same
    // swap pk-button uses for its button/a control).
    control(tag) {
        const c = this.part('heading');
        if (c.localName === tag) return c;
        const n = document.createElement(tag);
        n.setAttribute('part', 'heading');
        n.replaceChildren(...c.childNodes);
        c.replaceWith(n);
        return n;
    }
    updated() {
        const level = clampLevel(this.level);
        if (level !== Math.round(Number(this.level))) this.warnOnce('level', `level=${JSON.stringify(this.level)} must be 1 to 6: using ${level}`, { level: this.level });
        this.control(`h${level}`);
        // The default look tracks the level; an explicit variant (a CSS rule of higher specificity) overrides it.
        this.style.setProperty('--pk-heading-size', `var(--text-h${level})`);
    }
};
