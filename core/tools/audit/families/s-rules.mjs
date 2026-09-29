// Family S: the strict-module rules of #515, kept with their ids and text, made available to a consumer app
// (design section 2.2). What differs for a consumer is only severity (S10-S12 stay off/deferred per the
// design's table and are not implemented here). Each row is `{ id, category, detects, severity, fixTemplate,
// docs, applies, scan }`; `rules.mjs` turns it into the engine's `{ id, applies, scan, meta }` shape and fills
// `{slot}`s in `fixTemplate` from what `scan` returns on each hit (`found`, plus whatever else a hit carries).
import { hitsForEach, hitAt, fileIs, MARKUP_EXTENSIONS, SCRIPT_EXTENSIONS, CSS_EXTENSIONS } from '../util.mjs';
import { TAG_HINTS } from '../hints.mjs';
import { stripCommentsAndKeepStrings } from '../../strict/scanners/css.mjs';

const isCss = file => fileIs(file, CSS_EXTENSIONS);
const isMarkupOrScript = file => fileIs(file, [...MARKUP_EXTENSIONS, ...SCRIPT_EXTENSIONS]);

export const S_RULES = [
    {
        id: 'S1',
        category: 'S',
        detects: 'own CSS files, @import, <link rel=stylesheet>, adoptedStyleSheets, <style>',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/STANDARDS.md#ownership-and-reactivity',
        fixTemplate: 'FIX: {file}:{line} defines {found}. PlainKit elements carry their own styling; use an element or its --pk-<element>-<part> hooks instead of app CSS. {docs}. [S1]',
        applies: () => true,
        scan(file) {
            const hits = [];
            if (isCss(file) && file.text.trim()) hits.push(hitAt(file.text, 0, 'a CSS file', { found: 'a CSS file' }));
            for (const [re, label] of [
                [/@import\s+/g, '@import'],
                [/<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi, '<link rel="stylesheet">'],
                [/<style[\s>]/gi, '<style> element'],
                [/\badoptedStyleSheets\b/g, 'adoptedStyleSheets'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S2',
        category: 'S',
        detects: 'style attribute or property (style=, .style, cssText, setProperty)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/STANDARDS.md#ownership-and-reactivity',
        fixTemplate: 'FIX: {file}:{line} sets {found}. Style through an element attribute or a --pk-<element>-<part> token, not inline style. [S2]',
        applies: isMarkupOrScript,
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/\bstyle\s*=\s*["'{]/g, 'style='],
                [/\.style\.(?!sheet)/g, '.style'],
                [/\bcssText\b/g, 'cssText'],
                [/\.setProperty\s*\(/g, '.setProperty()'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S3',
        category: 'S',
        detects: 'class, className, classList',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/STANDARDS.md#ownership-and-reactivity',
        fixTemplate: 'FIX: {file}:{line} uses {found}. Compose pk-* elements instead of adding classes to style them. [S3]',
        applies: isMarkupOrScript,
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/\bclass\s*=\s*["']/g, 'class='],
                [/\bclassName\s*=/g, 'className'],
                [/\bclassList\b/g, 'classList'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S4',
        category: 'S',
        detects: 'raw standard tags with a pk-* equivalent (superseded in a consumer run by D1\'s hint; S4 is the strict id)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'core/STANDARDS.md#composition',
        fixTemplate: 'FIX: {file}:{line} writes a raw <{found}>. PlainKit ships pk-* elements for the standard controls; use one instead of the raw tag. [S4]',
        applies: file => fileIs(file, MARKUP_EXTENSIONS),
        scan(file) {
            const names = Object.keys(TAG_HINTS).join('|');
            const re = new RegExp(`<(${names})\\b`, 'gi');
            return hitsForEach(file.text, re, m => hitAt(file.text, m.index, m[1], { found: m[1].toLowerCase() }));
        },
    },
    {
        id: 'S5',
        category: 'S',
        detects: 'HTML sinks (innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, createContextualFragment, srcdoc)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'AGENTS.md#rules-that-are-easy-to-break',
        fixTemplate: 'FIX: {file}:{line} uses {found}. Prefer DOM APIs or textContent over an HTML sink. [S5]',
        applies: file => fileIs(file, SCRIPT_EXTENSIONS),
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/\.innerHTML\b/g, 'innerHTML'],
                [/\.outerHTML\b/g, 'outerHTML'],
                [/\.insertAdjacentHTML\s*\(/g, 'insertAdjacentHTML'],
                [/document\.write\s*\(/g, 'document.write'],
                [/\bnew\s+DOMParser\s*\(/g, 'DOMParser'],
                [/\.createContextualFragment\s*\(/g, 'createContextualFragment'],
                [/\bsrcdoc\b/g, 'srcdoc'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S6',
        category: 'S',
        detects: 'imports outside the allowed set (a consumer names its own libraries; approximate without config)',
        severity: { normal: 'off', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#22-the-strict-module-rules-for-consumers-s-family-from-515',
        fixTemplate: 'FIX: {file}:{line} imports {found}. List it in the config\'s "imports" option, or import plainkit / a relative module instead. [S6]',
        applies: file => fileIs(file, SCRIPT_EXTENSIONS),
        scan(file) {
            // Approximate without a consumer config (that arrives with the CLI, A-5/A-6): flags a bare-specifier
            // import/require that is not the plainkit package itself and not a relative/absolute path.
            const re = /\bimport\s+(?:[\w${},*\s]+from\s+)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            const hits = [];
            let m;
            while ((m = re.exec(file.text))) {
                const spec = m[1] || m[2];
                if (spec && spec !== 'plainkit' && !spec.startsWith('plainkit/') && !/^[./]/.test(spec)) {
                    hits.push(hitAt(file.text, m.index, spec, { found: spec }));
                }
            }
            return hits;
        },
    },
    {
        id: 'S7',
        category: 'S',
        detects: 'direct platform access (document., window., location, localStorage, addEventListener, timers, fetch)',
        severity: { normal: 'off', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#22-the-strict-module-rules-for-consumers-s-family-from-515',
        fixTemplate: 'FIX: {file}:{line} touches the platform directly ({found}). Fine in a bootstrap file; inside a module this belongs behind the SDK\'s own APIs. [S7]',
        applies: file => fileIs(file, SCRIPT_EXTENSIONS),
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/\bdocument\./g, 'document.'],
                [/\bwindow\./g, 'window.'],
                [/\blocation\./g, 'location.'],
                [/\blocalStorage\b/g, 'localStorage'],
                [/\bsessionStorage\b/g, 'sessionStorage'],
                [/\baddEventListener\s*\(/g, 'addEventListener'],
                [/\bsetTimeout\s*\(/g, 'setTimeout'],
                [/\bsetInterval\s*\(/g, 'setInterval'],
                [/\bfetch\s*\(/g, 'fetch'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S8',
        category: 'S',
        detects: 'custom page type, moduleFromMount, module-defined pageTypes/layouts',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} uses {found}. Prefer a built-in page type over a custom mount function. [S8]',
        applies: file => fileIs(file, SCRIPT_EXTENSIONS),
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/page\s*:\s*['"]custom['"]/g, "page: 'custom'"],
                [/\bmoduleFromMount\s*\(/g, 'moduleFromMount()'],
                [/\bpageTypes\s*:/g, 'pageTypes:'],
                [/\blayouts\s*:/g, 'layouts:'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'S9',
        category: 'S',
        detects: 'literal design values (colours, lengths with units, z-index, font names)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'AGENTS.md#rules-that-are-easy-to-break',
        fixTemplate: 'FIX: {file}:{line} uses the literal value {found}. Use a design token (--color-*, --space-*, --text-*, --radius-*) instead. [S9]',
        applies: isCss,
        scan(file) {
            // Scan comment-free text (length- and offset-preserving, so a hit's index still lands on the
            // right character in file.text) rather than the raw file text, so prose inside a `/* ... */`
            // comment (e.g. "a page framed as a 375px device") never matches as if it were a real value.
            const stripped = stripCommentsAndKeepStrings(file.text);
            const hits = [];
            for (const [re, label] of [
                [/#[0-9a-fA-F]{3,8}\b/g, 'a literal hex colour'],
                [/\b(?:rgba?|hsla?)\s*\(/g, 'a literal colour function'],
                [/(?<!var\([^)]*)\b\d+(?:\.\d+)?(?:px|rem|em)\b/g, 'a literal length'],
                [/\bz-index\s*:\s*\d+/g, 'a literal z-index'],
            ]) {
                hits.push(...hitsForEach(stripped, re, m => hitAt(file.text, m.index, m[0], { found: m[0] })));
            }
            return hits;
        },
    },
];
