// Plainkit colour maths: parse a CSS colour, blend alpha over a background, WCAG relative luminance and contrast ratio.
// Pure functions; no DOM, no imports.

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

// { r, g, b, a } with r/g/b 0-255 and a 0-1, or null when the text is not a colour we can read (var(), names, hsl).
export function parseColour(text) {
    const s = String(text ?? '').trim();
    let m = HEX.exec(s);
    if (m) {
        let h = m[1];
        if (h.length <= 4) h = [...h].map(c => c + c).join('');
        const n = i => parseInt(h.slice(i, i + 2), 16);
        return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    m = FUNC.exec(s);
    if (m) {
        const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    return null;
}

// The colour a translucent foreground actually shows when laid over an opaque background.
export function blend(fg, bg) {
    const a = fg.a ?? 1;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

export function luminance({ r, g, b }) {
    const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// WCAG contrast ratio between two colours (foreground alpha is blended over the background first); null if either is unreadable.
export function contrast(fgText, bgText) {
    const fg = typeof fgText === 'string' ? parseColour(fgText) : fgText;
    const bg = typeof bgText === 'string' ? parseColour(bgText) : bgText;
    if (!fg || !bg) return null;
    const a = luminance(blend(fg, bg));
    const b = luminance(bg);
    const [hi, lo] = a >= b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
}

// "4.63:1 AA" style label: AAA at 7, AA at 4.5, "below AA" under it.
export function grade(ratio, thresholds = { aaa: 7, aa: 4.5 }) {
    if (ratio === null || ratio === undefined) return 'n/a';
    return ratio >= thresholds.aaa ? 'AAA' : ratio >= thresholds.aa ? 'AA' : 'below AA';
}
