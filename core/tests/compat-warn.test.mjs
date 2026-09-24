// The compat-class migration check (issue #214): the lookup table (every retired class maps to a real pk-* hint) and the scan
// (warns once per class, through the logger, at warn level, and picks up elements added later via the observer callback).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getLogBuffer, clearLogBuffer } from '../js/log.js';

// A minimal fake DOM: classList (a Set) and querySelectorAll('[class]') over a flat list of descendants, enough for
// compat-warn.js's reportIn(), which never uses anything else.
const el = classes => ({ classList: new Set(classes) });
const root = (...kids) => ({ classList: null, querySelectorAll: sel => (sel === '[class]' ? kids.filter(k => k.classList.size) : []) });

async function freshModule() {
    globalThis.MutationObserver ??= class {
        constructor(fn) { this.fn = fn; }
        observe() {} disconnect() {}
    };
    // A fresh module instance per test: the "reported once per page" memory is module-level state.
    return import(`../js/compat-warn.js?${Math.random()}`);
}

test('RETIRED_CLASSES: every entry names a pk-* replacement, and covers the classes the issue calls out by name', async () => {
    const { RETIRED_CLASSES } = await freshModule();
    for (const [cls, hint] of Object.entries(RETIRED_CLASSES)) {
        assert.match(hint, /pk-[a-z-]+/, `${cls} -> "${hint}" does not name a pk-* element`);
    }
    for (const cls of ['chip', 'btn-primary', 'btn-mini', 'card-header', 'remedy', 'form-row', 'topbar-back']) {
        assert.ok(cls in RETIRED_CLASSES, `${cls} from the issue's own examples is missing`);
    }
    // Classes that survived the move to core/base/ (utilities, spacing, typography, table-content) are not retired.
    for (const cls of ['p-2', 'flow', 'lead', 'mono']) assert.ok(!(cls in RETIRED_CLASSES), `${cls} still works and should not be flagged`);
});

test('checkCompatClasses warns once per retired class found in the document, naming the replacement', async () => {
    const { checkCompatClasses } = await freshModule();
    clearLogBuffer();
    const doc = root(el(['chip', 'chip-warn']), el(['btn-primary']), el(['ordinary']));
    checkCompatClasses(doc);
    checkCompatClasses(doc); // a second scan of the same document adds nothing more
    const warnings = getLogBuffer().filter(e => e.scope === 'compat' && e.level === 'warn');
    const classes = warnings.map(w => w.detail.class).sort();
    assert.deepEqual(classes, ['btn-primary', 'chip', 'chip-warn']);
    assert.match(warnings.find(w => w.detail.class === 'chip').message, /\.chip is a retired Plainkit class.*use pk-badge or pk-tag instead/);
    clearLogBuffer();
});

test('checkCompatClasses observes later DOM additions and only reports a class the first time it appears', async () => {
    const { checkCompatClasses } = await freshModule();
    clearLogBuffer();
    const doc = root();
    let captured;
    globalThis.MutationObserver = class {
        constructor(fn) { captured = fn; }
        observe() {} disconnect() {}
    };
    const mo = checkCompatClasses(doc);
    assert.ok(mo);
    const added = el(['remedy']);
    added.nodeType = 1;
    added.classList = new Set(['remedy']);
    added.querySelectorAll = () => [];
    captured([{ addedNodes: [added] }]);
    captured([{ addedNodes: [added] }]); // the same node seen twice still warns once
    const warnings = getLogBuffer().filter(e => e.scope === 'compat' && e.detail?.class === 'remedy');
    assert.equal(warnings.length, 1);
    clearLogBuffer();
});

// The utilities removed in 0.5.0-alpha.1 (issue #254): every one gets a computed hint, and the kept set is what utilities.css still defines.
const REMOVED_UTILITIES = 'u-c-888 u-c-accent u-c-border u-c-textmuted u-cursor-default u-fs-p75em u-fs-p75r u-fs-p76r u-fs-p78r u-fs-p7em u-fs-p7r u-fs-p82r u-fs-p85em u-fs-p86r u-fs-p88r u-fs-p8em u-fs-p95r u-fs-p9r u-fw-700 u-fw-normal u-ls-none u-m-0-0-p5r u-m-0-0-p6r u-m-0-0-p75r u-m-0-2px u-m-1r-0 u-m-p25r-0 u-m-p25r-0-p75r u-m-p2r-0-0 u-m-p2r-0-p5r u-m-p35r-0-0 u-m-p4r-0-0 u-m-p5r-0 u-m-p5r-0-0 u-m-p6r-0-0 u-m-p75r-0-0 u-m-p75r-0-p25r u-mb-0 u-mb-1p25r u-mb-1p5r u-mb-4 u-mb-p25r u-mb-p3r u-mb-p4r u-mb-p5r u-mb-p6r u-mb-p75r u-mb-p8r u-minw-200px u-ml-2 u-ml-3 u-ml-4 u-ml-p25r u-ml-p35r u-ml-p3r u-ml-p4r u-mr-p25r u-mr-p4r u-mt-0 u-mt-0p25rem u-mt-2 u-mt-4 u-mt-6 u-mt-neg u-mt-p25r u-mt-p2r u-mt-p35r u-mt-p3r u-mt-p4r u-mt-p6r u-mw-220px u-mw-40r u-mw-520px u-nowrap u-opacity-55 u-ow-anywhere u-p-0 u-p-1px-0 u-p-3r u-p-p15r-p3r u-p-p5r u-p-p5r-1r-p75r u-p-p5r-p75r-p75r u-p-p5r-p7r u-p-p6r-p8r u-p-p75r-1r u-pl-0 u-pl-1p1r u-pointer u-pre-wrap u-pt-3 u-pt-p6r u-scroll-x u-ta-center u-ta-right u-td-none u-text-md u-w-110px u-w-2r u-w-3r u-w-4r u-w-5r u-w-6p5r u-w-6r u-w-7r u-w-80px u-w-90px'.split(' ');

test('utilityReplacement: every removed u-* class yields a hint, spacing snaps to the scale', async () => {
    const { utilityReplacement } = await freshModule();
    assert.equal(REMOVED_UTILITIES.length, 107);
    for (const c of REMOVED_UTILITIES) assert.ok(utilityReplacement(c).length > 0, c);
    assert.match(utilityReplacement('u-mt-p6r'), /^mt-2 /);
    assert.match(utilityReplacement('u-m-p75r-0-p25r'), /margin: var\(--space-3\) 0 var\(--space-1\)/);
    assert.equal(utilityReplacement('u-nowrap'), '.nowrap');
});

test('checkCompatClasses flags removed u-* classes, not the ones utilities.css still defines', async () => {
    const { checkCompatClasses } = await freshModule();
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../base/utilities.css', import.meta.url), 'utf8');
    const kept = [...css.matchAll(/^\.(u-[a-z0-9-]+)/gm)].map(m => m[1]);
    assert.equal(kept.length, 14, 'utilities.css changed: update KEPT_UTILITIES in js/compat-warn.js and this count');
    clearLogBuffer();
    checkCompatClasses(root(el([...kept, 'u-mb-p5r', 'u-w-6r'])));
    const flagged = getLogBuffer().filter(e => e.scope === 'compat').map(e => e.detail.class).sort();
    assert.deepEqual(flagged, ['u-mb-p5r', 'u-w-6r']);
    clearLogBuffer();
});
