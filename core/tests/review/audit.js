// The pure rules of the UI review (scripts/ui-review.mjs): they read the measurements review.js collected from one rendered example and return
// findings { rule, severity, path, message, fix }. No DOM here, so scripts/tests/ui-review.test.mjs runs them in Node.
// Severity: error fails the review; warn is a heuristic a person looks at (it fails only with --strict).

export const TOUCH_TARGET = 44; // the --touch-target token, in px (review.js reads the real one from the page; this is the fallback)
export const OVERLAP_MIN = 16;  // px squared: smaller intersections are rounding, not overlap
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio of two [r, g, b] colours, 1 to 21. */
export function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** Lays an [r, g, b, a] colour over an opaque [r, g, b] one. */
export const over = ([r, g, b, a = 1], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];

const intersect = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
const inside = (a, b) => a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[0] + a[2] <= b[0] + b[2] + 1 && a[1] + a[3] <= b[1] + b[3] + 1;

// Does a computed `content` value draw something? ("none", "normal" and empty strings do not.)
const draws = content => Boolean(content) && content !== 'none' && content !== 'normal' && !/^(""|'')(\s|$)/.test(content);
// A computed `content: "x" / ""` keeps its alternative text: empty means assistive technology skips the glyph.
const hasAltText = content => /\s\/\s(""|'')$/.test(content);

/**
 * facts: { viewport: { width }, touchTarget?, docScrollWidth, exampleWidth, boxes: [{ id, parent, path, rect: [x, y, w, h], inFlow, clipX, clipY, interactive,
 *   inlineLink, name, textColor: [r, g, b, a] | null, bg: [r, g, b] | null, fontSize, bold, media, inLink, pseudo: [{ which, content, pointerEvents }] }] }
 */
export function auditFacts(facts) {
    const out = [];
    const add = (rule, severity, box, message, fix) => out.push({ rule, severity, path: box?.path ?? '', message, fix });
    const tap = facts.touchTarget ?? TOUCH_TARGET;
    const phone = facts.viewport.width < 600;
    const boxes = facts.boxes ?? [];

    if (facts.docScrollWidth > facts.viewport.width + 1) add('horizontal-overflow', 'error', null, `the page scrolls sideways: ${facts.docScrollWidth}px of content in a ${facts.viewport.width}px viewport`, 'find the box wider than its container (wrap, min-width: 0, or a container query) and fix it in the element CSS');
    else if (facts.exampleWidth > facts.viewport.width + 1) add('horizontal-overflow', 'error', null, `the example is ${facts.exampleWidth}px wide in a ${facts.viewport.width}px viewport`, 'let the example shrink: wrap, min-width: 0, or a container query');

    const byParent = new Map();
    for (const b of boxes) { if (!byParent.has(b.parent)) byParent.set(b.parent, []); byParent.get(b.parent).push(b); }

    for (const b of boxes) {
        const [, , w, h] = b.rect;
        if (b.media && (w < 1 || h < 1)) add('zero-size-media', 'error', b, `${b.path} is an image or icon with no size (${w}x${h})`, 'give it a size (width/height, a token or the icon size hook) or remove it');
        if (b.interactive && !b.name) add('no-accessible-name', 'error', b, `${b.path} can take focus but has no accessible name`, 'give it text, aria-label, aria-labelledby or a label');
        for (const p of b.pseudo ?? []) {
            if (!draws(p.content) || !b.inLink) continue;
            const alt = hasAltText(p.content);
            if (p.pointerEvents !== 'none' || !alt) add('generated-content-in-link', 'error', b, `${b.path}::${p.which} draws ${p.content} inside a link box: ${p.pointerEvents !== 'none' ? 'it is clickable' : 'it is read out'}${alt ? '' : ' and underlined on hover'}`, 'draw the decoration outside the link, or give it pointer-events: none, text-decoration: none and empty alt text (content: "x" / "")');
        }
        if (b.clipX || b.clipY) add('clipped-content', 'warn', b, `${b.path} hides ${b.clipX ? 'width' : 'height'} (content larger than its box, overflow clipped)`, 'let the box grow, wrap, or truncate on purpose with text-overflow: ellipsis');
        if (phone && b.interactive && !b.inlineLink && (w < tap || h < tap)) add('tap-target', 'warn', b, `${b.path} is ${Math.round(w)}x${Math.round(h)}px on a phone; the touch target is ${tap}px`, 'use the touch-target token as min-height and min-width in the phone layout (see the page-header actions)');
        if (b.textColor && b.bg) {
            const ratio = contrastRatio(over(b.textColor, b.bg), b.bg);
            const need = b.fontSize >= 24 || (b.bold && b.fontSize >= 18.66) ? AA_LARGE : AA_TEXT;
            if (ratio < need) add('contrast', 'warn', b, `${b.path} text contrast ${ratio.toFixed(2)}:1 is below WCAG AA (${need}:1)`, 'use a text token with enough contrast on this surface, in both themes');
        }
    }
    // Siblings in normal flow whose boxes cross (text over a control, a chip over an action). Nesting is not overlap; overlays are not in flow.
    for (const group of byParent.values()) {
        const flow = group.filter(b => b.inFlow && b.rect[2] >= 1 && b.rect[3] >= 1);
        for (let i = 0; i < flow.length; i++) for (let j = i + 1; j < flow.length; j++) {
            const [a, c] = [flow[i], flow[j]];
            if (inside(a.rect, c.rect) || inside(c.rect, a.rect)) continue;
            const area = intersect(a.rect, c.rect);
            if (area >= OVERLAP_MIN) add('overlap', 'warn', a, `${a.path} and ${c.path} overlap by ${Math.round(area)}px2`, 'give the siblings room (gap, wrap) or make one an overlay on purpose');
        }
    }
    return out;
}

/** { errors, warnings, ok } for a list of findings; strict makes warnings fail too. */
export function summarize(findings, { strict = false } = {}) {
    const errors = findings.filter(f => f.severity === 'error').length;
    const warnings = findings.length - errors;
    return { errors, warnings, ok: errors === 0 && (!strict || warnings === 0) };
}
