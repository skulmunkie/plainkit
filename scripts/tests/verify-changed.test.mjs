// The mapping behind `node scripts/verify.mjs --changed` (scripts/verify-changed.mjs): changed files in, the smallest covering check set out, and
// anything the table does not know falls back to the full node job. Fixtures use a fake repository context, so no git and no disk is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planChanged, planSteps, buildChecks, dotnetFilter, describePlan, ELEMENT_GUARDS } from '../verify-changed.mjs';
import { parseArgs, CHECKS } from '../verify.mjs';

const GUARD_TESTS = ELEMENT_GUARDS.map(p => ({ path: p, text: '' }));
const ctxOf = ({ tests = [], csTests = [], extra = [] } = {}) => {
    const all = [...GUARD_TESTS, ...tests];
    const present = new Set([...all.map(t => t.path), ...csTests.map(t => t.path), ...extra,
        'core/elements/button/meta.json', 'core/components/data-table/meta.json', 'core/modules/orders/module.js']);
    return { exists: p => present.has(p), tests: all, csTests };
};
const ids = (files, ctx = ctxOf(), opts) => planSteps(planChanged(files, ctx), opts).map(s => s.id);

test('docs and changelog only: the cheap lint checks and nothing else', () => {
    assert.deepEqual(ids(['changelog/unreleased/x.md', '.github/CODEOWNERS', 'LICENSE']), ['changelog', 'changelog-pr', 'release-fragments']);
    assert.deepEqual(ids(['docs/notes/plan.md']), ['changelog', 'changelog-pr', 'release-fragments'], 'markdown under docs/ that no test names');
    assert.deepEqual(ids([]), ['changelog', 'changelog-pr', 'release-fragments'], 'nothing changed');
});

test('a root markdown file that a test reads runs that test, not nothing', () => {
    const plan = planChanged(['AGENTS.md'], ctxOf({ tests: [{ path: 'scripts/tests/verify.test.mjs', text: "readFileSync('AGENTS.md')" }] }));
    assert.deepEqual([...plan.nodeFiles], ['scripts/tests/verify.test.mjs']);
    assert.equal(plan.nodeAll, false);
});

test('a test file only: just those test files', () => {
    const plan = planChanged(['scripts/tests/foo.test.mjs', 'core/tests/bar.test.mjs'], ctxOf({ extra: ['scripts/tests/foo.test.mjs', 'core/tests/bar.test.mjs'] }));
    assert.deepEqual([...plan.nodeFiles].sort(), ['core/tests/bar.test.mjs', 'scripts/tests/foo.test.mjs']);
    assert.equal(plan.nodeAll, false);
    assert.equal(plan.dotnet, null);
    assert.ok(!planSteps(plan).some(s => s.id === 'audit' || s.id === 'dotnet'));
});

test('a deleted test file is not run', () => {
    const plan = planChanged(['scripts/tests/gone.test.mjs'], ctxOf());
    assert.equal(plan.nodeFiles.size, 0);
});

test('an element css change: its tests, the tests that mention it, the guards; no dotnet; browser and UI review only with --browser', () => {
    const ctx = ctxOf({ tests: [
        { path: 'core/elements/button/button.test.mjs', text: '' },
        { path: 'core/tests/uses-button.test.mjs', text: "import x from '../elements/button/button.js'" },
        { path: 'core/tests/other.test.mjs', text: 'nothing relevant' },
    ] });
    const plan = planChanged(['core/elements/button/button.css'], ctx);
    assert.ok(plan.nodeFiles.has('core/elements/button/button.test.mjs'));
    assert.ok(plan.nodeFiles.has('core/tests/uses-button.test.mjs'));
    assert.ok(!plan.nodeFiles.has('core/tests/other.test.mjs'));
    for (const g of ELEMENT_GUARDS) assert.ok(plan.nodeFiles.has(g), g);
    assert.equal(plan.dotnet, null);
    assert.deepEqual(ids(['core/elements/button/button.css'], ctx), ['changelog', 'changelog-pr', 'release-fragments', 'bootstrap', 'version', 'generated-tree', 'node-tests']);
    const withBrowser = ids(['core/elements/button/button.css'], ctx, { browser: true });
    assert.deepEqual(withBrowser.slice(-2), ['browser', 'ui-review']);
    assert.deepEqual([...plan.browserElements], ['button']);
});

test('an element meta.json also feeds the Blazor generator: generator tests and the component dotnet classes', () => {
    const ctx = ctxOf({
        tests: [{ path: 'scripts/tests/generate-blazor.test.mjs', text: '' }, { path: 'scripts/tests/blazor-wrapper.test.mjs', text: '' }],
        csTests: [{ path: 'blazor/tests/PlainKit.Blazor.Tests/PkDataTableTests.cs', text: 'PkDataTable' }, { path: 'blazor/tests/PlainKit.Blazor.Tests/GeneratedComponentTests.cs', text: '' }, { path: 'blazor/tests/PlainKit.Blazor.Tests/PkDockTests.cs', text: 'PkDock' }],
    });
    const plan = planChanged(['core/components/data-table/meta.json'], ctx);
    assert.ok(plan.nodeFiles.has('scripts/tests/generate-blazor.test.mjs'));
    assert.deepEqual([...plan.dotnet.classes].sort(), ['GeneratedComponentTests', 'PkDataTableTests']);
    assert.equal(dotnetFilter(plan.dotnet.classes), 'FullyQualifiedName~GeneratedComponentTests|FullyQualifiedName~PkDataTableTests');
});

test('a Blazor mapping: dotnet filtered to the component, the generator and Blazor node tests, UI review for the element', () => {
    const ctx = ctxOf({
        tests: [{ path: 'scripts/tests/generate-blazor.test.mjs', text: '' }, { path: 'scripts/tests/blazor-mappings.test.mjs', text: '' }, { path: 'scripts/tests/ci-changes.test.mjs', text: '' }],
        csTests: [{ path: 'blazor/tests/PlainKit.Blazor.Tests/PkButtonTests.cs', text: 'PkButton' }],
    });
    const plan = planChanged(['blazor/mappings/button.json'], ctx);
    assert.deepEqual([...plan.nodeFiles].sort(), ['scripts/tests/blazor-mappings.test.mjs', 'scripts/tests/generate-blazor.test.mjs']);
    assert.ok(plan.dotnet.classes.has('PkButtonTests') && !plan.dotnet.all);
    assert.deepEqual([...plan.uiElements], ['button']);
    const steps = ids(['blazor/mappings/button.json'], ctx);
    assert.ok(steps.includes('dotnet') && steps.includes('node-tests') && !steps.includes('audit'));
});

test('a Blazor mapping for something that is not an element asks for no UI review', () => {
    const plan = planChanged(['blazor/mappings/mystery.json'], ctxOf());
    assert.equal(plan.uiElements.size, 0);
});

test('Blazor sources: a component file filters dotnet, a shared file runs it all', () => {
    const ctx = ctxOf({ csTests: [{ path: 'blazor/tests/PlainKit.Blazor.Tests/PkDockTests.cs', text: 'PkDock' }] });
    const one = planChanged(['blazor/src/PlainKit.Blazor/Components/PkDock.razor'], ctx);
    assert.ok(one.dotnet.classes.has('PkDockTests') && !one.dotnet.all);
    const shared = planChanged(['blazor/src/PlainKit.Blazor/PkElementBase.cs'], ctx);
    assert.equal(shared.dotnet.all, true);
    const proj = planChanged(['blazor/src/PlainKit.Blazor/PlainKit.Blazor.csproj'], ctx);
    assert.equal(proj.dotnet.all, true);
    const test = planChanged(['blazor/tests/PlainKit.Blazor.Tests/PkDockTests.cs'], ctx);
    assert.deepEqual([...test.dotnet.classes], ['PkDockTests']);
    assert.equal(planChanged(['blazor/tests/PlainKit.Blazor.Tests/FormControlsHost.razor'], ctx).dotnet.all, true);
});

test('the generator script: the generator tests', () => {
    const ctx = ctxOf({ tests: [{ path: 'scripts/tests/generate-blazor.test.mjs', text: '' }, { path: 'scripts/tests/blazor-wrapper.test.mjs', text: '' }] });
    const plan = planChanged(['scripts/generate-blazor.mjs'], ctx);
    assert.deepEqual([...plan.nodeFiles].sort(), ['scripts/tests/blazor-wrapper.test.mjs', 'scripts/tests/generate-blazor.test.mjs']);
    assert.equal(plan.nodeAll, false);
});

test('core/js, base and tokens: the broader set (every node test, the audits, the whole browser suite)', () => {
    for (const f of ['core/js/element.js', 'core/base/a11y.css', 'core/tokens/tokens.css']) {
        const plan = planChanged([f], ctxOf());
        assert.equal(plan.nodeAll, true, f);
        assert.equal(plan.audit && plan.auditModules, true, f);
        assert.equal(plan.browserFull, true, f);
        assert.ok(planSteps(plan, { browser: true }).some(s => s.id === 'browser'));
    }
});

test('a module: its tests, audit-modules and (with --browser) the whole suite', () => {
    const plan = planChanged(['core/modules/orders/module.js'], ctxOf({ tests: [{ path: 'core/modules/orders/orders.test.mjs', text: '' }] }));
    assert.ok(plan.nodeFiles.has('core/modules/orders/orders.test.mjs'));
    assert.equal(plan.auditModules, true);
    assert.equal(plan.browserFull, true);
});

test('a script a test names runs that test; an unknown file falls back to the full node job', () => {
    const ctx = ctxOf({ tests: [{ path: 'scripts/tests/changelog.test.mjs', text: "import './changelog.mjs'; spawn('scripts/changelog.mjs')" }] });
    const known = planChanged(['scripts/changelog.mjs'], ctx);
    assert.deepEqual([...known.nodeFiles], ['scripts/tests/changelog.test.mjs']);
    assert.equal(known.nodeAll, false);
    for (const f of ['scripts/totally-new-tool.mjs', 'package.json', '.github/workflows/ci.yml', 'some/unknown/file.xyz', 'core/mystery/thing.js']) {
        const plan = planChanged([f], ctx);
        assert.equal(plan.nodeAll, true, `${f} falls back to the full node job`);
        assert.equal(plan.audit && plan.auditModules, true, f);
        assert.deepEqual(planSteps(plan).map(s => s.id), ['changelog', 'changelog-pr', 'release-fragments', 'bootstrap', 'version', 'generated-tree', 'node-tests', 'audit', 'audit-modules'], f);
    }
});

test('a browser case or the runner: the browser suite covers it, not the full node job', () => {
    const plan = planChanged(['core/tests/browser/cases-forms.js', 'core/tests/browser/runner.js'], ctxOf());
    assert.equal(plan.nodeAll, false);
    assert.equal(plan.browserFull, true);
    assert.ok(planSteps(plan, { browser: true }).some(s => s.id === 'browser'));
    assert.ok(!planSteps(plan).some(s => s.id === 'browser'), 'only with --browser');
});

test('an element folder without a meta.json is unknown, so the full node job', () => {
    assert.equal(planChanged(['core/elements/ghost/ghost.css'], ctxOf()).nodeAll, true);
});

test('core/VERSION: release-pr joins and the full node job runs', () => {
    const plan = planChanged(['core/VERSION'], ctxOf());
    assert.equal(plan.releasePr, true);
    assert.equal(plan.nodeAll, true);
    assert.ok(planSteps(plan).some(s => s.id === 'release-pr'));
    assert.ok(!planSteps(planChanged(['scripts/tests/a.test.mjs'], ctxOf())).some(s => s.id === 'release-pr'));
});

test('generated files are ignored, and a mix is the union (one unknown file makes it full)', () => {
    assert.deepEqual(ids(['core/dist/foo.js', 'changelog/unreleased/a.md']), ['changelog', 'changelog-pr', 'release-fragments']);
    const plan = planChanged(['core/elements/button/button.css', 'weird.bin'], ctxOf());
    assert.equal(plan.nodeAll, true);
    assert.ok(plan.browserElements.has('button'));
});

test('buildChecks narrows node-tests, dotnet, browser and keeps the standard checks as they are', () => {
    const ctx = ctxOf({ tests: [{ path: 'scripts/tests/generate-blazor.test.mjs', text: '' }], csTests: [{ path: 'blazor/tests/PlainKit.Blazor.Tests/PkButtonTests.cs', text: 'PkButton' }] });
    const plan = planChanged(['core/elements/button/meta.json'], ctx);
    const checks = buildChecks(plan, { CHECKS, NODE: 'node', browser: true });
    const by = id => checks.find(c => c.id === id);
    assert.equal(by('bootstrap'), CHECKS.find(c => c.id === 'bootstrap'));
    const nodeCmd = by('node-tests').cmd({});
    assert.deepEqual(nodeCmd.slice(0, 3), ['node', '--test', '--test-reporter=spec']);
    assert.ok(nodeCmd.includes('scripts/tests/generate-blazor.test.mjs') && !nodeCmd.some(a => a.includes('*')));
    assert.deepEqual(by('dotnet').cmd({}).slice(-2), ['--filter', 'FullyQualifiedName~PkButtonTests']);
    assert.deepEqual(by('browser').cmd({}), ['node', 'scripts/attest-browser.mjs', '--elements', 'button']);
    const ui = by('ui-review').cmd({});
    assert.deepEqual(ui.slice(0, 4), ['node', 'scripts/ui-review.mjs', '--elements', 'button']);
    assert.deepEqual(by('node-tests').needs, ['bootstrap']);
});

test('the full fallback and a broad change keep the original full node-tests check', () => {
    const checks = buildChecks(planChanged(['package.json'], ctxOf()), { CHECKS, NODE: 'node' });
    assert.equal(checks.find(c => c.id === 'node-tests'), CHECKS.find(c => c.id === 'node-tests'));
    assert.equal(checks.find(c => c.id === 'audit'), CHECKS.find(c => c.id === 'audit'));
});

test('describePlan says what was chosen and why, and where the full run stays', () => {
    const plan = planChanged(['core/elements/button/button.css'], ctxOf());
    const text = describePlan(plan, { base: 'origin/next-0.13', browser: false });
    assert.match(text, /1 file\(s\) changed versus origin\/next-0\.13/);
    assert.match(text, /element: core\/elements\/button\/button\.css/);
    assert.match(text, /-> node-tests/);
    assert.match(text, /add --browser/);
    assert.match(text, /integration batch and CI/);
});

test('--changed combines only with --browser, --base and --verbose', () => {
    assert.equal(parseArgs(['--changed', '--browser', '--base', 'origin/main']).errors.length, 0);
    assert.equal(parseArgs(['--changed']).opts.changed, true);
    for (const bad of ['--fast', '--pack', '--no-dotnet', '--scorecard']) assert.match(parseArgs(['--changed', bad]).errors.join(), /--changed chooses its own checks/);
    assert.match(parseArgs(['--changed', '--only', 'lint']).errors.join(), /--changed chooses/);
});
