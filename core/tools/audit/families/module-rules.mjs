// The "module" ruleset (issue #518 A-9b): S1-S12 as designed in
// docs/superpowers/specs/2026-09-28-site-v2-strict-modules-design.md, section 3.1. This is PlainKit's *own*
// dogfood ruleset for `core/site/**`/`core/modules/**` (owner decision on issue #518), distinct from the
// `consumer`/`consumer-strict` rulesets in ../rules.mjs, which reuse S1-S9's detection *content* for third-party
// apps but stop at S9 (the design's own table: "S10-S12 stay off/deferred" for a consumer, ../families/s-rules.mjs).
//
// Relationship to the consumer S1-S9: same ids, same detection logic (this file imports S_RULES from
// s-rules.mjs and reuses its `applies`/`scan` verbatim - the design calls this "kept with their ids and text",
// section 2.2), but a different severity: a strict module has no relaxed "normal" mode, so every S1-S9 rule here
// is `error` unconditionally, where the consumer ruleset treats most of them as `warn` outside `--strict`.
// S10-S12 are new: they check the module anatomy (section 2.1) itself, which a consumer app has no equivalent of.
//
// Deliberately NOT wired into ../rules.mjs's RULES/EXAMPLES tables or the A-8 docs-generation pipeline
// (scripts/build-skills.mjs, references/conformance-rules.md): those render rules a *consumer* should follow,
// generated into the public skills. The module ruleset audits PlainKit's own source tree, not a consumer's, so
// it has no place in a consumer-facing doc; A-9b's own instructions confirm this reading is deliberate, not an
// oversight. `--explain`/`--list-rules` (../cli.mjs) also only ever read `RULES`, so module-ruleset ids never
// leak into consumer-facing CLI output either.
import { S_RULES } from './s-rules.mjs';
import { hitAt, fileIs } from '../util.mjs';
import { stripJsCommentsAndKeepStrings } from '../../strict/scanners/js.mjs';

const MODULE_DOCS = 'docs/superpowers/specs/2026-09-28-site-v2-strict-modules-design.md#3-strict-module-mode';

// S7/S8 exemption for the mount wrappers. A module built by `moduleFromMount(mountX, ...)` (js/app/module.js) adapts an
// existing `mountX(container, options)` function, and a module with a `page: 'custom'` route that supplies a `mount`
// IS a mount function: the app framework's module host owns that mount's lifecycle, so the platform access it needs
// (document/location/timers/...) and the wrapper call itself are what S7/S8 would otherwise flag in the one place they
// are meant to live (owner decision, gallery-persist: redirect/devtools/settings). The exemption is keyed on the
// wrapper's syntax and covers only its own span: the `moduleFromMount(...)` call, or the object literal holding
// `page: 'custom'` and a `mount`. Anything else in the same file, a plain module with the same access, and a bare
// `page: 'custom'` with no mount are still flagged. Module ruleset only: the consumer S8 still prefers built-in pages.
const WRAPPER_START = /\bmoduleFromMount\s*\(|page\s*:\s*['"]custom['"]/g;
// Index of the bracket closing the opener at `i` (skipping string literals), or -1.
function matchClose(text, i) {
    let depth = 0;
    for (let k = i; k < text.length; k++) {
        const c = text[k];
        if (c === '"' || c === "'" || c === '`') {
            for (k++; k < text.length && text[k] !== c; k++) if (text[k] === '\\') k++;
        } else if (c === '(' || c === '{' || c === '[') depth++;
        else if ((c === ')' || c === '}' || c === ']') && --depth === 0) return k;
    }
    return -1;
}
// [from, to] of the innermost `{...}` enclosing `at`, or null.
function enclosingBraces(text, at) {
    for (let i = at - 1; i >= 0; i--) {
        if (text[i] !== '{') continue;
        const end = matchClose(text, i);
        if (end >= at) return [i, end];
    }
    return null;
}
function wrapperSpans(text) {
    const spans = [];
    for (const m of text.matchAll(WRAPPER_START)) {
        if (m[0].startsWith('moduleFromMount')) {
            const end = matchClose(text, m.index + m[0].length - 1);
            spans.push([m.index, end < 0 ? text.length : end]);
        } else {
            const braces = enclosingBraces(text, m.index);
            if (braces && /\bmount\b/.test(text.slice(braces[0], braces[1]))) spans.push(braces);
        }
    }
    return spans;
}
function withWrapperExempt(row) {
    return {
        ...row,
        scan(file) {
            const hits = row.scan(file);
            if (!hits.length || !/\.(m?js|jsx|tsx?)$/i.test(file.path)) return hits;
            const spans = wrapperSpans(stripJsCommentsAndKeepStrings(file.text));
            if (!spans.length) return hits;
            const starts = [0];
            for (let i = 0; i < file.text.length; i++) if (file.text[i] === '\n') starts.push(i + 1);
            const at = hit => starts[hit.line - 1] + hit.column - 1;
            return hits.filter(hit => !spans.some(([from, to]) => at(hit) >= from && at(hit) <= to));
        },
    };
}

// S1-S9: same detection as the consumer ruleset's S family, always `error` (a strict module has one mode).
const REUSED_IDS = new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);
const REUSED_S_RULES = S_RULES.filter(row => REUSED_IDS.has(row.id)).map(row => ({
    ...row,
    category: 'module',
    severity: { normal: 'error', strict: 'error' },
    docs: MODULE_DOCS,
})).map(row => (row.id === 'S7' || row.id === 'S8' ? withWrapperExempt(row) : row));

// S10: anatomy (design section 2.1). A strict module tree has no `.css` file (S1 already flags the content;
// this flags the file itself for any extension the anatomy forbids outright: `.html` other than `app.html`,
// and any stray top-level extension the layout does not name). Per-file, so it needs no directory listing.
const ALLOWED_EXTENSIONS = ['.js', '.mjs', '.json', '.razor', '.cshtml', '.md'];
const s10 = {
    id: 'S10',
    category: 'module',
    detects: 'a file the module anatomy does not allow (stray extension, or an .html file other than app.html)',
    severity: { normal: 'error', strict: 'error' },
    docs: `${MODULE_DOCS.replace('3-strict-module-mode', '21-folder-layout-checked-section-33-rule-a1')}`,
    fixTemplate: 'FIX: {file}:{line} is not part of the module anatomy ({found}). Only app.html, and files with extension .js/.mjs/.json/.razor/.cshtml/.md, belong under a strict module. [S10]',
    applies: () => true,
    scan(file) {
        const lower = file.path.toLowerCase();
        const name = lower.split(/[\\/]/).pop();
        if (name === 'app.html') return [];
        if (lower.endsWith('.html')) return [hitAt(file.text, 0, 'a stray .html file', { found: 'a stray .html file' })];
        if (fileIs(file, ALLOWED_EXTENSIONS)) return [];
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : name;
        return [hitAt(file.text, 0, `a stray ${ext} file`, { found: `a stray ${ext} file` })];
    },
};

// S11 and S12 are, by the design's own admission (section 3.1's "check" column), not static-scannable per file:
// S11 ("every strict module has module.test.mjs, at least one scenario...") needs the module's whole directory,
// and S12 (a per-module gzip size budget, ratcheted like security.allow.json) needs a build step. Both are
// registered here - so `getRuleset('module')` names all twelve ids the design specifies, and `--list-rules`
// against this ruleset is complete - but their `scan` always returns no findings from the token scanner; the
// real checks are the generic module test (S11) and a build-time measure (S12), exactly as the design says,
// not invented here as an inaccurate approximation. core/tests/strict-modules.test.mjs documents this directly.
const s11 = {
    id: 'S11',
    category: 'module',
    detects: 'a strict module missing its own test coverage (module.test.mjs, a scenario, unmount-leak coverage)',
    severity: { normal: 'error', strict: 'error' },
    docs: MODULE_DOCS,
    fixTemplate: 'FIX: {file} is part of a module with no module.test.mjs, no scenario, or no unmount-leak coverage. [S11]',
    applies: () => false, // checked by the generic module test that iterates module directories, not token-scanned
    scan: () => [],
};

const s12 = {
    id: 'S12',
    category: 'module',
    detects: 'a module over its per-module JS size budget (bytes gzip, ratcheted, never raised)',
    severity: { normal: 'error', strict: 'error' },
    docs: MODULE_DOCS,
    fixTemplate: 'FIX: {file}\'s module is over its size budget. Make the source smaller; the budget is never raised. [S12]',
    applies: () => false, // checked by a build-time gzip measure against a baseline file, not token-scanned
    scan: () => [],
};

export const MODULE_RULES = [...REUSED_S_RULES, s10, s11, s12];
