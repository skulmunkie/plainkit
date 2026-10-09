// `node scripts/verify.mjs --changed`: the smallest set of checks that covers what a branch changed (the inner loop for a small change). Pure planning here
// (planChanged: changed files in, a plan out, tested in scripts/tests/verify-changed.test.mjs), the git and filesystem reads in gatherContext, and the
// plan turned into runnable checks in buildChecks. verify.mjs prints the plan (what was chosen and why) and runs it.
//
// The rule that matters: a file this table does not know falls back to the FULL node job (never skips when unsure). The full verify, the whole browser suite and
// the Node 22 job stay for the integration batch and CI.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDocsOnly, ELEMENT_DIR } from './ci-changes.mjs';
import { isGenerated } from './generated.mjs';

const GEN_TESTS = ['scripts/tests/generate-blazor.test.mjs', 'scripts/tests/generate-blazor-events.test.mjs'];
// The guards that read every element folder (ownership, tiers, budgets...), run for any change inside an element or module folder: a curated list, filtered to the files that exist.
// Left to the integration batch and CI because they test the whole SDK, not one element: carveout (copies the tree, rebuilds, reruns everything; 40 s) and generated-current (the bootstrap and generated-tree already cover a stale generated file).
export const ELEMENT_GUARDS = ['elements', 'element-surface', 'ownership', 'tiers', 'no-silent-catch', 'privacy', 'budgets', 'slotted-hide', 'text-tiers', 'samples', 'dist-elements', 'dist-minified-element', 'dist-units'].map(n => `core/tests/${n}.test.mjs`);
// dotnet test classes that cover every generated component; always part of a filtered dotnet run so the filter never selects nothing.
export const DOTNET_GENERIC = ['GeneratedComponentTests', 'ComponentTests', 'AttributePassthroughTests'];
const pascal = s => s.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The plan before any file is looked at. */
function emptyPlan() {
    return {
        docsOnly: false, nodeAll: false, audit: false, auditModules: false, releasePr: false,
        nodeFiles: new Set(), dotnet: null /* null | { all: bool, classes: Set } */, browserFull: false, browserElements: new Set(), uiElements: new Set(),
        rules: [], notes: [],
    };
}

/**
 * The plan for a list of changed files. `ctx`: { exists(path), tests: [{ path, text }] (every *.test.mjs), csTests: [{ path, text }] (blazor/tests *.cs) }.
 * Returns { ...plan, files } where `rules` is [{ file, rule, why }].
 */
export function planChanged(files, ctx) {
    const plan = emptyPlan();
    plan.files = files;
    const rule = (file, name, why) => plan.rules.push({ file, rule: name, why });
    const testsMentioning = needles => ctx.tests.filter(t => needles.some(n => n.test(t.text))).map(t => t.path);
    const addDotnet = (names, why) => {
        plan.dotnet ??= { all: false, classes: new Set() };
        for (const g of DOTNET_GENERIC) if (ctx.csTests.some(t => path.posix.basename(t.path) === `${g}.cs`)) plan.dotnet.classes.add(g);
        for (const n of names) {
            const re = new RegExp(`Pk${esc(pascal(n))}(?![A-Za-z])`);
            for (const t of ctx.csTests) if (re.test(t.text) || path.posix.basename(t.path).startsWith(`Pk${pascal(n)}`)) plan.dotnet.classes.add(path.posix.basename(t.path).replace(/\.\w+$/, ''));
        }
        return why;
    };
    const isElementName = n => ['elements', 'components', 'pages', 'shells'].some(tier => ctx.exists(`core/${tier}/${n}/${n}.meta.json`));
    const dotnetAll = () => { plan.dotnet = { all: true, classes: new Set() }; };
    const blazorNode = () => ctx.tests.filter(t => /^scripts\/tests\/(blazor-.*|generate-blazor.*)\.test\.mjs$/.test(t.path)).forEach(t => plan.nodeFiles.add(t.path));
    const guards = () => ELEMENT_GUARDS.filter(g => ctx.exists(g)).forEach(g => plan.nodeFiles.add(g));
    const full = (file, why) => { plan.nodeAll = plan.audit = plan.auditModules = true; rule(file, 'full node job', why); };

    for (const f of files) {
        let m;
        if (isGenerated(f)) { rule(f, 'ignored', 'a generated file (the bootstrap writes it)'); continue; }
        if (/\.test\.mjs$/.test(f)) {
            if (ctx.exists(f)) plan.nodeFiles.add(f);
            rule(f, 'test file', 'runs itself (node --test)');
            continue;
        }
        if (isDocsOnly(f, { forNode: true })) { rule(f, 'docs', 'changelog, .github or root markdown nothing reads'); continue; }
        if (f === 'core/VERSION') { plan.releasePr = true; full(f, 'the version is read by the version, API and stamped-file checks'); continue; }
        if ((m = /^core\/(elements|components|pages|shells)\/([^/]+)\/(.+)$/.exec(f)) && ELEMENT_DIR.test(f) && ctx.exists(`core/${m[1]}/${m[2]}/${m[2]}.meta.json`)) {
            const [, tier, name, rest] = m;
            ctx.tests.filter(t => t.path.startsWith(`core/${tier}/${name}/`)).forEach(t => plan.nodeFiles.add(t.path));
            testsMentioning([new RegExp(`/${esc(name)}/`), new RegExp(`pk-${esc(name)}(?![\\w-])`)]).forEach(p => plan.nodeFiles.add(p));
            guards();
            plan.browserElements.add(name);
            plan.uiElements.add(name);
            let why = `element folder ${tier}/${name}: its tests, the tests that mention it, the element guards; browser and UI review for ${name}`;
            if (rest === `${name}.meta.json`) { addDotnet([name]); blazorNode(); why += '; meta.json feeds the Blazor generator: generator tests and the Blazor tests for the component'; }
            rule(f, 'element', why);
            continue;
        }
        if ((m = /^core\/modules\/([^/]+)\//.exec(f))) {
            ctx.tests.filter(t => t.path.startsWith(`core/modules/${m[1]}/`)).forEach(t => plan.nodeFiles.add(t.path));
            testsMentioning([new RegExp(`modules/${esc(m[1])}/`)]).forEach(p => plan.nodeFiles.add(p));
            guards();
            plan.auditModules = true;
            plan.browserFull = true;
            rule(f, 'module', `module ${m[1]}: its tests, the tests that mention it, the guards, audit-modules; the browser cases cannot be mapped to a module, so --browser runs the whole suite`);
            continue;
        }
        if ((m = /^blazor\/mappings\/([^/]+)\.json$/.exec(f))) {
            addDotnet([m[1]]); blazorNode();
            if (isElementName(m[1])) plan.uiElements.add(m[1]);
            rule(f, 'blazor mapping', `mapping ${m[1]}: generator and Blazor node tests, dotnet test for the component (plus the generic generated-component classes); UI review for ${m[1]}`);
            continue;
        }
        if (/^blazor\/(handwritten(\.baseline)?\.json)$/.test(f)) { blazorNode(); rule(f, 'blazor wrapper list', 'the Blazor wrapper and generator node tests'); continue; }
        if (/^blazor\/src\/PlainKit\.Blazor\/Components\//.test(f) && (m = /([^/]+?)\.razor(\.cs)?$|([^/]+?)\.cs$/.exec(f))) {
            const comp = (m[1] ?? m[3]).replace(/^Pk/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
            addDotnet([comp]); blazorNode();
            rule(f, 'blazor component', `hand-written component ${comp}: dotnet test filtered to its test classes, plus the Blazor node tests`);
            continue;
        }
        if (/^blazor\/(src|samples)\//.test(f) || /\.(csproj|props|slnx)$/.test(f) || f === 'global.json') {
            dotnetAll(); blazorNode();
            if (/\.(csproj|props)$|^global\.json$/.test(f)) plan.notes.push('a project or package file changed: add --pack when it touches packaging');
            rule(f, 'blazor shared', 'shared Blazor source or build file: the whole dotnet test (not filterable) and the Blazor node tests');
            continue;
        }
        if (/^blazor\/tests\/.+\.cs$/.test(f)) {
            plan.dotnet ??= { all: false, classes: new Set() };
            plan.dotnet.classes.add(path.posix.basename(f).replace(/\.cs$/, ''));
            rule(f, 'blazor test', 'dotnet test filtered to this test class');
            continue;
        }
        if (/^blazor\/tests\//.test(f)) { dotnetAll(); rule(f, 'blazor test support', 'a test host or support file: the whole dotnet test'); continue; }
        if (f === 'scripts/generate-blazor.mjs') { blazorNode(); rule(f, 'blazor generator', 'the generator tests (scripts/tests/generate-blazor*.test.mjs, blazor-*.test.mjs); the generated C# is compiled by the integration batch'); continue; }
        if (/^core\/(js|base|tokens|layouts)\//.test(f)) {
            plan.nodeAll = plan.audit = plan.auditModules = true; plan.browserFull = true;
            rule(f, 'shared core', 'shared base, token, layout or js file: every node test, the audits, and (with --browser) the whole browser suite; the full UI review needs the label ui-review-full');
            continue;
        }
        if (/^core\/tests\/browser\//.test(f)) {
            // A browser case or the runner: the browser suite is what covers it (cases cannot be mapped to a file), plus any node test that names it.
            plan.browserFull = true;
            testsMentioning([new RegExp(esc(path.posix.basename(f)))]).forEach(p => plan.nodeFiles.add(p));
            rule(f, 'browser cases', 'a browser case or runner file: covered by the browser suite (--browser runs all of it) and the node tests that name it');
            continue;
        }
        if (/^core\/tools\/audit\//.test(f)) { plan.audit = true; rule(f, 'audit tooling', 'the audit tests'); }
        // A script, tool or helper: the tests that name it. None found means we cannot say what covers it: the full node job.
        const hits = testsMentioning([new RegExp(esc(f)), new RegExp(esc(path.posix.basename(f)))]);
        if (hits.length) { hits.forEach(p => plan.nodeFiles.add(p)); if (!plan.rules.some(r => r.file === f)) rule(f, 'mentioned by tests', `${hits.length} test file(s) name ${path.posix.basename(f)}`); continue; }
        if (/^docs\/.+\.md$/.test(f)) { rule(f, 'docs', 'markdown under docs/ that no test names'); continue; }
        if (!plan.rules.some(r => r.file === f)) full(f, 'not in the mapping and no test names it: not sure what covers it, so the full node job');
    }
    plan.docsOnly = plan.rules.every(r => r.rule === 'docs' || r.rule === 'ignored');
    return plan;
}

/** The ids of the checks a plan selects, in order, with the reason each is there. Pure (buildChecks makes them runnable). */
export function planSteps(plan, { browser = false } = {}) {
    const steps = [{ id: 'changelog', why: 'always on' }, { id: 'changelog-pr', why: 'always on' }, { id: 'release-fragments', why: 'always on' }];
    if (plan.docsOnly) return steps;
    steps.push({ id: 'bootstrap', why: 'regenerates only when a source changed (the stamp short-circuit)' }, { id: 'version', why: 'always on for code' }, { id: 'generated-tree', why: 'always on for code' });
    if (plan.releasePr) steps.push({ id: 'release-pr', why: 'core/VERSION changed' });
    if (plan.nodeAll) steps.push({ id: 'node-tests', why: 'all node tests' });
    else if (plan.nodeFiles.size) steps.push({ id: 'node-tests', why: `${plan.nodeFiles.size} test file(s)` });
    if (plan.audit) steps.push({ id: 'audit', why: 'audit sources changed or the full node job applies' });
    if (plan.auditModules) steps.push({ id: 'audit-modules', why: 'modules or shared code changed' });
    if (plan.dotnet) steps.push({ id: 'dotnet', why: plan.dotnet.all ? 'the whole dotnet test' : `${plan.dotnet.classes.size} test class(es)` });
    if (browser && (plan.browserFull || plan.browserElements.size)) steps.push({ id: 'browser', why: plan.browserFull ? 'the whole browser suite (not mappable)' : `cases naming ${[...plan.browserElements].join(', ')}` });
    if (browser && plan.uiElements.size) steps.push({ id: 'ui-review', why: `gallery examples and scenarios of ${[...plan.uiElements].join(', ')}` });
    return steps;
}

// ---------- git and filesystem ----------

const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** The base to compare to: --base, else origin/next-0.13, else origin/main; null when none exists. */
export function defaultBase(explicit, cwd) {
    if (explicit) return explicit;
    for (const ref of ['origin/next-0.13', 'origin/main']) if (git(['rev-parse', '--verify', '--quiet', ref], cwd).status === 0) return ref;
    return null;
}

/** Files changed since the merge base with `base`: committed, staged, unstaged and untracked. null when git cannot say (then the caller runs everything). */
export function changedSince(base, cwd) {
    const mb = git(['merge-base', base, 'HEAD'], cwd);
    if (mb.status !== 0) return null;
    const diff = git(['diff', '--name-only', mb.stdout.trim()], cwd);
    const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd);
    if (diff.status !== 0 || untracked.status !== 0) return null;
    return [...new Set([...diff.stdout.split('\n'), ...untracked.stdout.split('\n')].map(s => s.trim()).filter(Boolean))].sort();
}

/** Reads what planChanged needs from the working tree. */
export function gatherContext(cwd) {
    const list = (...globs) => git(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...globs], cwd).stdout.split('\n').filter(Boolean).filter(p => fs.existsSync(path.join(cwd, p)));
    const read = p => ({ path: p, text: fs.readFileSync(path.join(cwd, p), 'utf8') });
    return { exists: p => fs.existsSync(path.join(cwd, p)), tests: list('*.test.mjs').map(read), csTests: list('blazor/tests/*.cs').map(read) };
}

// ---------- runnable checks ----------

/** `PkFoo`-style class names into a dotnet --filter expression. */
export const dotnetFilter = classes => [...classes].sort().map(c => `FullyQualifiedName~${c}`).join('|');

/**
 * Runnable check objects (the shape verify.mjs runs) for a plan. `CHECKS` is verify.mjs's table, `NODE` the node path; `tmp` is where a scratch UI review goes.
 * Standard checks are reused as they are; node-tests, dotnet, browser and ui-review are re-made with the narrowed command.
 */
export function buildChecks(plan, { CHECKS, NODE, browser = false }) {
    const byId = id => CHECKS.find(c => c.id === id);
    const synth = (id, cmd, extra = {}) => ({ ...(byId(id) ?? { group: 'node', needs: ['bootstrap'], fast: false, cause: '', fix: '' }), id, name: id, cmd, ...extra });
    return planSteps(plan, { browser }).map(({ id }) => {
        if (id === 'node-tests' && !plan.nodeAll) return synth('node-tests', () => [NODE, '--test', '--test-reporter=spec', ...[...plan.nodeFiles].sort()]);
        if (id === 'dotnet' && !plan.dotnet.all) return synth('dotnet', () => ['dotnet', 'test', 'PlainKit.slnx', '--configuration', 'Release', '--nologo', '--filter', dotnetFilter(plan.dotnet.classes)]);
        if (id === 'browser') {
            const args = plan.browserFull ? [] : ['--elements', [...plan.browserElements].sort().join(',')];
            return synth('browser', () => [NODE, 'scripts/attest-browser.mjs', ...args]);
        }
        if (id === 'ui-review') {
            return synth('ui-review', () => [NODE, 'scripts/ui-review.mjs', '--elements', [...plan.uiElements].sort().join(','), '--jobs', '4', '--out', path.join(os.tmpdir(), 'pk-ui-review-changed')], {
                group: 'browser', after: ['browser'], cause: 'a UI review audit error on a gallery example or scenario of a changed element',
                fix: 'run `node scripts/ui-review.mjs --elements <name>`, open the shots in the output folder, and fix the element (each finding prints its own FIX line)',
            });
        }
        return byId(id);
    });
}

/** The text printed before the run: what changed, what each file mapped to, and the checks chosen. */
export function describePlan(plan, { base, browser }) {
    const out = [`verify --changed: ${plan.files.length} file(s) changed versus ${base}`];
    const byRule = new Map();
    for (const r of plan.rules) { if (!byRule.has(r.rule)) byRule.set(r.rule, { why: r.why, files: [] }); byRule.get(r.rule).files.push(r.file); }
    for (const [name, { why, files }] of byRule) out.push(`  ${name}: ${files.length > 3 ? `${files.slice(0, 3).join(', ')} and ${files.length - 3} more` : files.join(', ')}  (${why})`);
    for (const s of planSteps(plan, { browser })) out.push(`  -> ${s.id}: ${s.why}`);
    if (!browser && (plan.browserFull || plan.browserElements.size || plan.uiElements.size)) out.push('  (browser cases and UI review not selected: add --browser)');
    for (const n of plan.notes) out.push(`  note: ${n}`);
    out.push('  The full verify --pack, the whole browser suite and the Node 22 job stay for the integration batch and CI.');
    return out.join('\n');
}
