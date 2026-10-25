// scripts/blazor-browser-select.mjs: the --changed selection of the Blazor browser harness. A case nobody mapped cannot be silently unselected, and a file nobody placed selects everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, WASM_CASES, SHOT_PLAN } from '../blazor-browser-cases.mjs';
import { parseArgs } from '../blazor-browser.mjs';
import { AREAS, CASE_MAP, PAGES_DIR, describeSelection, pageOfRoute, routesOf, samplePages, selectCases } from '../blazor-browser-select.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALL = [...CASES, ...WASM_CASES];
const pages = samplePages(root);
const select = files => selectCases(files, { root, cases: CASES, wasmCases: WASM_CASES, shots: SHOT_PLAN });
const names = sel => [...sel.cases].sort();
const PAGE = n => `${PAGES_DIR}/${n}.razor`;

test('every case is mapped, nothing is stale, every page exists and every area is known', () => {
    for (const c of ALL) assert.ok(CASE_MAP[c.name], `FIX: map the case ${c.name} in CASE_MAP (scripts/blazor-browser-select.mjs): a case with no row is never selected by --changed`);
    for (const [name, row] of Object.entries(CASE_MAP)) {
        assert.ok(ALL.some(c => c.name === name), `CASE_MAP row ${name} is not a case`);
        assert.ok(row.pages.length || row.areas.length, `${name} has neither a page nor an area`);
        for (const p of row.pages) assert.ok(fs.existsSync(path.join(root, PAGE(p))), `${name}: ${p} is not a page of the sample`);
        for (const a of row.areas) assert.ok(AREAS.includes(a), `${name}: unknown area ${a}`);
    }
});

test('every literal route a case opens belongs to a page or an area of its row', () => {
    for (const c of ALL) {
        const row = CASE_MAP[c.name];
        if (row.areas.includes('wasm')) continue; // those routes belong to the WebAssembly sample
        for (const r of routesOf(c.run)) {
            const p = pageOfRoute(pages, r);
            const ok = p ? row.pages.includes(p) : (/^\/_plainkit/.test(r) && row.areas.includes('devtools')) || (r === '/nope' && row.areas.includes('shell'));
            assert.ok(ok, `FIX: ${c.name} opens ${r} (page ${p ?? 'none'}); add the page to its CASE_MAP row`);
        }
    }
});

test('every screenshot function resolves to a page or an area', () => {
    SHOT_PLAN.forEach((fn, i) => {
        const routes = routesOf(fn);
        assert.ok(routes.length, `screenshot function ${i} opens no literal route`);
        assert.ok(routes.every(r => pageOfRoute(pages, r) || /^\/_plainkit|^\/nope/.test(r)), `screenshot function ${i} opens ${routes.join(', ')}, which is no page`);
    });
});

test('a literal route wins over a parameter route', () => {
    assert.equal(pageOfRoute(pages, '/orders/open'), 'OrdersList');
    assert.equal(pageOfRoute(pages, '/orders/8'), 'OrderRecord');
    assert.equal(pageOfRoute(pages, '/orders?x=1'), 'OrdersList');
    assert.equal(pageOfRoute(pages, '/'), 'Overview');
});

test('one lab page selects its cases and its screenshot only', () => {
    const sel = select([PAGE('LabCanvas')]);
    assert.equal(sel.full, false);
    assert.deepEqual(names(sel), ['canvas-view-pick-key', 'design-surface-selected-ref']);
    assert.equal(sel.shots.size, 1);
    assert.ok(routesOf(SHOT_PLAN[[...sel.shots][0]]).includes('/lab/canvas'));
});

test('a shared or unknown file selects everything', () => {
    for (const f of ['blazor/src/PlainKit.Blazor/PkElementBase.cs', 'core/js/bridge.js', 'scripts/blazor-browser.mjs', 'blazor/src/PlainKit.Blazor/SomethingNew.cs', 'foo/unknown.txt']) {
        const sel = select([f]);
        assert.equal(sel.full, true, f);
        assert.equal(sel.cases.size, ALL.length, f);
        assert.equal(sel.shots.size, SHOT_PLAN.length, f);
    }
    assert.equal(select(null).full, true);
});

test('docs, tests and the testing helpers select nothing', () => {
    const sel = select(['README.md', 'changelog/unreleased/x.md', 'scripts/tests/x.test.mjs', 'blazor/src/PlainKit.Blazor/Testing/PkPageTesting.cs']);
    assert.equal(sel.full, false);
    assert.equal(sel.cases.size, 0);
    assert.equal(sel.shots.size, 0);
});

test('the reconnect files select the reconnect cases', () => {
    const sel = select(['blazor/src/PlainKit.Blazor/Components/PkReconnect.razor']);
    assert.equal(sel.full, false);
    assert.equal(sel.cases.size, 6);
    assert.ok(names(sel).every(n => CASE_MAP[n].areas.includes('reconnect')));
});

test('the sample startup selects the shell and the WebAssembly cases, not a lab page', () => {
    const sel = select(['blazor/samples/PlainKit.AppSample/Program.cs']);
    assert.equal(sel.full, false);
    for (const c of ALL) if (CASE_MAP[c.name].areas.includes('shell') || CASE_MAP[c.name].areas.includes('wasm')) assert.ok(sel.cases.has(c.name), c.name);
    assert.ok(!sel.cases.has('design-surface-selected-ref'));
});

test('a mapping selects the cases of the pages that use the component', () => {
    assert.deepEqual(names(select(['blazor/mappings/design-surface.json'])), ['canvas-view-pick-key', 'design-surface-selected-ref']);
});

test('an element the app frame draws selects every case', () => {
    const sel = select(['core/shells/app-frame/app-frame.css']);
    assert.deepEqual(names(sel), ALL.map(c => c.name).sort());
});

test('the selected cases keep the table order, so the host-restart cases stay last', () => {
    const sel = select(['blazor/src/PlainKit.Blazor/Components/PkReconnect.razor', PAGE('LabCanvas')]);
    const picked = CASES.filter(c => sel.cases.has(c.name)).map(c => c.name);
    assert.equal(picked.at(-1), CASES.at(-1).name);
    assert.ok(picked.indexOf('canvas-view-pick-key') < picked.indexOf('reconnect-banner-desktop-layout'));
});

test('describeSelection names the reason', () => {
    assert.match(describeSelection(select(['foo/unknown.txt']), { cases: ALL.length, shots: SHOT_PLAN.length }), /full: foo\/unknown\.txt/);
    assert.match(describeSelection(select([PAGE('LabCanvas')]), { cases: ALL.length, shots: SHOT_PLAN.length }), /2 of \d+ cases.*LabCanvas\.razor -> /);
});

test('parseArgs: --changed and --base', () => {
    assert.throws(() => parseArgs(['--changed', '--cases', 'a']), /use either --cases or --changed/);
    const o = parseArgs(['--changed', '--base', 'origin/x']);
    assert.equal(o.changed, true);
    assert.equal(o.base, 'origin/x');
    assert.equal(parseArgs([]).changed, false);
});
