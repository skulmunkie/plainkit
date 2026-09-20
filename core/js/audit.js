// Plainkit static audit: everything the scorecard can measure from file text alone, so the same numbers come out in the
// browser (fetched text) and in Node (files read from disk). Pure functions; no DOM, no fs.
// Framework-free; imports only sibling SDK modules.

import { cssStats, literalColours, literalSizes } from './quality.js';
import { parseTokenBlocks } from './theme.js';
import { contrast } from './colour.js';

const SIZE_DECL = /(padding|margin|gap|font-size|border-radius|width|height)[a-z-]*\s*:[^;{]*\b\d*\.?\d+(px|rem|em)\b/g;

// The literal value of a colour token in a theme, following one level of var(--other) if needed. null when unreadable.
export function resolveToken(blocks, theme, name, depth = 0) {
    const raw = blocks[theme][name] ?? blocks.root[name] ?? blocks.dark[name];
    if (raw === undefined || depth > 4) return null;
    const ref = /^var\((--[a-z0-9-]+)/.exec(raw);
    return ref ? resolveToken(blocks, theme, ref[1], depth + 1) : raw;
}

// Text pairs below the AA threshold across themes: [{ theme, fg, bg, ratio }].
export function contrastFailures(tokensCss, pairs, themes = ['dark', 'light'], aa = 4.5) {
    const blocks = parseTokenBlocks(tokensCss);
    const failures = [];
    for (const theme of themes) {
        for (const [fg, bg] of pairs) {
            const ratio = contrast(resolveToken(blocks, theme, fg) ?? '', resolveToken(blocks, theme, bg) ?? '');
            if (ratio !== null && ratio < aa) failures.push({ theme, fg, bg, ratio });
        }
    }
    return failures;
}

// cssFiles / jsFiles: { name: text }. Returns the flat measurements the scoring definitions ask for, plus a per-file table.
export function staticMetrics({ cssFiles, jsFiles, tokensCss, pairs }) {
    const perFile = []; let cssBytes = 0; let literalColourCount = 0; let literalSizeCount = 0; let sizeDeclarations = 0;
    for (const [name, text] of Object.entries(cssFiles)) {
        const stats = cssStats(text);
        // Element stylesheets load on demand and are held to per-element budgets (tests/budgets.test.mjs); this is what every page loads.
        if (!name.startsWith('elements/')) cssBytes += stats.bytes;
        const isTokens = name.endsWith('tokens.css');
        const colours = isTokens ? [] : literalColours(text);
        const sizes = isTokens ? [] : literalSizes(text);
        literalColourCount += colours.length;
        literalSizeCount += sizes.length;
        sizeDeclarations += isTokens ? 0 : (text.match(SIZE_DECL) ?? []).length + (text.match(/(padding|margin|gap|font-size|border-radius)[a-z-]*\s*:[^;{]*var\(--/g) ?? []).length;
        perFile.push({ name, ...stats, literalColours: colours.length, literalSizes: sizes.length });
    }
    const jsBytes = Object.values(jsFiles).reduce((n, t) => n + t.length, 0);
    return {
        cssKb: Math.round(cssBytes / 1024 * 10) / 10,
        jsKb: Math.round(jsBytes / 1024 * 10) / 10,
        literalColours: literalColourCount,
        literalSizes: sizeDeclarations ? Math.round(literalSizeCount / sizeDeclarations * 100) / 100 : 0,
        contrastFail: contrastFailures(tokensCss, pairs).length,
        perFile,
    };
}
