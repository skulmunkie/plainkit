// The "module" ruleset (issue #518 A-9b): S1-S12 per
// docs/superpowers/specs/2026-09-28-site-v2-strict-modules-design.md, section 3.1, registered by
// core/tools/audit/module-ruleset.mjs. Table-driven wrong/right cases for the ids the token scanner can flag
// (S1-S10), plus checks that the ruleset carries all twelve ids and that S11/S12 are honestly non-scanning
// (the design itself says they need a directory listing / a build step, not a token scan - see the comment in
// core/tools/audit/families/module-rules.mjs). No fixtures on disk: the engine is pure, `{ path, text }` in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFiles } from '../tools/strict/engine.mjs';
import '../tools/audit/module-ruleset.mjs'; // registers the "module" ruleset as a side effect
import '../tools/audit/rules.mjs'; // registers "consumer"/"consumer-strict", for the isolation check below
import { MODULE_RULES } from '../tools/audit/module-ruleset.mjs';

const RULESET = 'module';

test('the module ruleset carries all twelve S1-S12 ids', () => {
    const ids = MODULE_RULES.map(r => r.id).sort();
    const expected = Array.from({ length: 12 }, (_, i) => `S${i + 1}`).sort();
    assert.deepEqual(ids, expected, 'FIX: core/tools/audit/families/module-rules.mjs must register exactly S1-S12');
});

test('module ruleset S1-S9 severities are always error (a strict module has one mode)', () => {
    for (const rule of MODULE_RULES) {
        if (!/^S[1-9]$/.test(rule.id)) continue;
        assert.deepEqual(rule.severity, { normal: 'error', strict: 'error' }, `FIX: ${rule.id} must be error/error in the module ruleset`);
    }
});

const CASES = [
    { id: 'S1', path: 'modules/x/app.css', wrong: '.a { color: red; }', right: 'const x = 1;', rightPath: 'modules/x/module.js' },
    { id: 'S2', path: 'modules/x/module.js', wrong: "el.style.color = 'red';", right: 'const width = compute();' },
    { id: 'S3', path: 'modules/x/component.js', wrong: '<div class="foo"></div>', right: '<div></div>' },
    { id: 'S4', path: 'modules/x/component.jsx', wrong: '<button>Click</button>', right: '<pk-button>Click</pk-button>' },
    { id: 'S5', path: 'modules/x/module.js', wrong: "el.innerHTML = '<b>hi</b>';", right: "el.textContent = 'hi';" },
    { id: 'S6', path: 'modules/x/module.js', wrong: "import foo from 'some-lib';", right: "import { mountApp } from 'plainkit';" },
    { id: 'S7', path: 'modules/x/module.js', wrong: "document.querySelector('a');", right: 'state.value = 1;' },
    { id: 'S8', path: 'modules/x/pages.js', wrong: "export const home = { page: 'custom' };", right: "export const home = { page: 'list' };" },
    { id: 'S9', path: 'modules/x/app.css', wrong: '.a { color: #ff0000; }', right: '.a { color: var(--color-danger); }' },
    { id: 'S10', path: 'modules/x/legacy.txt', wrong: 'stray file', right: 'export default {};', rightPath: 'modules/x/module.js' },
];

for (const c of CASES) {
    test(`${c.id}: flags the wrong snippet in the module ruleset`, () => {
        const findings = checkFiles([{ path: c.path, text: c.wrong }], { ruleset: RULESET });
        assert.ok(findings.some(f => f.rule === c.id), `FIX: expected ${c.id} in module-ruleset findings for ${JSON.stringify(c.wrong)}, got ${JSON.stringify(findings.map(f => f.rule))}`);
    });
    test(`${c.id}: does not flag the right snippet in the module ruleset`, () => {
        const findings = checkFiles([{ path: c.rightPath ?? c.path, text: c.right }], { ruleset: RULESET });
        assert.ok(!findings.some(f => f.rule === c.id), `FIX: ${c.id} flagged a compliant module snippet`);
    });
}

test('S10 allows app.html and the anatomy\'s own extensions', () => {
    const clean = checkFiles(
        [
            { path: 'modules/x/app.html', text: '<div id="app"><script src="app.js"></script></div>' },
            { path: 'modules/x/module.js', text: 'export default {};' },
            { path: 'modules/x/module.test.mjs', text: 'export {};' },
            { path: 'modules/x/data/items.json', text: '{}' },
        ],
        { ruleset: RULESET },
    );
    assert.ok(!clean.some(f => f.rule === 'S10'), `FIX: S10 flagged an anatomy-compliant file set: ${JSON.stringify(clean)}`);
});

test('S10 flags a second, non-app.html HTML file', () => {
    const findings = checkFiles([{ path: 'modules/x/pages.html', text: '<div></div>' }], { ruleset: RULESET });
    assert.ok(findings.some(f => f.rule === 'S10'), 'FIX: S10 must flag an .html file other than app.html');
});

// S11 and S12 need a directory listing / a build-time measure, not a single file's text - the design's own
// "check" column says so (section 3.1). They stay registered (so getRuleset('module') names all twelve ids)
// but never fire from the token scanner; asserting that here documents the limit instead of hiding it.
test('S11 and S12 are registered but never fire from the per-file token scanner', () => {
    const findings = checkFiles(
        [
            { path: 'modules/x/module.js', text: 'export default { strict: true };' },
            { path: 'modules/x/app.css', text: '.a { color: red; }' },
        ],
        { ruleset: RULESET },
    );
    assert.ok(!findings.some(f => f.rule === 'S11'), 'FIX: S11 is not a token-scan rule; it must never appear in engine findings');
    assert.ok(!findings.some(f => f.rule === 'S12'), 'FIX: S12 is not a token-scan rule; it must never appear in engine findings');
    const ids = MODULE_RULES.map(r => r.id);
    assert.ok(ids.includes('S11') && ids.includes('S12'), 'FIX: S11/S12 must still be registered in the module ruleset');
});

test('the consumer ruleset is unaffected: it still stops at S9, module-only ids never leak into it', () => {
    const findings = checkFiles([{ path: 'app.js', text: "document.querySelector('a');" }], { ruleset: 'consumer' });
    assert.ok(!findings.some(f => f.rule === 'S10' || f.rule === 'S11' || f.rule === 'S12'), 'FIX: module-only ids must not appear in the consumer ruleset');
});
