// The audit dashboard as a module: mountAuditDashboard(container, options) is a read-only viewer over audit/test artifacts already on
// disk (docs/superpowers/specs/2026-09-30-audit-dashboard-design.md) -- module-ruleset baseline debt today; UI review and conformance-audit
// findings are follow-up panels, not yet built (see the module's header comment in the spec for why). It NEVER shells out or triggers a
// script: it only fetch()es a JSON file a build/audit step already wrote, and a refresh only re-reads that same file. Laid out as a pk-dock
// workspace (module baseline | Properties), matching the dockable-panel pattern other devtools surfaces use (core/elements/dock); the
// module-baseline panel itself is a flat, client-side-filterable list rather than nested dock groups -- pk-dock's tree groups are a
// workspace arrangement of whole panels (split/tabs), not a facet of one panel's data, so forcing "by file" / "by rule" into dock groups
// would misuse that model. Selecting a finding populates the shared Properties panel with its full detail instead.
//
//   const dash = await mountAuditDashboard(el, { baselineUrl: '/_audit/module-baseline.json', persistKey: 'audit-dashboard' });
//   dash.selectBaseline('core/modules/logs/logs.js::S3'); dash.destroy();
//
// Options: baselineUrl (where to fetch the module baseline JSON from; default '/_audit/module-baseline.json', served by core/tools/serve.mjs
// from the repo-root plainkit.audit.modules.baseline.json), theme, height (any CSS length; default 32rem), persistKey (pk-dock layout
// persistence, see pk-dock's own persistKey).
// Returns { refresh(), selectBaseline(id), destroy() }.

import { ensureStyles, styleUrls, loadJson, h, on } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { applyDynamic } from '../../js/dynamic.js';
import { createLogger } from '../../js/log.js';
import { parseBaseline, filterBaseline, baselineRows, describeStaleness, baselineDetail } from './logic.js';

const log = createLogger('audit-dashboard');
const STYLES = ['../../plainkit.css'];
export const DEFAULT_BASELINE_URL = '/_audit/module-baseline.json';
const COLUMNS = [{ key: 'file', label: 'File' }, { key: 'rule', label: 'Rule' }, { key: 'count', label: 'Count' }];
const REGEN_COMMAND = 'node scripts/audit-modules.mjs';

export async function mountAuditDashboard(container, options = {}) {
    const { baselineUrl = DEFAULT_BASELINE_URL, theme, height, persistKey } = options;
    const doc = container.ownerDocument;
    await ensureStyles(styleUrls(STYLES, import.meta.url), doc);

    let entries = [];
    let rows = [];
    let ruleFilter = '';
    let fileFilter = '';
    let selectedId = null;

    // ---- shell: pk-dock with a module-baseline panel and a shared Properties panel -------------------------------------------
    const search = h(doc, 'pk-input', { type: 'search', label: 'Filter by file', placeholder: 'Filter by file substring', clearable: true, debounce: 150 });
    const ruleInput = h(doc, 'pk-input', { type: 'search', label: 'Filter by rule id', placeholder: 'Filter by rule id substring', clearable: true, debounce: 150 });
    const refreshBtn = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Refresh (re-reads the file, never regenerates it)');
    const statusEl = h(doc, 'span', { class: 'ad-status', role: 'status' }, 'Loading...');
    const sourceLabel = typeof baselineUrl === 'string' ? baselineUrl : 'plainkit.audit.modules.baseline.json';
    const table = h(doc, 'pk-table', { label: 'Module baseline findings', density: 'compact', stickyHeader: true, clickable: true, manual: true, cards: true, maxHeight: '20rem', columns: JSON.stringify(COLUMNS) },
        h(doc, 'pk-empty-state', { slot: 'empty', heading: 'No findings', tone: 'compact', description: `Nothing matches, or ${sourceLabel} has no entries.` }));
    const baselinePanel = h(doc, 'div', { slot: 'baseline', 'data-heading': 'Module baseline', 'data-group': 'center', class: 'ad-panel' },
        h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'p', { class: 'ad-header' }, `Reads ${sourceLabel} (repo-root plainkit.audit.modules.baseline.json), accepted module-ruleset debt from #682's paydown work. Regenerate with: ${REGEN_COMMAND}`),
            h(doc, 'pk-cluster', {}, search, ruleInput, refreshBtn, statusEl),
            table));

    const propertiesBody = h(doc, 'div', { class: 'ad-properties' }, h(doc, 'pk-empty-state', { tone: 'compact', heading: 'Nothing selected', description: 'Choose a finding to see its detail here.' }));
    const propertiesPanel = h(doc, 'div', { slot: 'properties', 'data-heading': 'Properties', 'data-group': 'right', class: 'ad-panel' }, propertiesBody);

    const dock = h(doc, 'pk-dock', { label: 'Audit dashboard', fill: true }, baselinePanel, propertiesPanel);
    if (persistKey) dock.setAttribute('persist-key', persistKey);
    const root = h(doc, 'div', { class: 'ad-module' }, dock);
    if (theme) root.setAttribute('data-theme', theme);
    root.dataset.dyn = `height:${height === 'fill' ? '100%' : (height ?? '32rem')}`;
    applyDynamic(root);
    container.replaceChildren(root);
    loadElements(root).catch(err => log.debug('elements did not load (loadElements reports it)', err));

    // ---- drawing ----------------------------------------------------------------------------------------------------------
    function drawTable() {
        const filtered = filterBaseline(entries, { rule: ruleFilter, file: fileFilter });
        rows = baselineRows(filtered);
        table.setAttribute('rows', JSON.stringify(rows));
        statusEl.textContent = `${rows.length} of ${baselineRows(entries).length} findings shown`;
    }

    function drawProperties() {
        const row = rows.find(r => r.id === selectedId) ?? null;
        const detail = baselineDetail(row);
        if (!detail) { propertiesBody.replaceChildren(h(doc, 'pk-empty-state', { tone: 'compact', heading: 'Nothing selected', description: 'Choose a finding to see its detail here.' })); return; }
        const card = h(doc, 'pk-card', { heading: detail.heading, level: 4 },
            h(doc, 'pk-stack', { gap: 'xs' },
                ...detail.fields.map(f => h(doc, 'p', { class: 'ad-field' }, `${f.label}: ${f.value}`)),
                h(doc, 'p', { class: 'ad-fix' }, detail.fix)));
        propertiesBody.replaceChildren(card);
        loadElements(propertiesBody).catch(err => log.debug('elements did not load (loadElements reports it)', err));
    }

    // ---- loading ------------------------------------------------------------------------------------------------------------
    async function load() {
        statusEl.textContent = 'Loading...';
        try {
            entries = parseBaseline(await loadJson(baselineUrl));
            selectedId = null;
            drawTable();
            drawProperties();
        } catch (err) {
            log.warn('could not load the module baseline', err);
            entries = [];
            drawTable();
            statusEl.textContent = `Could not load ${baselineUrl}: ${err.message}. Run ${REGEN_COMMAND} to generate it.`;
        }
    }

    // ---- controls -------------------------------------------------------------------------------------------------------------
    // Every listener goes through mount-support.js's on() (S7: platform access belongs behind the SDK's own APIs, never addEventListener
    // called directly inside a module's own source).
    on(search, 'pk-search', e => { fileFilter = e.detail.value ?? ''; drawTable(); });
    on(ruleInput, 'pk-search', e => { ruleFilter = e.detail.value ?? ''; drawTable(); });
    on(refreshBtn, 'click', () => load());
    on(table, 'pk-row-click', e => { selectedId = e.detail?.id ?? null; drawProperties(); });

    await load();
    return {
        refresh: () => load(),
        selectBaseline(id) { selectedId = rows.some(r => r.id === id) ? id : null; drawProperties(); },
        destroy() { root.remove(); },
    };
}

// The staleness note a header could show when the caller also knows the file's mtime (win.fetch gives no reliable mtime cross-origin,
// so this is left to the caller, e.g. a Node script listing the file's mtime; describeStaleness itself is pure, see logic.js).
export { describeStaleness };
