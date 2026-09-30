// Family D: duplicating an element or its interaction logic (design section 2.1, owner goal 1). D3-D6 reuse
// the shared scanner extracted from core/tests/composition-audit.test.mjs (core/tools/audit/scanners/composition.mjs)
// so the internal gate and these consumer-facing rules can never drift apart. D1, D2, D7, D9 use the hint
// tables in core/tools/audit/hints.mjs, which are hand-written placeholders until A-3 generates them for real.
import { scanHtml } from '../../strict/scanners/html.mjs';
import { scanCss } from '../../strict/scanners/css.mjs';
import { hitsForEach, hitAt, fileIs, MARKUP_EXTENSIONS, SCRIPT_EXTENSIONS, CSS_EXTENSIONS } from '../util.mjs';
import { TAG_HINTS, CLASS_HINTS, ROLE_HINTS, API_HINTS, UTILITY_LAYOUT_CLASSES, UTILITY_LAYOUT_PREFIXES } from '../hints.mjs';
import { scanPointerDrag, scanArrowKeyNav, scanFocusTrap, scanManualRole } from '../scanners/composition.mjs';

const isMarkup = file => fileIs(file, MARKUP_EXTENSIONS);
const isScript = file => fileIs(file, SCRIPT_EXTENSIONS);
const isCss = file => fileIs(file, CSS_EXTENSIONS);
const isPkTag = name => /^pk-/i.test(name);

// Splits a CSS selector list ("a, b::part(c)") on its top-level commas, ignoring commas inside parens (an
// :is(), :where() or ::part() argument list can itself contain commas). D8 needs this to judge each selector
// in a rule on its own: one comma-separated selector using ::part() must not hide a sibling selector in the
// same rule that reaches into a pk-* element without it (D2 has no equivalent need - it matches single classes).
function splitSelectorList(selectorText) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selectorText.length; i++) {
        const ch = selectorText[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
            parts.push(selectorText.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(selectorText.slice(start));
    return parts;
}

function classListsIn(file) {
    const { nodes } = scanHtml(file.text);
    const out = [];
    for (const node of nodes) {
        if (node.closing || isPkTag(node.name)) continue;
        const value = node.attrs.class ?? node.attrs.className;
        if (typeof value !== 'string') continue;
        for (const cls of value.split(/\s+/).filter(Boolean)) out.push({ cls, line: node.line, column: node.column });
    }
    return out;
}

function rolesIn(file) {
    const { nodes } = scanHtml(file.text);
    return nodes.filter(n => !n.closing && !isPkTag(n.name) && typeof n.attrs.role === 'string').map(n => ({ role: n.attrs.role, line: n.line, column: n.column }));
}

export const D_RULES = [
    {
        id: 'D1',
        category: 'D',
        detects: 'a raw tag that has a pk-* equivalent',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#31-elements-tag-alias-and-api-hints',
        fixTemplate: 'FIX: {file}:{line} writes <{found}>. PlainKit already ships {element}: use <{element}{attrs}>. {docs}. If a real gap remains, file it under #336; do not keep a copy. [D1]',
        applies: isMarkup,
        scan(file) {
            const { nodes } = scanHtml(file.text);
            return nodes
                .filter(n => !n.closing && TAG_HINTS[n.name.toLowerCase()])
                .map(n => ({ line: n.line, column: n.column, message: `<${n.name}>`, found: n.name.toLowerCase(), element: TAG_HINTS[n.name.toLowerCase()], attrs: '' }));
        },
    },
    {
        id: 'D2',
        category: 'D',
        detects: 'a hand-rolled component by class name or manual role',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#31-elements-tag-alias-and-api-hints',
        fixTemplate: 'FIX: {file}:{line} hand-rolls {found}. PlainKit already ships {element}. {docs}. [D2]',
        applies: file => isMarkup(file) || isCss(file),
        scan(file) {
            const hits = [];
            if (isMarkup(file)) {
                for (const { cls, line, column } of classListsIn(file)) {
                    if (CLASS_HINTS[cls]) hits.push({ line, column, message: `class="${cls}"`, found: `class="${cls}"`, element: CLASS_HINTS[cls] });
                }
                for (const { role, line, column } of rolesIn(file)) {
                    if (ROLE_HINTS[role]) hits.push({ line, column, message: `role="${role}"`, found: `role="${role}"`, element: ROLE_HINTS[role] });
                }
            }
            if (isCss(file)) {
                const { nodes } = scanCss(file.text);
                for (const node of nodes.filter(n => n.kind === 'rule')) {
                    for (const cls of Object.keys(CLASS_HINTS)) {
                        // A word-boundary-only check (`\b`) treats the hyphen in `.text-danger` as a boundary too,
                        // so it matches on the "text" hint even though that's a different, unrelated class name
                        // (#684, D2). Require the class name to end at the selector (`.text`) or at a non-name
                        // character that cannot continue a class name (not a hyphen either), so a hint only fires
                        // on the exact class, never a class that merely starts with it.
                        if (new RegExp(`\\.${cls}(?![\\w-])`).test(node.name)) {
                            hits.push({ line: node.line, column: node.column, message: `.${cls}`, found: `.${cls}`, element: CLASS_HINTS[cls] });
                        }
                    }
                }
            }
            return hits;
        },
    },
    {
        id: 'D3',
        category: 'D',
        detects: 'hand-rolled pointer drag (setPointerCapture, or pointerdown + pointermove)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/tests/composition-audit.test.mjs',
        fixTemplate: 'FIX: {file}:{line} wires raw pointer drag. pk-splitter (resize) and pk-sortable/pk-kanban (reorder) own this; compose one, or allow-list this file with a reason. [D3]',
        applies: isScript,
        scan: file => scanPointerDrag(file.text).map(h => ({ ...h, found: h.message })),
    },
    {
        id: 'D4',
        category: 'D',
        detects: 'hand-rolled arrow/Home/End keyboard navigation',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/tests/composition-audit.test.mjs',
        fixTemplate: 'FIX: {file}:{line} wires {found}. pk-tabs, pk-tree, pk-menu, pk-list-box, pk-radio-group and pk-splitter already own this kind of navigation; compose one, or allow-list this file with a reason. [D4]',
        applies: isScript,
        scan: file => scanArrowKeyNav(file.text).map(h => ({ ...h, found: h.message })),
    },
    {
        id: 'D5',
        category: 'D',
        detects: 'hand-built focus trap',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/tests/composition-audit.test.mjs',
        fixTemplate: 'FIX: {file}:{line} builds {found}. pk-dialog and pk-drawer already trap focus; compose one, or allow-list this file with a reason. [D5]',
        applies: isScript,
        scan: file => scanFocusTrap(file.text).map(h => ({ ...h, found: h.message })),
    },
    {
        id: 'D6',
        category: 'D',
        detects: 'a manual interactive ARIA role set from script',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/tests/composition-audit.test.mjs',
        fixTemplate: 'FIX: {file}:{line} sets {found} from script. An existing pk-* element likely already owns this role; compose one, or allow-list this file with a reason. [D6]',
        applies: isScript,
        scan: file => scanManualRole(file.text).map(h => ({ ...h, found: h.message })),
    },
    {
        id: 'D7',
        category: 'D',
        detects: 'reimplemented behaviour by platform API (a hint, never an error: the API has other legitimate uses)',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#31-elements-tag-alias-and-api-hints',
        fixTemplate: 'FIX: {file}:{line} calls {found}. {element} already wraps this; check whether it covers your case before keeping a custom call. [D7]',
        applies: isScript,
        scan(file) {
            const hits = [];
            for (const { re, element, api } of API_HINTS) {
                const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
                hits.push(...hitsForEach(file.text, g, m => hitAt(file.text, m.index, api, { found: api, element })));
            }
            return hits;
        },
    },
    {
        id: 'D8',
        category: 'D',
        detects: 'custom CSS styling a PlainKit element from outside (excluding documented ::part() styling)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#21-family-d-duplicating-an-element-or-its-interaction-logic-owner-goal-1',
        fixTemplate: 'FIX: {file}:{line} styles {found} from outside. Use the element\'s documented attribute or --pk-<element>-<part> hook instead of an external selector. [D8]',
        applies: isCss,
        scan(file) {
            const { nodes } = scanCss(file.text);
            const hits = [];
            for (const node of nodes.filter(n => n.kind === 'rule')) {
                // Judge each selector in a comma-separated list on its own (#684): a rule can mix a sanctioned
                // `::part()` selector with a plain one that reaches into a pk-* element's internals, e.g.
                // "pk-tabs, pk-app-shell::part(header) { ... }" - skipping the whole rule because *some* selector
                // uses ::part() would hide the real `pk-tabs` override sitting right next to it.
                const offending = splitSelectorList(node.name).find(selector => {
                    if (selector.includes('::part(')) return false; // documented extension point (design section 2.1, D8)
                    return /\bpk-[a-z][a-z0-9-]*/i.test(selector);
                });
                if (offending == null) continue;
                const m = /\bpk-[a-z][a-z0-9-]*/i.exec(offending);
                hits.push({ line: node.line, column: node.column, message: node.name.trim(), found: m[0] });
            }
            return hits;
        },
    },
    {
        id: 'D9',
        category: 'D',
        detects: 'utility-class layout built by hand (flex/grid utility classes or ad hoc flex/grid CSS)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#21-family-d-duplicating-an-element-or-its-interaction-logic-owner-goal-1',
        fixTemplate: 'FIX: {file}:{line} lays out with {found}. Use pk-stack, pk-cluster, pk-grid or pk-toolbar instead of hand-built utility layout. [D9]',
        applies: file => isMarkup(file) || isCss(file),
        scan(file) {
            const hits = [];
            if (isMarkup(file)) {
                for (const { cls, line, column } of classListsIn(file)) {
                    if (UTILITY_LAYOUT_CLASSES.has(cls) || UTILITY_LAYOUT_PREFIXES.some(p => cls.startsWith(p))) {
                        hits.push({ line, column, message: `class="${cls}"`, found: `class="${cls}"` });
                    }
                }
            }
            if (isCss(file)) {
                const { nodes } = scanCss(file.text);
                for (const node of nodes.filter(n => n.kind === 'rule')) {
                    const props = new Set(node.declarations.map(d => d.property));
                    const display = node.declarations.find(d => d.property === 'display' && /\b(flex|grid)\b/.test(d.value));
                    if (display && props.has('gap')) {
                        hits.push({ line: node.line, column: node.column, message: `display: ${display.value}; gap`, found: `display: ${display.value} + gap` });
                    }
                }
            }
            return hits;
        },
    },
];
