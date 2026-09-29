// Family P: pages and app structure (design section 2.3, owner goal 2 - "uses the app framework wrongly or not
// at all"). P1-P9 are text scans, per the design's "how (static)" column; several are windowed regex checks
// rather than a real parse (design section 4.2, "honest limits" - approximate, not proof of conformance).
//
// Severity: the design's table (section 2.3) is followed as written, with one owner override recorded on issue
// #518: P3 is inference-based like D2/D9 (it *guesses* a page type from an element mix) and the owner decided
// inference-based rules stay warnings even in strict mode, so P3 is { normal: 'warn', strict: 'warn' } here,
// not the design table's literal "this is S8" (S8 itself is warn/error and is unaffected - it flags the same
// `custom`/`moduleFromMount` text, just without the page-type guess).
import { hitAt, hitsForEach, fileIs, MARKUP_EXTENSIONS, SCRIPT_EXTENSIONS } from '../util.mjs';
import { PAGE_TYPES } from '../hints.mjs';

const isMarkup = file => fileIs(file, MARKUP_EXTENSIONS);
const isScript = file => fileIs(file, SCRIPT_EXTENSIONS);
const isMarkupOrScript = file => isMarkup(file) || isScript(file);
const isHtmlEntry = file => fileIs(file, ['.html', '.htm']);

const KNOWN_PAGE_TYPE_IDS = new Set(PAGE_TYPES.map(p => p.id));
const useWhenOf = id => PAGE_TYPES.find(p => p.id === id)?.useWhen ?? `see the "${id}" page type`;

// A route's page config runs from one `defineModule(`/`page:`-shaped match to the next occurrence of the same
// marker (or end of file). No bracket balancing: consistent with the rest of the design's scanners (S6, S9),
// which read a fixed-size or next-match window rather than parse an expression.
function windowsAfter(text, re) {
    const indices = [...text.matchAll(re)].map(m => m.index);
    return indices.map((start, i) => ({ start, end: indices[i + 1] ?? Math.min(text.length, start + 1200), text: text.slice(start, indices[i + 1] ?? Math.min(text.length, start + 1200)) }));
}

// Element-mix -> page-type guess (P3), the same spirit as D1/D2's tag/class hints but for a whole mount body
// rather than one tag. Hand-written and small on purpose (design section 2.3: "the same tag/element mix
// heuristics as D1"); a wrong guess only produces a warning, never an error (design section 4.2).
const MIX_HINTS = [
    { pageType: 'list', test: t => /<pk-table\b/.test(t) && /<pk-toolbar\b|<pk-pagination\b/.test(t) },
    { pageType: 'settings', test: t => /<pk-form\b|<pk-field-row\b/.test(t) && /\bsave\b/i.test(t) },
    { pageType: 'dashboard', test: t => /<pk-tile\b|<pk-stat\b/.test(t) },
    { pageType: 'record', test: t => /<pk-field-row\b/.test(t) && /<pk-button\b/.test(t) },
];

export const P_RULES = [
    {
        id: 'P1',
        category: 'P',
        detects: 'an HTML entry page that builds its own header/nav in a <script type=module> instead of mountApp',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} is a hand-built page with its own header and nav. One mountApp(container, config) shell with defineModule() modules replaces several pages like this. [P1]',
        applies: isHtmlEntry,
        scan(file) {
            if (!/<html\b/i.test(file.text) || /\bmountApp\s*\(/.test(file.text)) return [];
            const hasChrome = /<header\b/i.test(file.text) && /<nav\b/i.test(file.text);
            const hasModuleScript = /<script[^>]*\btype\s*=\s*["']module["']/i.test(file.text);
            if (!hasChrome || !hasModuleScript) return [];
            const m = /<html\b[^>]*>/i.exec(file.text);
            return [hitAt(file.text, m.index, 'page builds its own header/nav', { found: 'this page' })];
        },
    },
    {
        id: 'P2',
        category: 'P',
        detects: 'mountApp with no defineModule modules, or a defineModule missing id/title/routes',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} {found}. [P2]',
        applies: isScript,
        scan(file) {
            const hits = [];
            const mountAppMatch = /\bmountApp\s*\(/.exec(file.text);
            if (mountAppMatch && !/\bdefineModule\s*\(/.test(file.text)) {
                hits.push(hitAt(file.text, mountAppMatch.index, 'mountApp() with no defineModule() modules', { found: 'calls mountApp() with no defineModule() modules - everything lives in one config blob' }));
            }
            for (const w of windowsAfter(file.text, /\bdefineModule\s*\(\s*\{/g)) {
                const missing = ['id', 'title', 'routes'].filter(k => !new RegExp(`\\b${k}\\s*:`).test(w.text));
                if (missing.length) hits.push(hitAt(file.text, w.start, `defineModule() missing ${missing.join('/')}`, { found: `defineModule({...}) has no ${missing.join('/')} - a module needs id, title and routes` }));
            }
            return hits;
        },
    },
    {
        id: 'P3',
        category: 'P',
        detects: 'a custom mount (or moduleFromMount) whose element mix matches a built-in page type (inference; owner: stays a warning even in strict, like D2/D9)',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} mounts hand-built DOM. The "{pageType}" page type is for this: {useWhen} Use page: \'{pageType}\' instead of a custom mount. [P3]',
        applies: isScript,
        scan(file) {
            const hits = [];
            for (const w of windowsAfter(file.text, /page\s*:\s*['"]custom['"]|\bmoduleFromMount\s*\(/g)) {
                const guess = MIX_HINTS.find(h => h.test(w.text));
                if (!guess) continue;
                hits.push(hitAt(file.text, w.start, `candidate page type: ${guess.pageType}`, { found: `mounts hand-built DOM`, pageType: guess.pageType, useWhen: useWhenOf(guess.pageType) }));
            }
            return hits;
        },
    },
    {
        id: 'P4',
        category: 'P',
        detects: 'hand-built header/side nav/breadcrumbs/footer next to pk-app-shell (or its parts)',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} hand-builds {found} beside pk-app-shell. Use pk-app-shell/pk-navbar/pk-side-nav/pk-breadcrumb/pk-page-header for app chrome instead. [P4]',
        applies: isMarkup,
        scan(file) {
            if (!/<pk-app-shell\b|<pk-navbar\b|<pk-side-nav\b|<pk-breadcrumb\b|<pk-page-header\b/.test(file.text)) return [];
            const hits = [];
            for (const [re, label] of [
                [/<header\b/gi, '<header>'],
                [/<nav\b/gi, '<nav>'],
                [/<footer\b/gi, '<footer>'],
                [/\bclass\s*=\s*["'][^"']*\bsidebar\b/gi, 'class="sidebar"'],
                [/\bclass\s*=\s*["'][^"']*\bbreadcrumb\b/gi, 'class="breadcrumb"'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'P5',
        category: 'P',
        detects: 'a list/record route rendering its own filter bar, pager, empty state or loading skeleton by hand',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} hand-builds {found} instead of using the page type\'s own config (empty/error/loading, or pk-pagination). [P5]',
        applies: isMarkupOrScript,
        scan(file) {
            if (!/page\s*:\s*['"](?:list|record)['"]/.test(file.text)) return [];
            const hits = [];
            for (const [re, label] of [
                [/\bclass\s*=\s*["'][^"']*\bpager\b/gi, 'class="pager"'],
                [/\bclass\s*=\s*["'][^"']*\bempty-state\b/gi, 'class="empty-state"'],
                [/\bclass\s*=\s*["'][^"']*\bskeleton\b/gi, 'class="skeleton"'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'P6',
        category: 'P',
        detects: 'localStorage/sessionStorage/history.pushState/location.hash used in app-framework code instead of defineModule({ state }) and the router',
        severity: { normal: 'warn', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} bypasses the module with {found}. defineModule({{ state }}) and the router already own persistence and navigation. [P6]',
        applies: isScript,
        scan(file) {
            if (!/\bdefineModule\s*\(|\bmountApp\s*\(/.test(file.text)) return [];
            const hits = [];
            for (const [re, label] of [
                [/\blocalStorage\b/g, 'localStorage'],
                [/\bsessionStorage\b/g, 'sessionStorage'],
                [/\bhistory\.pushState\s*\(/g, 'history.pushState()'],
                [/\blocation\.hash\b/g, 'location.hash'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, label, { found: label })));
            }
            return hits;
        },
    },
    {
        id: 'P7',
        category: 'P',
        detects: 'a list/record route config with no empty, error or loading handling',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} has a "{pageType}" route with no empty/error/loading handling. Add the page type\'s own state keys instead of leaving the states unhandled. [P7]',
        applies: isScript,
        scan(file) {
            const hits = [];
            for (const w of windowsAfter(file.text, /page\s*:\s*['"](list|record)['"]/g)) {
                const pageType = /page\s*:\s*['"](list|record)['"]/.exec(w.text)?.[1];
                if (!pageType) continue;
                if (/\b(?:empty|error|loading)\s*:/.test(w.text)) continue;
                hits.push(hitAt(file.text, w.start, `"${pageType}" route with no empty/error/loading`, { found: `has no empty/error/loading handling`, pageType }));
            }
            return hits;
        },
    },
    {
        id: 'P8',
        category: 'P',
        detects: 'an unknown page-type id in a route (typo, or a removed built-in id)',
        severity: { normal: 'error', strict: 'error' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} routes to page: \'{found}\', which is not a built-in page type. Built-in ids: {known}. If this is a module-registered pageTypes/layouts entry, ignore; otherwise it is likely a typo. [P8]',
        applies: isScript,
        scan(file) {
            // A module may register its own page types (defineModule({ pageTypes: { kanban... } })); those ids are
            // legitimate in this file even though they are not built in, so they are added to the known set per
            // file rather than reported (design section 2.3: "pure data comparison, low false-positive").
            const own = new Set();
            for (const m of file.text.matchAll(/\b(?:pageTypes|layouts)\s*:\s*\{([^}]*)\}/g)) {
                for (const k of m[1].matchAll(/([A-Za-z_$][\w$-]*)\s*:/g)) own.add(k[1]);
            }
            const known = new Set([...KNOWN_PAGE_TYPE_IDS, ...own]);
            const hits = [];
            for (const m of file.text.matchAll(/\bpage\s*:\s*['"]([\w-]+)['"]/g)) {
                if (known.has(m[1])) continue;
                hits.push(hitAt(file.text, m.index, m[1], { found: m[1], known: [...KNOWN_PAGE_TYPE_IDS].join(', ') }));
            }
            return hits;
        },
    },
    {
        id: 'P9',
        category: 'P',
        detects: 'a hand-written hash-route href/location instead of module nav/routes and ctx.navigate',
        severity: { normal: 'warn', strict: 'warn' },
        docs: 'docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md#23-family-p-pages-and-app-structure-owner-goal-2',
        fixTemplate: 'FIX: {file}:{line} links with {found}. Reach a page through the module\'s nav/routes and ctx.navigate(path) instead of a hand-written hash string. [P9]',
        applies: isMarkupOrScript,
        scan(file) {
            const hits = [];
            for (const [re, label] of [
                [/\bhref\s*=\s*["']#\/[^"']*["']/g, 'href="#/..."'],
                [/\blocation\.hash\s*=\s*['"]#?\/[^'"]*['"]/g, 'location.hash = "#/..."'],
            ]) {
                hits.push(...hitsForEach(file.text, re, m => hitAt(file.text, m.index, m[0], { found: label })));
            }
            return hits;
        },
    },
];
