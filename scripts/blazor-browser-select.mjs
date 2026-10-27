// The `--changed` selection of scripts/blazor-browser.mjs: which harness cases (and screenshot functions) the files changed versus a base can affect.
// The rule is "an unknown or shared file selects everything": a file this module cannot place runs the whole harness, never a part of it. A core/js module selects the cases of the elements that import it (scripts/core-js-users.mjs) and a packages.json change of size ceilings only selects nothing. The nightly workflow,
// `verify --only blazor-browser` and a plain local run never call this module: they run every case and every shot.
// Pure apart from reading the repository (the sample's pages, the mappings, the usage index); the tests are scripts/tests/blazor-browser-select.test.mjs.
import fs from 'node:fs';
import { coreJsUsers } from './core-js-users.mjs';
import path from 'node:path';
import { elementOfPath } from '../core/tools/element-folders.mjs';
import { usageIndex } from '../core/tools/usage-index.mjs';
import { dependentsFromIndex, selectElements } from './ui-review.mjs';
import { LAB_CASES, LAB_SHOTS } from './blazor-browser-lab-cases.mjs';
import { INTEROP_CASES, INTEROP_SHOTS } from './blazor-browser-interop-cases.mjs';
import { ELEMENT_CASES, ELEMENT_SHOTS } from './blazor-browser-element-cases.mjs';
import { RECONNECT_CASES, RECONNECT_SHOTS } from './blazor-browser-reconnect-cases.mjs';

export const PAGES_DIR = 'blazor/samples/PlainKit.AppSample/Components/Pages';
const APP_RAZOR = 'blazor/src/PlainKit.Blazor/Components/PkApp.razor';
export const AREAS = ['shell', 'wasm', 'reconnect', 'devtools', 'extras'];

// [case names, sample page files (basename without .razor), areas]. A page may only be added to a row, never removed.
const ROWS = [
    [['deep-link-record', 'deep-link-has-a-title'], ['OrderRecord'], ['shell']],
    [['refusal-401-in-frame'], ['SecureAudit'], ['shell']],
    [['not-found-404-in-frame'], ['Status'], ['shell']],
    [['nav-link-is-a-client-navigation', 'back-forward', 'focus-moves-into-the-page', 'focus-lands-on-the-h1', 'no-layout-shift-on-route-change'], ['OrdersList'], ['shell']],
    [['module-switch-is-a-client-navigation'], ['Overview', 'OrdersList'], ['shell']],
    [['no-layout-shift-on-load', 'overview-dashboard-from-modules'], ['Overview'], ['shell']],
    [['no-console-errors'], ['Overview', 'OrdersList', 'OrderRecord', 'ReportsSummary', 'SecureAudit', 'Status'], ['shell']],
    [['wasm-lazy-module-assembly', 'wasm-lazy-module-deep-link'], [], ['wasm']],
    [['page-type-panes-are-slots'], ['LabPanes'], []],
    [['list-load-search-refresh', 'list-filter-option-labels-from-the-result', 'list-before-list-slot', 'list-abort-on-navigation', 'list-row-click-callback'], ['LabTickets'], []],
    [['table-named-detail-panels'], ['LabDetailPanels'], []],
    [['list-row-href-template'], ['OrdersList', 'OrderRecord'], []],
    [['record-save-success', 'record-save-failure', 'record-delete'], ['LabTicket'], []],
    [['record-new-save-failure-keeps-edits'], ['LabTicketNew'], []],
    [['record-sections-sidebar-title'], ['LabTicketSections'], []],
    [['record-before-save'], ['LabTicketBefore'], []],
    [['record-field-changed'], ['LabTicketSummary'], []],
    [['record-save-resume'], ['LabTicketResume'], []],
    [['record-follow-edits'], ['LabTicketFollow'], []],
    [['record-when-follows-edit-in-another-card'], ['LabTicketWhen'], []],
    [['fields-every-kind-and-column-span', 'dialog-and-toast', 'dialog-prompt-confirm-values'], ['LabFields'], []],
    [['element-methods', 'link-onclick-href'], ['LabMethods'], []],
    [['devtools-workspace'], [], ['devtools']],
    [['two-way-bind'], ['LabBind'], []],
    [['markdown-editor-bind', 'markdown-view'], ['LabMarkdown'], []],
    [['reconnect-banner'], ['Overview'], ['reconnect']],
    [['table-edit-columns', 'table-column-resize-reorder'], ['LabTableEdit'], []],
    [['theme-toggle'], ['Overview'], ['shell']],
    [['app-search-query-and-select', 'phone-touch-drawer-navigates', 'phone-touch-drawer-closes-after-navigation'], ['OrdersList'], ['shell']],
    [['extras-undeclared-tag-is-reported-once'], ['Overview'], ['extras']],
    [['combobox-search-cancels-superseded-query'], ['LabSearch'], []],
    [['phone-touch-list-and-record'], ['LabTickets', 'LabTicket'], []],
    [['tool-page-run-callback', 'settings-page-save-callback', 'settings-page-section-nav', 'json-attribute-resync', 'dashboard-load-callback'], ['LabPages'], []],
    [['settings-section-content-and-tool-child-content'], ['LabPages', 'LabToolSlot'], []],
    [['doc-page-loaditem-callback'], ['LabDoc'], []],
    [['dock-layout-events-and-confirm', 'tabs-value-binding', 'dialog-isopen-binding'], ['LabLayout'], []],
    [['inputfile-in-dropzone', 'image-gallery-add-by-inputfile'], ['LabFiles'], []],
    [['command-palette-items-property', 'lightbox-items-property', 'code-view-segments-property', 'splitter-collapsed-bind-and-code-view-header', 'button-controls-ref'], ['LabProps'], []],
    [['design-surface-selected-ref', 'canvas-view-pick-key'], ['LabCanvas'], []],
    [['side-nav-open-close'], ['LabNav'], []],
    [['lookup-picker-extra-events-and-debounce', 'data-table-query-binds'], ['LabExtras'], []],
    [['image-gallery-pointer-reorder', 'kanban-pointer-move'], ['LabDrag'], []],
    [['reconnect-banner-desktop-layout', 'reconnect-banner-desktop-overlay', 'reconnect-banner-phone-icons', 'reconnect-host-restart-rejected', 'reconnect-host-restart-auto-reload', 'reconnect-host-restart-loop-guard'], ['Overview'], ['reconnect']],
];
export const CASE_MAP = Object.fromEntries(ROWS.flatMap(([names, pages, areas]) => names.map(n => [n, { pages, areas }])));

/** Files that select everything, [pattern, reason]. The shared Blazor source (every file of blazor/src/PlainKit.Blazor not listed as an area or as none) is the last rule, applied in selectCases. */
export const FULL_FILES = [
    [/^scripts\/(blazor-browser|blazor-browser-cases|blazor-browser-guard|blazor-browser-select|attest-browser|ui-review|verify-guard|generated|bootstrap|bootstrap-stamp|generate-blazor|publish-dist)\.mjs$/, 'the harness or what produces what it serves'],
    [/^core\/tests\/browser\/cpu-scale\.js$/, 'imported by the harness'],
    [/^core\/(base|tokens|layouts|icons|modules|tools)\//, 'shared core'],
    [/^core\/(package\.json|VERSION)$/, 'core package'],
    [/^(package\.json|package-lock\.json|global\.json|Directory\.[^/]+\.props|NuGet\.config|PlainKit\.slnx)$/, 'build configuration'],
    [/^blazor\/samples\/PlainKit\.AppSample\/(PlainKit\.AppSample\.csproj|Components\/_Imports\.razor)$/, 'the sample project'],
];

/** Files of the Blazor source that only an area of the harness uses, [pattern, areas]. */
export const AREA_FILES = [
    [/^blazor\/src\/PlainKit\.Blazor\/(Components\/PkApp\.razor|Components\/PkRouteGuard\.razor|PkNavModel\.cs|PkAppModules\.cs|PkModuleBoundary\.cs|PkModuleGuard\.cs|PkAppBarSearchTypes\.cs|EndpointExtensions\.cs)$/, ['shell']],
    [/^blazor\/samples\/PlainKit\.AppSample\/(Program\.cs|Components\/App\.razor|Components\/Routes\.razor|Modules\/.*)$/, ['shell']],
    [/^blazor\/src\/PlainKit\.Blazor\/PkLazyModuleLoader\.cs$/, ['wasm', 'shell']],
    [/^blazor\/samples\/PlainKit\.AppSample\.(Wasm|Insights)\//, ['wasm']],
    [/^blazor\/src\/PlainKit\.Blazor\/(Components\/PkReconnect\.razor|PkReconnectOptions\.cs|PkOptions\.Reconnect\.cs|wwwroot\/plainkit\.reconnect\.(js|css))$/, ['reconnect']],
    [/^blazor\/src\/PlainKit\.Blazor\/(DevTools\/.*|Components\/Pk(DevTools|DevToolsWorkspace|CodeExplorer|Console|LogSettings|Logs|ModuleDashboard|Performance|Quality|Scorecard|Scripts|Styles|ThemeEditor)\.razor|wwwroot\/blazor-devtools\.js)$/, ['devtools']],
    [/^core\/(site|samples)\//, ['devtools']],
    // 'extras' has no file of its own: PkExtraCheck, PkExtraSet and PkOptions.Extras are used by PkRuntime, the service registration and PkOptions, so they are shared source (everything).
];

/** Files that select nothing. Evaluated after everything else, so a script the harness does not use or a test is skipped. */
export const NONE_FILES = [
    /\.md$/, /^changelog\//, /^docs\//, /^\.github\//, /^blazor\/tests\//, /^scripts\/tests\//, /^core\/tests\//, /^scripts\/skills\//,
    /^blazor\/(handwritten|handwritten\.baseline)\.json$/, /^blazor\/src\/PlainKit\.Blazor\/Testing\//, /^blazor\/samples\/PlainKit\.(Playground|WasmPlayground)\//,
    /\.test\.mjs$/, /^scripts\/[^/]+\.mjs$/,
];

/** The size-ceiling keys of packages.json: read only by scripts/check-package.mjs and scripts/blazor-extras-publish.mjs (verify --pack), never by a generator, the build or the sample. */
export const CEILING_KEYS = ['maxPackedBytes', 'maxUnpackedBytes', 'maxZipBytes'];
/** True when two texts of packages.json differ only in size ceilings (and blazorPayload). A missing or unparsable side is false. Pure. */
export function ceilingsOnly(baseText, headText) {
    let a, b;
    try { a = JSON.parse(baseText); b = JSON.parse(headText); } catch { return false; }
    if (!a || !b) return false;
    const strip = d => JSON.stringify({ ...d, blazorPayload: null, packages: (d.packages ?? []).map(p => Object.fromEntries(Object.entries(p).filter(([k]) => !CEILING_KEYS.includes(k)))) });
    return strip(a) === strip(b);
}

const CASE_FILES = {
    lab: [LAB_CASES, LAB_SHOTS], interop: [INTEROP_CASES, INTEROP_SHOTS], element: [ELEMENT_CASES, ELEMENT_SHOTS], reconnect: [RECONNECT_CASES, RECONNECT_SHOTS],
};
const norm = f => f.replace(/\\/g, '/');

/** { name: { name, routes: [{ param, re }], text } } of the sample's pages, from their @page lines. */
export function samplePages(root) {
    const dir = path.join(root, PAGES_DIR), out = {};
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.razor'))) {
        const text = fs.readFileSync(path.join(dir, f), 'utf8'), name = f.slice(0, -'.razor'.length), routes = [];
        for (const m of text.matchAll(/^@page\s+"([^"]+)"/gm)) routes.push({ param: m[1].includes('{'), re: new RegExp(`^${m[1].split('/').map(s => /^\{.*\}$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}/?$`) });
        out[name] = { name, routes, text };
    }
    return out;
}

/** The sample page a route (a path, maybe with a query) is, or null. Pure given the pages. */
export const pageOfRoute = (pages, route) => {
    const p = route.split(/[?#]/)[0], hits = Object.values(pages).flatMap(pg => pg.routes.filter(r => r.re.test(p)).map(r => ({ name: pg.name, param: r.param })));
    return (hits.find(h => !h.param) ?? hits[0])?.name ?? null; // a literal route (/orders/open) wins over a parameter one (/orders/{Id})
};

/** The literal routes a case or shot function opens or clicks into (`ctx.open('/x')`, `ctx.clickLink('/x')`; barUp opens `/`). */
export function routesOf(fn) {
    const src = fn.toString(), routes = [...src.matchAll(/ctx\.(?:open|clickLink)\(\s*(['"`])([^'"`$]*)\1/g)].map(m => m[2]);
    if (/barUp\(/.test(src)) routes.push('/');
    return routes;
}

/** Component name -> element name (blazor/mappings/<tag>.json holds `"component": "Pk..."`). */
function componentMap(root) {
    const dir = path.join(root, 'blazor', 'mappings'), out = {};
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).component;
        if (c) out[c] = f.slice(0, -'.json'.length);
    }
    return out;
}

/** The element names a razor text draws: every <PkName> through the mappings, plus every literal <pk-name>. */
function tagsOf(text, comps) {
    const tags = new Set();
    for (const m of text.matchAll(/<(Pk[A-Z]\w*)/g)) if (comps[m[1]]) tags.add(comps[m[1]]);
    for (const m of text.matchAll(/<pk-([a-z0-9-]+)/g)) tags.add(m[1]);
    return tags;
}

/**
 * What the files changed versus the base can affect. `files === null` (git could not say) selects everything, as does any file this module cannot place.
 * -> { full, reasons, cases: Set(name), shots: Set(index into shots), because: [[file, [case names]]] }
 */
export function selectCases(files, { root, cases, wasmCases, shots, readBase = () => null }) {
    const all = [...cases, ...wasmCases], names = all.map(c => c.name);
    const everything = reasons => ({ full: true, reasons, cases: new Set(names), shots: new Set(shots.map((_, i) => i)), because: [] });
    if (files === null) return everything(['git could not say what changed']);
    const pages = samplePages(root), comps = componentMap(root), appText = fs.readFileSync(path.join(root, APP_RAZOR), 'utf8'), appTags = tagsOf(appText, comps);
    const { index } = usageIndex(root), known = new Set(Object.keys(index));
    let users = null;
    const fullReasons = [], contribs = [];
    for (const raw of files) {
        const f = norm(raw), c = { file: f, pages: new Set(), areas: new Set(), elements: new Set(), fns: new Set() };
        const full = FULL_FILES.find(([r]) => r.test(f));
        if (full) { fullReasons.push(`${f} (${full[1]})`); continue; }
        if (/\.test\.mjs$/.test(f)) continue;
        if (f === 'packages.json') {
            const head = fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null;
            if (ceilingsOnly(readBase(f), head)) continue;
            fullReasons.push(`${f} (more than the size ceilings changed)`); continue;
        }
        if (/^core\/js\/.+\.js$/.test(f)) {
            const u = (users ??= coreJsUsers(root))(f);
            if (u.full) { fullReasons.push(`${f} (${u.full})`); continue; }
            const unknown = u.elements.filter(n => !known.has(n));
            if (unknown.length) { fullReasons.push(`${f} (imported by ${unknown.join(', ')}, which the usage index does not know)`); continue; }
            u.elements.forEach(n => c.elements.add(n));
            c.areas.add('devtools'); // the DevTools Files and Code views show every source file
            contribs.push(c); continue;
        }
        const cf = /^scripts\/blazor-browser-(lab|interop|element|reconnect)-cases\.mjs$/.exec(f);
        const area = AREA_FILES.filter(([r]) => r.test(f));
        const page = new RegExp(`^${PAGES_DIR.replace(/[.]/g, '\\.')}/(\\w+)\\.razor$`).exec(f);
        const mapping = /^blazor\/mappings\/([^/]+)\.json$/.exec(f), folder = elementOfPath(f);
        if (cf) for (const x of CASE_FILES[cf[1]][0]) c.fns.add(x.name);
        else if (area.length) for (const [, a] of area) a.forEach(x => c.areas.add(x));
        else if (page) { if (pages[page[1]]) c.pages.add(page[1]); else { fullReasons.push(`${f} (a page this module does not know)`); continue; } }
        else if (mapping) { if (known.has(mapping[1])) c.elements.add(mapping[1]); else { fullReasons.push(`${f} (a mapping of no known element)`); continue; } }
        else if (folder) { if (known.has(folder.name)) c.elements.add(folder.name); else { fullReasons.push(`${f} (a folder of no known element)`); continue; } }
        else if (NONE_FILES.some(r => r.test(f))) continue;
        else { fullReasons.push(`${f} (${/^blazor\/src\/PlainKit\.Blazor\//.test(f) ? 'shared Blazor source' : 'unknown file'})`); continue; }
        contribs.push(c);
    }
    if (fullReasons.length) return everything(fullReasons.slice(0, 5));

    const dependents = contribs.some(c => c.elements.size) ? dependentsFromIndex(index) : {};
    const caseTags = c => { const t = new Set(appTags); for (const p of CASE_MAP[c.name]?.pages ?? []) tagsOf(pages[p]?.text ?? '', comps).forEach(x => t.add(x)); return t; };
    const caseSet = new Set(), because = [];
    const caseFile = c => c.fns.size ? c.fns : null;
    for (const c of contribs) {
        const areas = new Set(c.areas); if (areas.has('shell')) areas.add('wasm');
        const hit = c.elements.size ? new Set(Object.keys(selectElements([...c.elements], dependents, known))) : new Set();
        const mine = all.filter(k => {
            if (caseFile(c)?.has(k.name)) return true;
            const m = CASE_MAP[k.name] ?? { pages: [], areas: [] };
            return m.pages.some(p => c.pages.has(p)) || m.areas.some(a => areas.has(a)) || (hit.size && [...caseTags(k)].some(t => hit.has(t)));
        }).map(k => k.name);
        mine.forEach(n => caseSet.add(n));
        if (mine.length) because.push([c.file, mine]);
        c.hit = hit; c.allAreas = areas;
    }

    const selectedPages = new Set(), selectedAreas = new Set();
    for (const k of all) if (caseSet.has(k.name)) { (CASE_MAP[k.name]?.pages ?? []).forEach(p => selectedPages.add(p)); (CASE_MAP[k.name]?.areas ?? []).forEach(a => selectedAreas.add(a)); }
    const shotSet = new Set();
    shots.forEach((fn, i) => {
        const routes = routesOf(fn).map(r => ({ r, page: pageOfRoute(pages, r) })), shotPages = routes.map(x => x.page).filter(Boolean);
        const shotAreas = routes.filter(x => !x.page).map(x => (/^\/_plainkit/.test(x.r) ? 'devtools' : 'shell'));
        const tags = new Set(appTags); for (const p of shotPages) tagsOf(pages[p].text, comps).forEach(t => tags.add(t));
        const byFile = contribs.some(c => c.fns.size && Object.values(CASE_FILES).some(([cs, ss]) => ss.includes(fn) && cs.some(x => c.fns.has(x.name))));
        const byPage = shotPages.some(p => selectedPages.has(p) || contribs.some(c => c.pages.has(p)));
        const byArea = shotAreas.some(a => selectedAreas.has(a) || contribs.some(c => c.allAreas.has(a)));
        const byTag = contribs.some(c => c.hit?.size && [...tags].some(t => c.hit.has(t)));
        if (byFile || byPage || byArea || byTag) shotSet.add(i);
    });
    return { full: false, reasons: [], cases: caseSet, shots: shotSet, because };
}

/** The lines printed for a selection. total = { cases, shots }. */
export function describeSelection(sel, total) {
    const head = `blazor browser --changed: ${sel.cases.size} of ${total.cases} cases, ${sel.shots.size} of ${total.shots} screenshot functions`;
    if (sel.full) return `${head} (full: ${sel.reasons.join('; ')})`;
    if (!sel.because.length) return `${head} (nothing the changed files can affect)`;
    return `${head} (because: ${sel.because.map(([f, c]) => `${f} -> ${c.length > 4 ? `${c.slice(0, 4).join(', ')} and ${c.length - 4} more` : c.join(', ')}`).join('; ')})`;
}
