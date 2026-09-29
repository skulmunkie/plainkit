// Family A: accessibility attributes (design section 2.5, owner goal 3). A1-A3 read the generated A11Y_REQUIRES
// table (element meta `a11yRequires`, core/tools/audit/data.mjs, #625 A-4), which states per element what a
// consumer must supply for an accessible name - the structured half of each element's `a11y` prose. The specific
// tag lists here (which elements are icon-only controls, dialogs, form controls...) mirror the design's own
// per-rule element lists (section 2.5); a11yRequires only says whether a listed element needs a name today.
import { scanHtml } from '../../strict/scanners/html.mjs';
import { scanCss } from '../../strict/scanners/css.mjs';
import { hitAt, fileIs, MARKUP_EXTENSIONS, CSS_EXTENSIONS } from '../util.mjs';
import { A11Y_REQUIRES } from '../hints.mjs';

const isMarkup = file => fileIs(file, MARKUP_EXTENSIONS);
const isCss = file => fileIs(file, CSS_EXTENSIONS);

const FORM_CONTROLS = ['pk-input', 'pk-select', 'pk-textarea', 'pk-checkbox', 'pk-radio-group', 'pk-combobox', 'pk-range', 'pk-unit-input', 'pk-otp-input', 'pk-colour-input', 'pk-date-range-picker'];
const DIALOG_LIKE = ['pk-dialog', 'pk-drawer'];

const hasName = attrs => isNonEmpty(attrs.label) || isNonEmpty(attrs['aria-label']);
const isNonEmpty = v => typeof v === 'string' && v.trim().length > 0;
const stripTags = html => html.replace(/<[^>]*>/g, '').trim();

// One open/close element's inner text, found by a tolerant non-greedy match (approximate, like the rest of the
// design's static scanners: good enough for the common "no nested same-name tag" case).
function innerTextOf(text, tag) {
    return [...text.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
        .map(m => ({ index: m.index, attrs: m[1], text: stripTags(m[2]) }));
}

export const A_RULES = [
    {
        id: 'A1',
        category: 'A',
        detects: 'an icon-only pk-button with no accessible name',
        severity: { normal: 'error', strict: 'error' },
        docs: 'core/elements/button/button.meta.json#a11y',
        fixTemplate: 'FIX: {file}:{line} <pk-button icon> has no name. Add label="..." (it is the accessible name and the tooltip), or keep the text in the default slot. [A1]',
        applies: isMarkup,
        scan(file) {
            const hits = [];
            for (const { index, attrs, text } of innerTextOf(file.text, 'pk-button')) {
                if (!/\bicon\b(\s*=|[\s>])/.test(` ${attrs} `)) continue;
                if (/\blabel\s*=\s*["'][^"']+["']/.test(attrs) || /\baria-label\s*=\s*["'][^"']+["']/.test(attrs)) continue;
                if (text) continue;
                hits.push(hitAt(file.text, index, '<pk-button icon> with no name', { found: '<pk-button icon> with no name' }));
            }
            return hits;
        },
    },
    {
        id: 'A2',
        category: 'A',
        detects: 'a form control with neither a label attribute nor aria-label',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} <{found}> has no name. Add a label attribute (or aria-label, or wrap it in a labelled pk-field-row). [A2]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const hits = [];
            for (const node of nodes) {
                const tag = node.name.toLowerCase();
                if (node.closing || !FORM_CONTROLS.includes(tag) || !A11Y_REQUIRES[tag]?.includes('label')) continue;
                if (hasName(node.attrs)) continue;
                hits.push({ line: node.line, column: node.column, message: `<${node.name}>`, found: tag });
            }
            return hits;
        },
    },
    {
        id: 'A3',
        category: 'A',
        detects: 'a dialog/drawer without a title, a tab without text, a frame/iframe without a title, or an image without alt',
        severity: { normal: 'error', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. [A3]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const hits = [];
            for (const node of nodes) {
                if (node.closing) continue;
                const tag = node.name.toLowerCase();
                if (DIALOG_LIKE.includes(tag) && A11Y_REQUIRES[tag]?.includes('label') && !hasName({ label: node.attrs.heading, 'aria-label': node.attrs['aria-label'] })) {
                    hits.push({ line: node.line, column: node.column, message: `<${node.name}>`, found: `<${tag}> has no heading and no aria-label` });
                }
                if ((tag === 'pk-frame' || tag === 'iframe') && !isNonEmpty(node.attrs.title)) {
                    hits.push({ line: node.line, column: node.column, message: `<${node.name}>`, found: `<${tag}> has no title (its accessible name)` });
                }
                if (tag === 'img' && node.attrs.alt === undefined) {
                    hits.push({ line: node.line, column: node.column, message: '<img>', found: '<img> has no alt attribute (use alt="" for a decorative image)' });
                }
            }
            for (const { index, attrs, text } of innerTextOf(file.text, 'pk-tab')) {
                if (!text && !/\baria-label\s*=\s*["'][^"']+["']/.test(attrs)) hits.push(hitAt(file.text, index, '<pk-tab> with no text', { found: '<pk-tab> has no text and no aria-label' }));
            }
            return hits;
        },
    },
    {
        id: 'A4',
        category: 'A',
        detects: 'a positive tabindex, or a click handler on a non-interactive tag',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. Use a real interactive element (or a pk-* one) instead of a manual tabindex/click on a div or span. [A4]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const hits = [];
            for (const node of nodes) {
                if (node.closing) continue;
                const tabindex = node.attrs.tabindex;
                if (typeof tabindex === 'string' && Number(tabindex) > 0) {
                    hits.push({ line: node.line, column: node.column, message: `tabindex="${tabindex}"`, found: `<${node.name}> has a positive tabindex="${tabindex}", which overrides the natural tab order` });
                }
                if (['div', 'span'].includes(node.name.toLowerCase()) && (node.attrs.onclick !== undefined || node.attrs['@onclick'] !== undefined)) {
                    hits.push({ line: node.line, column: node.column, message: `<${node.name} onclick>`, found: `<${node.name}> has a click handler but no keyboard path or role` });
                }
            }
            return hits;
        },
    },
    {
        id: 'A5',
        category: 'A',
        detects: 'skipped heading levels or more than one h1 in a file',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. [A5]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            const headings = nodes.filter(n => !n.closing && /^h[1-6]$/i.test(n.name));
            const hits = [];
            let seenH1 = false;
            let lastLevel = 0;
            for (const h of headings) {
                const level = Number(h.name[1]);
                if (level === 1) {
                    if (seenH1) hits.push({ line: h.line, column: h.column, message: '<h1>', found: 'has more than one <h1> in this file' });
                    seenH1 = true;
                } else if (lastLevel && level > lastLevel + 1) {
                    hits.push({ line: h.line, column: h.column, message: `<${h.name}>`, found: `<${h.name}> follows h${lastLevel}, skipping a level` });
                }
                lastLevel = level;
            }
            return hits;
        },
    },
    {
        id: 'A6',
        category: 'A',
        detects: 'a badge/alert whose variant conveys state with no text child (colour-only status)',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. [A6]',
        applies: isMarkup,
        scan(file) {
            const hits = [];
            for (const tag of ['pk-badge', 'pk-alert']) {
                for (const { index, attrs, text } of innerTextOf(file.text, tag)) {
                    const variant = /\bvariant\s*=\s*["']([\w-]+)["']/.exec(attrs)?.[1];
                    if (!variant || ['default', 'neutral', ''].includes(variant)) continue;
                    if (text) continue;
                    hits.push(hitAt(file.text, index, `<${tag} variant="${variant}"> with no text`, { found: `<${tag} variant="${variant}"> conveys state by colour alone, with no text child` }));
                }
            }
            return hits;
        },
    },
    {
        id: 'A7',
        category: 'A',
        detects: 'a page shell missing lang, a viewport meta, or a main landmark',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. [A7]',
        applies: file => fileIs(file, ['.html', '.htm']) && /<html\b/i.test(file.text),
        scan(file) {
            const hits = [];
            const htmlTag = /<html\b([^>]*)>/i.exec(file.text);
            if (htmlTag && !/\blang\s*=\s*["'][^"']+["']/.test(htmlTag[1])) {
                hits.push(hitAt(file.text, htmlTag.index, '<html> with no lang', { found: '<html> has no lang attribute' }));
            }
            if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(file.text)) {
                hits.push({ line: 1, column: 1, message: 'no viewport meta', found: 'the page has no <meta name="viewport"> tag' });
            }
            if (!/<main\b/i.test(file.text) && !/<pk-app-shell\b/i.test(file.text)) {
                hits.push({ line: 1, column: 1, message: 'no main landmark', found: 'the page has no <main> landmark and does not use pk-app-shell' });
            }
            return hits;
        },
    },
    {
        id: 'A8',
        category: 'A',
        detects: 'a reduced-motion or touch-target override on a PlainKit element (heuristic)',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#25-family-a-accessibility-attributes-owner-goal-3',
        fixTemplate: 'FIX: {file}:{line} {found}. [A8]',
        applies: isCss,
        scan(file) {
            const { nodes } = scanCss(file.text);
            const hits = [];
            for (const node of nodes.filter(n => n.kind === 'rule' && /\bpk-button\b/.test(n.name))) {
                const minHeight = node.declarations.find(d => d.property === 'min-height' && d.value.trim() === '0');
                if (minHeight) hits.push({ line: minHeight.line, column: minHeight.column, message: `${node.name} { min-height: 0 }`, found: `${node.name} sets min-height: 0, which can shrink the 44px phone touch target` });
            }
            if (!/@media[^{]*prefers-reduced-motion/.test(file.text)) {
                for (const node of nodes.filter(n => n.kind === 'rule')) {
                    const anim = node.declarations.find(d => d.property === 'animation' && d.value.trim() !== 'none');
                    if (anim) hits.push({ line: anim.line, column: anim.column, message: `${node.name} { animation: ${anim.value} }`, found: `${node.name} sets an animation with no prefers-reduced-motion override in this file` });
                }
            }
            return hits;
        },
    },
];
