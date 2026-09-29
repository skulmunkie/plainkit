// Family T: tokens and standards (design section 2.4, owner goal 3). T1-T3 reuse the shared literal-value
// scanner extracted from core/js/quality.js (core/tools/audit/scanners/literals.mjs, #625 A-4) so the rendered-
// page scorecard and these source-scanning rules read one implementation. T5/T6/T7 read the generated element
// and token data (core/tools/audit/hints.mjs); T7 is wired but produces no findings until an element or prop
// declares `deprecated` (design section 2.4: "empty on day one, useful from the first deprecation").
import { scanHtml } from '../../strict/scanners/html.mjs';
import { scanCss } from '../../strict/scanners/css.mjs';
import { hitsForEach, hitAt, fileIs, MARKUP_EXTENSIONS, SCRIPT_EXTENSIONS, CSS_EXTENSIONS } from '../util.mjs';
import { literalColours, literalSizes } from '../scanners/literals.mjs';
import { ELEMENT_TAGS, ELEMENT_ATTRS, TOKENS, DEPRECATED_ELEMENTS, DEPRECATED_ATTRS } from '../hints.mjs';

const isMarkup = file => fileIs(file, MARKUP_EXTENSIONS);
const isScript = file => fileIs(file, SCRIPT_EXTENSIONS);
const isCss = file => fileIs(file, CSS_EXTENSIONS);
const isPkTag = name => /^pk-/i.test(name);

const TOKEN_NAMES = new Set(TOKENS.map(t => t.name));
const SPACE_TOKENS = TOKENS.filter(t => t.group === 'space');

// Nearest space token to a literal px/rem length, by numeric distance in px (rem at 16px), for T2's hint.
function toPx(value) {
    const m = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(value.trim());
    if (!m) return null;
    const n = parseFloat(m[1]);
    return m[2] === 'px' ? n : n * 16;
}

function nearestSpaceToken(literalText) {
    const m = /\b\d*\.?\d+(?:px|rem|em)\b/.exec(literalText);
    if (!m) return null;
    const px = toPx(m[0]);
    if (px == null) return null;
    let best = null;
    for (const t of SPACE_TOKENS) {
        const tPx = toPx(t.value);
        if (tPx == null) continue;
        const dist = Math.abs(tPx - px);
        if (!best || dist < best.dist) best = { token: t, dist };
    }
    return best ? best.token.name : null;
}

export const T_RULES = [
    {
        id: 'T1',
        category: 'T',
        detects: 'a literal colour in app CSS (hex, rgb()/rgba(), hsl()/hsla())',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#24-family-t-tokens-and-standards-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} uses the literal colour {found}. Use a --color-* token from tokens/tokens.css instead. [T1]',
        applies: isCss,
        scan(file) {
            return literalColours(file.text).map(({ line, text }) => ({ line, column: 1, message: text, found: text }));
        },
    },
    {
        id: 'T2',
        category: 'T',
        detects: 'a literal size (px/rem/em length for spacing, radius or font-size)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#24-family-t-tokens-and-standards-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} uses {found}. Use a design token instead of a literal length{nearest}. [T2]',
        applies: isCss,
        scan(file) {
            return literalSizes(file.text).map(({ line, text }) => {
                const nearest = nearestSpaceToken(text);
                return { line, column: 1, message: text, found: text, nearest: nearest ? ` (nearest: var(${nearest}))` : '' };
            });
        },
    },
    {
        id: 'T3',
        category: 'T',
        detects: 'a font-family or font-size literal outside the token set',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#24-family-t-tokens-and-standards-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} sets {found}. Use a --font-* or --text-* token instead of a literal font value. [T3]',
        applies: isCss,
        scan(file) {
            const { nodes } = scanCss(file.text);
            const hits = [];
            for (const node of nodes.filter(n => n.kind === 'rule')) {
                for (const d of node.declarations) {
                    if (!/^font(-family|-size)?$/.test(d.property)) continue;
                    if (/var\(--/.test(d.value) || d.value === 'inherit' || d.value === 'unset') continue;
                    hits.push({ line: d.line, column: d.column, message: `${d.property}: ${d.value}`, found: `${d.property}: ${d.value}` });
                }
            }
            return hits;
        },
    },
    {
        id: 'T4',
        category: 'T',
        detects: 'a removed focus ring (outline: none/0) with no replacement in the same rule',
        severity: { normal: 'error', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#24-family-t-tokens-and-standards-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} removes the focus ring ({found}) with no replacement. Keep a visible focus indicator (a box-shadow or another outline), or leave the element\'s own ring alone. [T4]',
        applies: isCss,
        scan(file) {
            const { nodes } = scanCss(file.text);
            const hits = [];
            for (const node of nodes.filter(n => n.kind === 'rule')) {
                const outline = node.declarations.find(d => d.property === 'outline' && /^(none|0)$/.test(d.value.trim()));
                if (!outline) continue;
                const replaced = node.declarations.some(d => (d.property === 'box-shadow' && d.value.trim() !== 'none') || (d.property === 'outline' && d !== outline));
                if (!replaced) hits.push({ line: outline.line, column: outline.column, message: `outline: ${outline.value}`, found: `outline: ${outline.value}` });
            }
            return hits;
        },
    },
    {
        id: 'T5',
        category: 'T',
        detects: 'an unknown CSS custom property (var(--x) where --x is neither a PlainKit token nor declared in the file)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#33-tokens',
        fixTemplate: 'FIX: {file}:{line} reads var({found}), which is not a PlainKit token and is not declared in this file - likely a typo that silently renders nothing. [T5]',
        applies: isCss,
        scan(file) {
            const declared = new Set([...file.text.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gi)].map(m => m[1]));
            const re = /var\(\s*(--[a-z][a-z0-9-]*)/gi;
            const hits = [];
            for (const m of file.text.matchAll(re)) {
                const name = m[1];
                if (TOKEN_NAMES.has(name) || declared.has(name)) continue;
                hits.push(hitAt(file.text, m.index, name, { found: name }));
            }
            return hits;
        },
    },
    {
        id: 'T6',
        category: 'T',
        detects: 'an unknown pk-* element (typo) or an enum attribute value outside its declared values',
        severity: { normal: 'error', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#31-elements-tag-alias-and-api-hints',
        fixTemplate: 'FIX: {file}:{line} {found}. [T6]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const hits = [];
            const known = new Set(ELEMENT_TAGS);
            for (const node of nodes) {
                if (node.closing || !isPkTag(node.name)) continue;
                const tag = node.name.toLowerCase();
                if (!known.has(tag)) {
                    hits.push({ line: node.line, column: node.column, message: `<${node.name}>`, found: `uses unknown element <${node.name}> (not in the PlainKit catalogue - check the spelling)` });
                    continue;
                }
                const attrValues = ELEMENT_ATTRS[tag];
                if (!attrValues) continue;
                for (const [attr, value] of Object.entries(node.attrs)) {
                    const allowed = attrValues[attr];
                    if (!allowed || typeof value !== 'string') continue;
                    if (!allowed.includes(value)) {
                        hits.push({ line: node.line, column: node.column, message: `${attr}="${value}"`, found: `sets ${attr}="${value}" on <${tag}>, which is not one of ${allowed.join(', ')}` });
                    }
                }
            }
            return hits;
        },
    },
    {
        id: 'T7',
        category: 'T',
        detects: 'a deprecated or removed pk-* element or attribute',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#31-elements-tag-alias-and-api-hints',
        fixTemplate: 'FIX: {file}:{line} {found}. [T7]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const hits = [];
            for (const node of nodes) {
                if (node.closing || !isPkTag(node.name)) continue;
                const tag = node.name.toLowerCase();
                const deprecatedElement = DEPRECATED_ELEMENTS.find(d => d.tag === tag);
                if (deprecatedElement) hits.push({ line: node.line, column: node.column, message: `<${node.name}>`, found: `uses deprecated <${tag}>: ${deprecatedElement.message}` });
                const attrs = DEPRECATED_ATTRS[tag];
                if (!attrs) continue;
                for (const attr of Object.keys(node.attrs)) {
                    if (attrs[attr]) hits.push({ line: node.line, column: node.column, message: attr, found: `uses deprecated attribute "${attr}" on <${tag}>: ${attrs[attr]}` });
                }
            }
            return hits;
        },
    },
    {
        id: 'T8',
        category: 'T',
        detects: 'importing the whole element bundle instead of the per-element modules (info-grade)',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#24-family-t-tokens-and-standards-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} imports {found}. Import only the per-element modules a page actually uses (plainkit/elements/<name>.js) to keep the page bundle small. [T8]',
        applies: isScript,
        scan(file) {
            const re = /\bfrom\s+['"](plainkit\/elements(?:\/elements)?\.js|plainkit\/elements\/all\.js)['"]/g;
            return hitsForEach(file.text, re, m => hitAt(file.text, m.index, m[1], { found: m[1] }));
        },
    },
];
