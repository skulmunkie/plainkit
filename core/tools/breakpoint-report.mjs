// The breakpoint analysis: which elements, selectors and properties change at each named breakpoint (the "deltas"). Dependency-free.
//
//   node core/tools/breakpoint-report.mjs            a readable table, one section per breakpoint
//   node core/tools/breakpoint-report.mjs --json     the report as JSON (the build writes the same to dist/breakpoints.report.json)
//
// It reads the built form of the CSS: element CSS after tools/breakpoints.mjs resolved the names (so a (--phone) and a (max-width: 640px) are the
// same thing), plus the page layer (tokens and base, which are served unbuilt with literal widths). A width condition is matched to a breakpoint by
// its value: (max-width: 640px) is "below" phone (width at or below it), (min-width: 641px) is "above" phone. A width that is not one of the named
// ones is listed under "unnamed" so the report never hides a stray. Conditions with no width (pointer, motion, colour scheme) are not deltas of a
// breakpoint; a comma list such as (pointer: coarse), (max-width: 640px) counts at the breakpoint and says what else triggers it (`alsoWhen`).
// Used by the theme and breakpoints editor and the docs to show what a breakpoint change moves (#124).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBreakpoints } from './breakpoints.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(here, '..');

// Splits CSS into rules: [{ prelude, body }] for the blocks at this level (comments removed first). Strings and url() are not special-cased: the SDK's CSS
// has no brace inside a string, and the parser fails loudly on unbalanced braces rather than guessing.
export function splitRules(css) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = []; let depth = 0; let start = 0; let open = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '{') { if (depth === 0) open = i; depth++; }
        else if (c === '}') {
            if (depth === 0) throw new Error('breakpoint-report: unbalanced "}" in the CSS');
            depth--;
            if (depth === 0) { rules.push({ prelude: text.slice(start, open).trim(), body: text.slice(open + 1, i) }); start = i + 1; }
        } else if (c === ';' && depth === 0) start = i + 1; // an at-rule without a block (@import, @charset)
    }
    if (depth !== 0) throw new Error('breakpoint-report: unbalanced "{" in the CSS');
    return rules;
}

// The declared property names of a rule body (nested blocks are not declarations of this rule).
export function propertyNames(body) {
    let depth = 0; let flat = '';
    for (const c of body) { if (c === '{') depth++; else if (c === '}') depth--; else if (depth === 0) flat += c; }
    return [...new Set(flat.split(';').map(d => d.split(':')[0].trim()).filter(p => /^-{0,2}[a-zA-Z_][\w-]*$/.test(p)))];
}

// One media condition (a comma list of alternatives) -> { breakpoint, direction, alsoWhen[] } for each alternative that holds a width, or the unnamed width.
export function classifyCondition(cond, bps) {
    const named = []; const unnamed = [];
    const byWidth = new Map(bps.map(b => [b.width, b.name]));
    for (const alt of cond.split(',').map(a => a.trim()).filter(Boolean)) {
        const widths = [...alt.matchAll(/\(\s*(max|min)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/g)].map(m => ({ dir: m[1], px: Number(m[2]) }));
        if (!widths.length) continue;
        const rest = alt.replace(/\(\s*(?:max|min)-width\s*:[^)]*\)/g, '').replace(/^\s*(?:and\s+)*|\s*(?:and\s+)*$/g, '').replace(/\s+and\s+and\s+/g, ' and ').trim();
        for (const { dir, px } of widths) {
            const name = dir === 'max' ? byWidth.get(px) : byWidth.get(px - 1);
            if (name) named.push({ breakpoint: name, direction: dir === 'max' ? 'below' : 'above', alsoWhen: rest });
            else unnamed.push({ width: px, direction: dir === 'max' ? 'below' : 'above' });
        }
    }
    const others = cond.split(',').map(a => a.trim()).filter(a => a && !/(?:max|min)-width/.test(a));
    return { named: named.map(n => ({ ...n, alsoWhen: [n.alsoWhen, ...others].filter(Boolean).join(' ; ') })), unnamed };
}

// Every conditional rule of a stylesheet: [{ cond, selector, properties }], recursing into nested at-rules (@media inside @supports and the like).
export function mediaRules(css) {
    const found = [];
    const walk = (rules, conds) => {
        for (const { prelude, body } of rules) {
            if (/^@media\b/i.test(prelude)) walk(splitRules(body), [...conds, prelude.replace(/^@media\s*/i, '').trim()]);
            else if (/^@(supports|layer|container|scope)\b/i.test(prelude)) walk(splitRules(body), conds);
            else if (prelude.startsWith('@')) continue; // @keyframes, @font-face, @property: not selector rules
            else if (conds.length) found.push({ conds, selector: prelude.replace(/\s+/g, ' '), properties: propertyNames(body) });
        }
    };
    walk(splitRules(css), []);
    return found;
}

/** The report for a set of sources: [{ name, css }] (the element or page-layer name and its resolved CSS). */
export function buildReport(sources, bps) {
    const byBreakpoint = Object.fromEntries(bps.map(b => [b.name, { width: b.width, elements: {} }]));
    const unnamed = [];
    for (const { name, css } of sources) {
        for (const { conds, selector, properties } of mediaRules(css)) {
            // A rule nested in several @media (an "and" of them) is a delta of each named breakpoint among them.
            for (const cond of conds) {
                const { named, unnamed: strays } = classifyCondition(cond, bps);
                for (const n of named) {
                    const slot = (byBreakpoint[n.breakpoint].elements[name] ??= { below: [], above: [] })[n.direction];
                    const entry = { selector, properties: [...properties], ...(n.alsoWhen ? { alsoWhen: n.alsoWhen } : {}) };
                    const same = slot.find(e => e.selector === selector && (e.alsoWhen ?? '') === (entry.alsoWhen ?? ''));
                    if (same) same.properties = [...new Set([...same.properties, ...properties])].sort(); else slot.push({ ...entry, properties: [...properties].sort() });
                }
                for (const s of strays) unnamed.push({ element: name, selector, ...s });
            }
        }
    }
    for (const b of Object.values(byBreakpoint)) {
        b.elements = Object.fromEntries(Object.entries(b.elements).sort(([a], [c]) => a.localeCompare(c)));
        b.elementCount = Object.keys(b.elements).length;
        b.ruleCount = Object.values(b.elements).reduce((n, e) => n + e.below.length + e.above.length, 0);
    }
    unnamed.sort((a, b) => a.element.localeCompare(b.element) || a.selector.localeCompare(b.selector));
    return { note: 'Generated by tools/breakpoint-report.mjs: what changes at each named breakpoint (below = width at or below it, above = width above it).', breakpoints: bps, byBreakpoint, unnamed };
}

/** The sources this repository reports on: every element's resolved CSS, and the page layer's own. */
export function repoSources(elements, rootDir = coreRoot) {
    const page = ['tokens/tokens.css', ...['base', 'spacing', 'typography', 'table-content', 'utilities', 'a11y'].map(n => `base/${n}.css`)];
    return [
        ...elements.map(e => ({ name: e.name, css: e.css })),
        { name: 'page-layer', css: page.map(f => fs.readFileSync(path.join(rootDir, f), 'utf8').replace(/\r\n/g, '\n')).join('\n') },
    ];
}

/** The JSON text the build writes to dist/breakpoints.report.json; `elements` is what loadElementSources returned (their CSS is already resolved). */
export const reportJson = (elements, rootDir = coreRoot) => JSON.stringify(buildReport(repoSources(elements, rootDir), loadBreakpoints()), null, 1) + '\n';

/** A readable table: one section per breakpoint, one line per element with the properties that change. */
export function formatTable(report) {
    const lines = [];
    for (const b of report.breakpoints) {
        const s = report.byBreakpoint[b.name];
        lines.push(`${b.name} (${b.width}px): elements ${s.elementCount}, rules ${s.ruleCount}`);
        const rows = Object.entries(s.elements).map(([el, d]) => {
            const props = dir => [...new Set(d[dir].flatMap(r => r.properties))].sort().join(', ');
            return [el, d.below.length ? `at or below: ${props('below')}` : '', d.above.length ? `above: ${props('above')}` : ''].filter(Boolean);
        });
        const w = Math.max(0, ...rows.map(r => r[0].length));
        for (const [el, ...rest] of rows) lines.push(`  ${el.padEnd(w)}  ${rest.join('  |  ')}`);
        lines.push('');
    }
    if (report.unnamed.length) { lines.push('unnamed widths:'); for (const u of report.unnamed) lines.push(`  ${u.element}  ${u.direction} ${u.width}px  ${u.selector}`); lines.push(''); }
    return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    // build.mjs imports this file, so it is loaded lazily and never awaited at the top level (that would wait on itself).
    import('./build.mjs').then(({ loadElementSources }) => {
        const report = buildReport(repoSources(loadElementSources()), loadBreakpoints());
        console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 1) : formatTable(report));
    });
}
