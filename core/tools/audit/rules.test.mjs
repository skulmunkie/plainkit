// Table-driven, in-memory tests for every S, D, T and A family rule (design section 10, #612 A-2, #625 A-4): a
// "wrong" snippet expecting the rule's id in the findings, a "right" snippet expecting none. No fixtures on disk -
// the engine is pure, so a file is just `{ path, text }`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../strict/engine.mjs';
import './rules.mjs'; // registers the "consumer"/"consumer-strict" rulesets as a side effect
import { RULES, getRuleMeta } from './rules.mjs';
import { DEPRECATED_ELEMENTS } from './hints.mjs';

// T7 has no real deprecated element or attribute yet (design section 2.4: "empty on day one"), so its mechanism
// is tested directly below by injecting a fake entry into the generated table, rather than through the CASES
// table-driven wrong/right pattern every other rule uses.
const MANUALLY_TESTED = new Set(['T7']);

const CASES = [
    { id: 'S1', path: 'app.css', wrong: '.a { color: red; }', right: 'const x = 1;', rightPath: 'app.js' },
    { id: 'S2', path: 'app.js', wrong: "el.style.color = 'red';", right: 'const width = compute();' },
    { id: 'S3', path: 'app.html', wrong: '<div class="foo"></div>', right: '<div></div>' },
    { id: 'S4', path: 'app.html', wrong: '<button>Click</button>', right: '<pk-button>Click</pk-button>' },
    { id: 'S5', path: 'app.js', wrong: "el.innerHTML = '<b>hi</b>';", right: "el.textContent = 'hi';" },
    { id: 'S6', path: 'app.js', wrong: "import foo from 'some-lib';", right: "import { mountApp } from 'plainkit';" },
    { id: 'S7', path: 'app.js', wrong: "document.querySelector('a');", right: 'state.value = 1;' },
    { id: 'S8', path: 'app.js', wrong: "mountApp({ page: 'custom' });", right: "mountApp({ page: 'list' });" },
    { id: 'S9', path: 'app.css', wrong: '.a { color: #ff0000; }', right: '.a { color: var(--color-danger); }' },
    { id: 'D1', path: 'app.html', wrong: '<table></table>', right: '<pk-table></pk-table>' },
    { id: 'D2', path: 'app.html', wrong: '<div class="modal">x</div>', right: '<pk-dialog>x</pk-dialog>' },
    {
        id: 'D3',
        path: 'app.js',
        wrong: "el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move);",
        right: "el.addEventListener('click', start);",
    },
    {
        id: 'D4',
        path: 'app.js',
        wrong: "el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(); if (e.key === 'ArrowRight') go(); });",
        right: "el.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });",
    },
    { id: 'D5', path: 'app.js', wrong: "root.querySelectorAll('[tabindex]');", right: "root.querySelectorAll('.item');" },
    { id: 'D6', path: 'app.js', wrong: "node.role = 'dialog';", right: "node.type = 'dialog';" },
    { id: 'D7', path: 'app.js', wrong: 'dialogEl.showModal();', right: 'dialogEl.show();' },
    { id: 'D8', path: 'app.css', wrong: 'pk-dialog { color: red; }', right: 'pk-dialog::part(header) { color: red; }' },
    { id: 'D9', path: 'app.css', wrong: '.row { display: flex; gap: 8px; }', right: '.row { display: block; }' },
    { id: 'T1', path: 'app.css', wrong: '.a { color: #ff0000; }', right: '.a { color: var(--color-danger); }' },
    { id: 'T2', path: 'app.css', wrong: '.a { padding: 12px; }', right: '.a { padding: var(--space-3); }' },
    { id: 'T3', path: 'app.css', wrong: ".a { font-family: 'Arial', sans-serif; }", right: '.a { font-family: var(--font-sans); }' },
    { id: 'T4', path: 'app.css', wrong: '.a:focus { outline: none; }', right: '.a:focus { outline: none; box-shadow: 0 0 0 2px blue; }' },
    { id: 'T5', path: 'app.css', wrong: '.a { color: var(--colr-typo); }', right: '.a { color: var(--color-critical); }' },
    { id: 'T6', path: 'app.html', wrong: '<pk-buttonn>Save</pk-buttonn>', right: '<pk-button>Save</pk-button>' },
    // T7 has no real deprecated element yet, so it is not in this table-driven CASES list - see the dedicated
    // test below, and MANUALLY_TESTED above for the completeness check.
    { id: 'T8', path: 'app.js', wrong: "import { PkButton } from 'plainkit/elements/elements.js';", right: "import { PkButton } from 'plainkit/elements/button.js';" },
    { id: 'A1', path: 'app.html', wrong: '<pk-button icon variant="ghost"></pk-button>', right: '<pk-button icon variant="ghost" label="Add"></pk-button>' },
    { id: 'A2', path: 'app.html', wrong: '<pk-input></pk-input>', right: '<pk-input label="Name"></pk-input>' },
    { id: 'A3', path: 'app.html', wrong: '<pk-dialog></pk-dialog>', right: '<pk-dialog heading="Discard?"></pk-dialog>' },
    { id: 'A4', path: 'app.html', wrong: '<div onclick="go()"></div>', right: '<pk-button>Go</pk-button>' },
    { id: 'A5', path: 'app.html', wrong: '<h1>One</h1><h1>Two</h1>', right: '<h1>One</h1><h2>Two</h2>' },
    { id: 'A6', path: 'app.html', wrong: '<pk-badge variant="danger"></pk-badge>', right: '<pk-badge variant="danger">Failed</pk-badge>' },
    { id: 'A7', path: 'index.html', wrong: '<html><body></body></html>', right: '<html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><main></main></body></html>' },
    { id: 'A8', path: 'app.css', wrong: 'pk-button { min-height: 0; }', right: 'pk-button { min-height: 44px; }' },
];

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
