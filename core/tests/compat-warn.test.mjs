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
