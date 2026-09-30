// Table-driven, in-memory tests for every S, D, T and A family rule (design section 10, #612 A-2, #625 A-4): a
// "wrong" snippet expecting the rule's id in the findings, a "right" snippet expecting none. No fixtures on disk -
// the engine is pure, so a file is just `{ path, text }`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../strict/engine.mjs';
import './rules.mjs'; // registers the "consumer"/"consumer-strict" rulesets as a side effect
import { RULES, getRuleMeta } from './rules.mjs';
import { DEPRECATED_ELEMENTS } from './hints.mjs';
import { EXAMPLES, MANUALLY_TESTED } from './examples.mjs';

// T7 has no real deprecated element or attribute yet (design section 2.4: "empty on day one"), so its mechanism
// is tested directly below by injecting a fake entry into the generated table, rather than through the
// EXAMPLES table-driven wrong/right pattern every other rule uses (MANUALLY_TESTED, from examples.mjs, says so).
// EXAMPLES itself lives in examples.mjs, not here, so scripts/build-skills.mjs can render the same wrong/right
// snippets into references/conformance-rules.md without duplicating them (issue #518, A-8).
const CASES = EXAMPLES;

test('every S/D/T/A rule in the table has a test case', () => {
    const tested = new Set([...CASES.map(c => c.id), ...MANUALLY_TESTED]);
    for (const rule of RULES) assert.ok(tested.has(rule.id), `FIX: rules.test.mjs has no case for rule ${rule.id} - add one`);
});

test('T7: flags a deprecated element or attribute once the generated data names one', () => {
    DEPRECATED_ELEMENTS.push({ tag: 'pk-fake-legacy', message: 'use pk-fake instead (test-only entry)' });
    try {
        const findings = checkFiles([{ path: 'app.html', text: '<pk-fake-legacy></pk-fake-legacy>' }], { ruleset: 'consumer' });
        assert.ok(findings.some(f => f.rule === 'T7'), 'FIX: T7 did not flag a deprecated element from the generated table');
    } finally {
        DEPRECATED_ELEMENTS.pop();
    }
    const clean = checkFiles([{ path: 'app.html', text: '<pk-button>Save</pk-button>' }], { ruleset: 'consumer' });
    assert.ok(!clean.some(f => f.rule === 'T7'), 'FIX: T7 flagged an element with no deprecation entry');
});

for (const c of CASES) {
    test(`${c.id}: flags the wrong snippet`, () => {
        const findings = checkFiles([{ path: c.path, text: c.wrong }], { ruleset: 'consumer' });
        assert.ok(findings.some(f => f.rule === c.id), `FIX: expected ${c.id} in findings for ${JSON.stringify(c.wrong)}, got ${JSON.stringify(findings.map(f => f.rule))}`);
    });

    test(`${c.id}: does not flag the right snippet`, () => {
        const findings = checkFiles([{ path: c.rightPath ?? c.path, text: c.right }], { ruleset: 'consumer' });
        assert.ok(!findings.some(f => f.rule === c.id), `FIX: did not expect ${c.id} in findings for ${JSON.stringify(c.right)}, got ${JSON.stringify(findings.filter(f => f.rule === c.id))}`);
    });
}

test('S9: does not flag a literal-looking value inside a CSS comment, but still flags a real one', () => {
    const commentOnly = checkFiles(
        [{ path: 'app.css', text: '/* a page framed as a 375px device */\n.a { color: var(--color-danger); }' }],
        { ruleset: 'consumer' },
    );
    assert.ok(!commentOnly.some(f => f.rule === 'S9'), `FIX: S9 flagged a value inside a comment, got ${JSON.stringify(commentOnly.filter(f => f.rule === 'S9'))}`);

    const mixed = checkFiles(
        [{ path: 'app.css', text: '/* a page framed as a 375px device */\n.a { width: 375px; }' }],
        { ruleset: 'consumer' },
    );
    const hit = mixed.find(f => f.rule === 'S9');
    assert.ok(hit, 'FIX: S9 did not flag a real literal length outside a comment');
    assert.equal(hit.line, 2, `FIX: S9 reported the wrong line for a hit after a comment, got line ${hit.line}`);
});

test('S7: does not flag prose inside a JS comment, but still flags a real platform access (#697)', () => {
    const commentOnly = checkFiles(
        [{ path: 'app.js', text: '// Save keeps them in localStorage\nexport function save() {}' }],
        { ruleset: 'consumer-strict' },
    );
    assert.ok(!commentOnly.some(f => f.rule === 'S7'), `FIX: S7 flagged a value inside a comment, got ${JSON.stringify(commentOnly.filter(f => f.rule === 'S7'))}`);

    const mixed = checkFiles(
        [{ path: 'app.js', text: '// Save keeps them in localStorage\nlocalStorage.setItem("a", "b");' }],
        { ruleset: 'consumer-strict' },
    );
    const hit = mixed.find(f => f.rule === 'S7');
    assert.ok(hit, 'FIX: S7 did not flag a real localStorage access outside a comment');
    assert.equal(hit.line, 2, `FIX: S7 reported the wrong line for a hit after a comment, got line ${hit.line}`);
});

test('D8: does not flag ::part() selectors, but still flags a raw override sharing a rule with one (#684)', () => {
    const clean = checkFiles(
        [{ path: 'app.css', text: 'pk-app-shell::part(footer) { padding: var(--space-2); }\n.tabbed-page-tabs pk-tabs::part(list) { gap: var(--space-1); }' }],
        { ruleset: 'consumer' },
    );
    assert.ok(!clean.some(f => f.rule === 'D8'), `FIX: D8 flagged documented ::part() selectors, got ${JSON.stringify(clean.filter(f => f.rule === 'D8'))}`);

    const mixed = checkFiles([{ path: 'app.css', text: 'pk-tabs, pk-app-shell::part(header) { padding: var(--space-2); }' }], { ruleset: 'consumer' });
    const hit = mixed.find(f => f.rule === 'D8');
    assert.ok(hit, 'FIX: D8 did not flag a raw pk-tabs override sharing a rule with a ::part() selector');
    assert.ok(hit.fix.includes('styles pk-tabs from outside'), `FIX: D8 reported the wrong offending selector, got ${JSON.stringify(hit)}`);
});

test('D2: does not flag a utility class that merely contains a hint word, but still flags the exact class (#684)', () => {
    const clean = checkFiles([{ path: 'app.css', text: '.text-danger { color: var(--color-danger); }\n.stat-grid { display: grid; }' }], { ruleset: 'consumer' });
    assert.ok(!clean.some(f => f.rule === 'D2'), `FIX: D2 flagged .text-danger/.stat-grid as hand-rolled duplicates, got ${JSON.stringify(clean.filter(f => f.rule === 'D2'))}`);

    const real = checkFiles([{ path: 'app.css', text: '.text { color: var(--color-danger); }\n.stat { color: var(--color-success); }' }], { ruleset: 'consumer' });
    assert.ok(real.some(f => f.rule === 'D2' && f.message === '.text'), 'FIX: D2 did not flag the exact .text class');
    assert.ok(real.some(f => f.rule === 'D2' && f.message === '.stat'), 'FIX: D2 did not flag the exact .stat class');
});

test('every rule carries a doc anchor and a fix template with the rule id in brackets', () => {
    for (const rule of RULES) {
        assert.ok(rule.docs && rule.docs.length > 0, `FIX: rule ${rule.id} has no doc anchor`);
        assert.ok(rule.fixTemplate.includes(`[${rule.id}]`), `FIX: rule ${rule.id}'s fix template does not end with [${rule.id}]`);
    }
});

test('getRuleMeta finds a rule row by id, and undefined for an unknown one', () => {
    assert.equal(getRuleMeta('D1').category, 'D');
    assert.equal(getRuleMeta('NOPE'), undefined);
});
