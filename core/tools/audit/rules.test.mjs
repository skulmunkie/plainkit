// Table-driven, in-memory tests for every S and D family rule (design section 10, #612 A-2): a "wrong" snippet
// expecting the rule's id in the findings, a "right" snippet expecting none. No fixtures on disk - the engine
// is pure, so a file is just `{ path, text }`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../strict/engine.mjs';
import './rules.mjs'; // registers the "consumer"/"consumer-strict" rulesets as a side effect
import { RULES, getRuleMeta } from './rules.mjs';

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
];

test('every S/D rule in the table has a test case', () => {
    const tested = new Set(CASES.map(c => c.id));
    for (const rule of RULES) assert.ok(tested.has(rule.id), `FIX: rules.test.mjs has no case for rule ${rule.id} - add one`);
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
