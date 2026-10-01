// Composition-tier rules (#736, docs/superpowers/specs/2026-09-30-composition-tiers-design.md, section 4). Pure: takes the element sources
// (loadElementSources()) and the page factory sources, returns findings; core/tests/tiers.test.mjs holds them to core/tools/tiers.baseline.json
// (today's debt), so only NEW debt fails. The baseline only shrinks: never add an entry to hide a finding.
//
//   C1  dependency direction: an element's own sources (js, html, css) name no pk-* element of a higher tier (element < component < page < shell).
//   C2  tier present: enforced by validateApi (element-api.mjs). "Equal to its folder" starts when the folders move (spec phases 5-6).
//   C4  an element (tier "element") renders no pk-* element: its own rendering (html template, the DOM its js builds) is base HTML only (owner rule, #736).
//       Detection (`renders`): a pk-* tag of a known element counts when it is (a) markup, `<pk-x` in the template or in a string of the js, or (b) a string literal
//       that is exactly the tag ('pk-x', "pk-x" or `pk-x`) and is the argument of createElement(NS) or a later argument of a call (h(doc, 'pk-x', ...)); a FIRST
//       argument or a comparison is a name lookup or an event name (closest, querySelector, whenDefined, customElements.get, emit, localName ===) and is skipped, so
//       is a tag inside a longer selector string. Over-flagging is possible (a tag in a list literal after a comma); fix it in the source, never in the rule. Scanned: the element's html and js plus the js/ modules that js imports directly (static
//       or import('../../js/x.js')). Limits: one level of imports (not transitive, so logger infrastructure such as js/log-outputs.js never counts); a tag built by
//       string concatenation is not seen; css is not scanned (a selector names an element, it cannot render one). Events from slotted children and lookups stay allowed.
//       Static helpers (#766, owner decision): the pk-* a static helper function creates (pk-dialog's `btn`, pk-toast-stack's `show`) do NOT count, but only for
//       functions named in the reviewed list core/tools/tiers.helpers.json ({ "<element>": ["<function>", ...] }); each line of that file is visible in a pull request, so it
//       cannot become a loophole. Rules for a listed function: it is a function of the element's own module (`function name(` or `const name = (...) =>`), the element's
//       lifecycle (connected, disconnected, changed, updated, render, template) never calls it, the element's module imports no other element statically (the helper
//       loads what it creates lazily, when called), it must create a pk-* (else the entry is unnecessary) and it must exist (else it is stale).
//       Detection: the body of the named function (balanced braces from the first `{` after its parameter list) is blanked before the C4 scan. Limits: a brace inside a
//       string or regex literal in the body unbalances the match; an expression-bodied arrow function (no braces) is not found and is reported as missing; the template,
//       the other functions of the module and the js/ modules it imports are scanned as before. Problems with the list itself have the rule id C4-helper.
//   C3  one element per page factory: every core/js/app/pages factory that declares a PAGE_TYPE (except "custom", which renders nothing of its own) is
//       named by the pageType of exactly one page-tier element, which is the element that factory creates; every pageType names a factory.
import { TIERS } from './element-api.mjs';

const RANK = Object.fromEntries(TIERS.map((t, i) => [t, i]));

// Comments name elements too ("like pk-tool-page's run"), so they are dropped before the references are read.
export const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const refs = text => new Set([...stripComments(text).matchAll(/\bpk-[a-z][a-z0-9-]*/g)].map(m => m[0]));

const CREATES = /(?:createElement(?:NS)?\(\s*|,\s*)$/;

/** The pk-* tags of known elements that `text` (js or html) renders, per the C4 rule above. */
export function renders(text, known) {
    const src = stripComments(text), out = new Set();
    for (const m of src.matchAll(/<(pk-[a-z][a-z0-9-]*)/g)) if (known.has(m[1])) out.add(m[1]);
    for (const m of src.matchAll(/(['"`])(pk-[a-z][a-z0-9-]*)\1/g)) if (known.has(m[2]) && CREATES.test(src.slice(Math.max(0, m.index - 40), m.index))) out.add(m[2]);
    return out;
}

const importedJs = behaviour => [...(behaviour ?? '').matchAll(/(?:from\s*|import\(\s*)['"]\.\.\/\.\.\/js\/([\w./-]+\.js)['"]/g)].map(m => m[1]);

const decl = name => new RegExp(`(?:function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(|^\\s*(?:static\\s+)?(?:async\\s+)?${name}\\s*\\()`, 'm');
const balanced = (src, from, open, close) => {
    let depth = 0;
    for (let i = from; i < src.length; i++) {
        if (src[i] === open) depth++;
        else if (src[i] === close && --depth === 0) return i;
    }
    return -1;
};

/** [start, end) of the body of the function or method `name` in `src` (comments already stripped), or null. */
export function bodyRange(src, name) {
    const m = decl(name).exec(src);
    if (!m) return null;
    const params = balanced(src, m.index + m[0].length - 1, '(', ')');
    const brace = params < 0 ? -1 : src.indexOf('{', params);
    const end = brace < 0 ? -1 : balanced(src, brace, '{', '}');
    return end < 0 ? null : [brace, end + 1];
}

/** `src` with the bodies of the listed functions blanked. */
export const withoutHelpers = (src, names) => names.reduce((s, n) => { const r = bodyRange(s, n); return r ? s.slice(0, r[0]) + s.slice(r[1]) : s; }, src);

const LIFECYCLE = ['connected', 'disconnected', 'changed', 'updated', 'render', 'template'];

/** Problems with the reviewed helper list itself (rule C4-helper). */
export function checkHelperList(elements, list) {
    const out = [], known = new Set(elements.map(e => e.meta.tag));
    for (const [name, fns] of Object.entries(list)) {
        const el = elements.find(e => e.name === name);
        if (!el) { out.push({ rule: 'C4-helper', element: name, ref: name, message: `tiers.helpers.json names ${name}, which is no element` }); continue; }
        const src = stripComments(el.behaviour ?? '');
        if (/^import\s[^;]*['"]\.\.\/(?!\.\.\/js\/)/m.test(src)) out.push({ rule: 'C4-helper', element: name, ref: name, message: `${el.meta.tag} imports another element statically; a listed helper loads what it creates lazily` });
        for (const fn of fns) {
            const r = bodyRange(src, fn), at = `${el.meta.tag} helper ${fn}`, bad = message => out.push({ rule: 'C4-helper', element: name, ref: fn, message });
            if (!r) { bad(`${at} does not exist (stale entry in tiers.helpers.json, or an expression-bodied arrow function)`); continue; }
            if (![...renders(src.slice(...r), known)].some(t => t !== el.meta.tag)) bad(`${at} creates no other pk-* element (unnecessary entry in tiers.helpers.json)`);
            for (const lc of LIFECYCLE) {
                const lr = bodyRange(src, lc);
                if (lr && new RegExp(`\\b${fn}\\s*\\(`).test(src.slice(...lr))) bad(`${at} is called from ${lc}; a listed helper is never part of the element's own rendering`);
            }
        }
    }
    return out;
}

/** `helpers` maps a core/js file name ("page-states.js") to its source. */
export function checkTiers(elements, factories, helpers = {}, helperList = {}) {
    const out = checkHelperList(elements, helperList);
    const byTag = new Map(elements.map(e => [e.meta.tag, e]));
    for (const el of elements) {
        const mine = RANK[el.meta.tier];
        for (const ref of [...refs([el.template, el.css, el.behaviour ?? ''].join('\n'))].sort()) {
            const target = byTag.get(ref);
            if (!target || target === el || mine === undefined) continue;
            if (RANK[target.meta.tier] > mine) out.push({ rule: 'C1', element: el.name, ref, message: `${el.meta.tier} ${el.meta.tag} uses ${target.meta.tier} ${ref}` });
        }
    }
    const known = new Set(byTag.keys());
    for (const el of elements.filter(e => e.meta.tier === 'element')) {
        const seen = new Map();
        for (const [where, text] of [[el.name, [el.template, withoutHelpers(stripComments(el.behaviour ?? ''), helperList[el.name] ?? [])].join('\n')], ...importedJs(el.behaviour).map(f => [`js/${f}`, helpers[f] ?? ''])]) {
            for (const ref of renders(text, known)) if (ref !== el.meta.tag && !seen.has(ref)) seen.set(ref, where);
        }
        for (const [ref, where] of [...seen].sort()) out.push({ rule: 'C4', element: el.name, ref, message: `element ${el.meta.tag} renders ${ref} (in ${where}); an element is built from base HTML only` });
    }
    const pages = elements.filter(e => e.meta.tier === 'page');
    const ids = new Set(factories.filter(f => f.id !== 'custom').map(f => f.id));
    for (const f of factories.filter(x => x.id !== 'custom')) {
        const owners = pages.filter(p => p.meta.pageType === f.id);
        if (owners.length !== 1) out.push({ rule: 'C3', element: f.id, ref: f.id, message: `page factory "${f.id}" is named by ${owners.length} page elements, expected exactly 1` });
        else if (!refs(f.source).has(owners[0].meta.tag)) out.push({ rule: 'C3', element: f.id, ref: owners[0].meta.tag, message: `page factory "${f.id}" does not create ${owners[0].meta.tag}` });
    }
    for (const p of pages) if (!ids.has(p.meta.pageType)) out.push({ rule: 'C3', element: p.name, ref: String(p.meta.pageType), message: `${p.meta.tag} has pageType "${p.meta.pageType}", which is no core/js/app/pages factory` });
    return out;
}

export const key = f => `${f.rule} ${f.element} ${f.ref}`;
