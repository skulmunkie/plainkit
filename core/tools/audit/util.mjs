// Small shared helpers for the audit rule families (core/tools/audit/families/*.mjs). Kept separate from
// core/tools/strict/scanners/util.mjs (which this file wraps) so core/tools/audit never needs its callers to
// know about the strict engine's internal layout - design section 11: "must not import anything from core/js,
// core/elements or core/site". This module imports only core/tools/strict, which is allowed.
import { makePosAt } from '../strict/scanners/util.mjs';

// One hit at a raw string index, with line/column resolved from the file text.
export function hitAt(text, index, message, extra = {}) {
    const pos = makePosAt(text)(index);
    return { line: pos.line, column: pos.column, message, ...extra };
}

// Every match of a global regex, each turned into a hit via `toHit(match, text)`. `re` must carry the `g` flag.
export function hitsForEach(text, re, toHit) {
    const hits = [];
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(text))) {
        hits.push(toHit(m, text));
        if (m[0] === '') g.lastIndex++; // never loop forever on a zero-width match
    }
    return hits;
}

// First match only (rules that report one finding per file rather than per occurrence).
export function firstHit(text, re, toHit) {
    const m = re.exec(text);
    return m ? [toHit(m, text)] : [];
}

export function fileIs(file, extensions) {
    return extensions.some(ext => file.path.toLowerCase().endsWith(ext));
}

export const MARKUP_EXTENSIONS = ['.html', '.htm', '.razor', '.cshtml', '.jsx', '.tsx'];
export const SCRIPT_EXTENSIONS = ['.js', '.mjs', '.jsx', '.ts', '.tsx'];
export const CSS_EXTENSIONS = ['.css'];
// Family B (Blazor/Razor only, design section 2.6) applies only to Razor files, never plain HTML/JSX.
export const RAZOR_EXTENSIONS = ['.razor', '.cshtml'];

// Fills a FIX template's `{slot}` placeholders. An unknown slot is left as-is rather than throwing, so a rule
// that does not supply every slot a family's generic template happens to define still renders something sane.
export function applyFix(template, slots) {
    return template.replace(/\{(\w+)\}/g, (whole, key) => (key in slots && slots[key] != null ? String(slots[key]) : whole));
}
