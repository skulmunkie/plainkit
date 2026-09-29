// Shared literal-value scanner (design section 2.4, T1-T3; section 3.5's "made import-free by moving the regex
// into the shared scanner"): the same regex logic that used to live only inside core/js/quality.js (the
// rendered-page scorecard's literalColours/literalSizes), extracted so that internal check and the consumer-facing
// T1-T3 rules (core/tools/audit/families/t-rules.mjs) read one implementation and can never drift apart (#625,
// A-4 of the conformance-audit design). Behaviour is unchanged: same patterns, same line-based reporting.
//
// Pure, no imports, no repository-path assumptions - core/js/quality.js imports this module (core/js depending on
// core/tools/audit/scanners is the reverse of the direction the design forbids: core/tools/audit must never import
// core/js/elements/site, but nothing stops core/js from importing a pure scanner out of core/tools/audit).

export const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;

// Literal colours in stylesheet text (tokens.css is where they belong, so callers skip it): [{ line, text }].
export function literalColours(cssText, literal = LITERAL_COLOUR) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const found = [];
    clean.split('\n').forEach((line, i) => { const m = literal.exec(line); if (m) found.push({ line: i + 1, text: line.trim() }); });
    return found;
}

// Literal lengths (px or rem/em) declared in stylesheet text that are not a token: a rough adherence measure. [{ line, text }].
export function literalSizes(cssText) {
    const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const found = [];
    clean.split('\n').forEach((line, i) => {
        if (/^\s*--/.test(line) || /@media|@container/.test(line)) return;
        if (/(padding|margin|gap|font-size|border-radius|width|height)[a-z-]*\s*:[^;]*\b\d*\.?\d+(px|rem|em)\b/.test(line) && !/var\(--/.test(line)) found.push({ line: i + 1, text: line.trim() });
    });
    return found;
}
