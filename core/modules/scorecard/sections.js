// The scorecard's framework sections, drawn from the pure rows of js/framework-checks.js with SDK components only (pk-card, pk-stat,
// pk-table, pk-tabs, pk-badge, pk-button, pk-empty-state). No markup strings: every node is built with the DOM, every text is set as text.

import { band, metricRows, budgetRows, budgetSummary, apiDiff, securitySummary, sweepSummary, historyCategories, historyRows, severityVariant, kb, signed } from '../../js/framework-checks.js';

const CLUSTER = 'cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start';
const STAT_TONE = { ok: 'positive', warn: 'warning', danger: 'critical', '': 'neutral' };

export function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

export const card = (doc, heading, ...children) => h(doc, 'pk-card', { heading, class: 'sc-section' }, ...children);
export const note = (doc, text) => h(doc, 'p', { class: 'muted' }, text);
export const badge = (doc, variant, text) => h(doc, 'pk-badge', { variant }, text);
export const emptyState = (doc, heading, description) => h(doc, 'pk-empty-state', { heading, description, tone: 'compact' });
const row = (doc, ...children) => h(doc, 'div', { class: CLUSTER }, ...children);

// A data-driven pk-table. columns: [{ key, label, align?, sortable? }]; rows need an id; cells: { key: row => Node } fills a cell with a
// component (a badge, a link) through the table's cell slots.
export function table(doc, { label, columns, rows, cells = {}, filterable = false, maxHeight = '' }) {
    const t = h(doc, 'pk-table', { label, density: 'compact', hover: true, filterable, 'max-height': maxHeight || false, columns: JSON.stringify(columns), rows: JSON.stringify(rows) });
    for (const r of rows) for (const [key, make] of Object.entries(cells)) {
        const node = make(r);
        if (node) t.append(h(doc, 'span', { slot: `cell-${r.id}-${key}` }, node));
    }
    return t;
}

const num = (key, label) => ({ key, label, align: 'end', sortable: true });
const text = (key, label) => ({ key, label, sortable: true });

// ---- a section that has no data -------------------------------------------------------------------------------------------

export const missing = (doc, host, what, hint) => host.replaceChildren(emptyState(doc, `No ${what} yet`, hint));

// ---- scored categories (after a run) --------------------------------------------------------------------------------------

// Overall plus one tile per category, each with its score, its change since the last run and (with two runs or more) a sparkline.
export function scoreTiles(doc, scores, { deltas = { overall: null, categories: {} }, history = [] } = {}) {
    const tile = (label, score, delta, series) => {
        const values = series.filter(v => typeof v === 'number');
        return h(doc, 'pk-stat', { label, value: score === null || score === undefined ? 'n/a' : String(score), tone: STAT_TONE[band(score)], tile: true, subtext: delta === null || delta === undefined ? '' : `${signed(delta)} since the last run`, values: values.length > 1 ? JSON.stringify(values) : false });
    };
    const overall = tile('Overall', scores.overall, deltas.overall, history.map(r => r.overall));
    overall.classList.add('sc-tile-big');
    return h(doc, 'div', { class: 'sc-scores' }, overall, ...Object.entries(scores.categories).map(([k, c]) => tile(c.label, c.score, deltas.categories?.[k], history.map(r => r.categories?.[k]))));
}

// One tab per scored category (its metrics against good and poor), plus one for the stylesheets.
export function categoryTabs(doc, scoring, scores, perFile) {
    const entries = Object.entries(scores.categories);
    const tabs = []; const panels = [];
    const add = (value, label, score, body) => {
        tabs.push(h(doc, 'pk-tab', { value }, score === undefined ? label : `${label} ${score ?? 'n/a'}`));
        panels.push(h(doc, 'pk-tab-panel', { value }, body));
    };
    for (const [key, c] of entries) {
        const rows = metricRows(scoring, key, c).map((r, i) => ({ id: i + 1, ...r }));
        add(key, c.label, c.score, table(doc, {
            label: `${c.label} metrics`,
            columns: [text('metric', 'Metric'), num('value', 'Value'), num('good', 'Good'), num('poor', 'Poor'), num('score', 'Score')],
            rows,
            cells: { score: r => (r.score === 'n/a' ? null : badge(doc, r.tone, String(r.score))) },
        }));
    }
    add('stylesheets', 'Stylesheets', undefined, table(doc, {
        label: 'Stylesheets',
        columns: [text('name', 'File'), num('bytes', 'Bytes'), num('rules', 'Rules'), num('selectors', 'Selectors'), num('literalColours', 'Literal colours'), num('literalSizes', 'Literal sizes')],
        rows: perFile.map((f, i) => ({ id: i + 1, name: f.name, bytes: f.bytes, rules: f.rules, selectors: f.selectors, literalColours: f.literalColours, literalSizes: f.literalSizes })),
        filterable: true,
        maxHeight: '28rem',
    }));
    return h(doc, 'pk-tabs', { value: entries[0]?.[0] ?? 'stylesheets', scroll: true }, ...tabs, ...panels);
}

// ---- size and budgets -----------------------------------------------------------------------------------------------------

export function paintSize(doc, host, { sizes, budgets }) {
    if (!sizes?.length) return missing(doc, host, 'sizes measured', 'Pass data.sizes: the files to weigh, each with the budget it belongs to.');
    if (!budgets) return missing(doc, host, 'budgets', 'Pass data.budgets: the limits each file is held to.');
    const rows = budgetRows(budgets, sizes).map((r, i) => ({ id: i + 1, ...r }));
    const s = budgetSummary(rows);
    host.replaceChildren(
        row(doc, badge(doc, s.over ? 'danger' : 'ok', s.over ? `${s.over} over budget` : 'All inside budget'), badge(doc, 'muted', `${s.total} measured`), s.unbudgeted ? badge(doc, 'muted', `${s.unbudgeted} with no budget`) : null),
        note(doc, 'Gzip size measured in this browser from the built files, against the limits in the budget definitions. A limit only ever comes down. Headroom is the limit minus the size.'),
        table(doc, {
            label: 'Size against budget',
            columns: [text('name', 'File'), num('raw', 'Raw KB'), num('gz', 'Gzip KB'), num('target', 'Target KB'), num('limit', 'Limit KB'), num('headroom', 'Headroom KB'), text('status', 'Status')],
            rows: rows.map(r => ({ id: r.id, name: r.name, raw: kb(r.rawKb), gz: r.gzKb === null ? 'n/a' : (Math.round(r.gzKb * 100) / 100).toString(), target: r.target ?? '-', limit: r.limit ?? '-', headroom: r.headroom ?? '-', status: r.status })),
            cells: { status: r => badge(doc, r.status === 'ok' ? 'ok' : r.status === 'over' ? 'danger' : 'muted', r.status === 'ok' ? 'inside' : r.status === 'over' ? 'over budget' : 'no budget') },
            filterable: true,
            maxHeight: '28rem',
        }),
    );
}

// ---- API surface ----------------------------------------------------------------------------------------------------------

export function paintApi(doc, host, { baseline, current }) {
    if (!baseline) return missing(doc, host, 'API baseline', 'Pass data.apiBaseline: the surface of the previous release (node tools/api-surface.mjs --write).');
    const d = apiDiff(baseline, current);
    const tiles = h(doc, 'div', { class: 'sc-scores' }, ...Object.entries(d.counts).map(([k, c]) => h(doc, 'pk-stat', {
        label: k, tile: true, value: String(c.current ?? c.baseline), tone: c.removed ? 'critical' : 'neutral',
        subtext: c.current === null ? 'in the baseline' : `baseline ${c.baseline}, ${c.removed} removed, ${c.added} added`,
    })));
    const parts = [tiles];
    if (!d.available) {
        parts.push(note(doc, 'No current surface was given (data.api), so only the baseline is counted. Removals and additions show once it is.'));
    } else {
        parts.push(row(doc, badge(doc, d.removed.length ? 'danger' : 'ok', d.removed.length ? `${d.removed.length} removed from the baseline` : 'Nothing removed from the baseline'), badge(doc, 'muted', `${d.added.length} added`)));
        const list = (label, items) => table(doc, { label, columns: [text('kind', 'Kind'), text('name', 'Name')], rows: items.map((x, i) => ({ id: i + 1, ...x })), filterable: true, maxHeight: '20rem' });
        if (d.removed.length) parts.push(list('Removed from the baseline (breaking)', d.removed));
        if (d.added.length) parts.push(list('Added since the baseline', d.added));
    }
    host.replaceChildren(...parts);
}

// ---- size sweep -----------------------------------------------------------------------------------------------------------

export function paintSweep(doc, host, report) {
    if (!report) return missing(doc, host, 'sweep report', 'Pass data.sweep: the last size sweep report.');
    const s = sweepSummary(report);
    const parts = [
        row(doc, badge(doc, s.failing ? 'warn' : 'ok', `${s.failing} failing`), badge(doc, 'muted', `${s.checked} cells checked`), badge(doc, 'muted', `${s.widths.join(', ')}px`), badge(doc, 'muted', s.themes.join(' + ')), s.partial ? badge(doc, 'danger', 'partial') : null),
        note(doc, 'Every view, template and control sample at each width and theme: overflow, targets under 44px on a phone, reading text under 14px, secondary text under 12px, nested scrollers.'),
    ];
    if (s.rows.length) parts.push(table(doc, {
        label: 'Failing cells',
        columns: [text('item', 'Item'), num('width', 'Width'), text('theme', 'Theme'), num('overflow', 'Overflow'), num('targets', 'Targets'), num('reading', 'Reading'), num('meta', 'Meta'), num('nested', 'Nested')],
        rows: s.rows, filterable: true, maxHeight: '24rem',
    }));
    if (s.total > s.rows.length) parts.push(note(doc, `Showing ${s.rows.length} of ${s.total}.`));
    for (const n of s.notes) parts.push(note(doc, `${n.item}: ${n.note}`));
    host.replaceChildren(...parts);
}

// ---- security and defects -------------------------------------------------------------------------------------------------

// fileLink(file, line) gives the Where column a link target; without it the place is plain text.
export function paintSecurity(doc, host, report, { fileLink } = {}) {
    if (!report) return missing(doc, host, 'security report', 'Pass data.security: the report tools/security.mjs writes (node tools/security.mjs --write).');
    const s = securitySummary(report);
    const parts = [row(doc, ...s.counts.map(c => badge(doc, c.count ? severityVariant(c.severity) : 'muted', `${c.severity} ${c.count}`)))];
    if (s.clean) parts.push(emptyState(doc, 'No findings', 'The scan found nothing to report.'));
    else parts.push(table(doc, {
        label: 'Security and defect findings',
        columns: [text('severity', 'Severity'), text('rule', 'Rule'), text('where', 'Where'), text('message', 'Detail')],
        rows: s.rows,
        cells: {
            severity: r => badge(doc, severityVariant(r.severity), r.severity),
            where: r => (fileLink ? h(doc, 'a', { href: fileLink(r.file, r.line) }, r.where) : null),
        },
        filterable: true, maxHeight: '28rem',
    }));
    if (s.total > s.shown) parts.push(note(doc, `Showing ${s.shown} of ${s.total}.`));
    host.replaceChildren(...parts);
}

// ---- history --------------------------------------------------------------------------------------------------------------

// actions: { onExport, onImport(file), onClear } add the toolbar; history is the runs kept under the mount's historyKey.
export function paintHistory(doc, host, { history, scoring, actions }) {
    const parts = [];
    if (actions) {
        const file = h(doc, 'input', { type: 'file', accept: 'application/json', hidden: true, 'aria-label': 'Import history file' });
        file.addEventListener('change', () => { const f = file.files?.[0]; if (f) actions.onImport(f); file.value = ''; });
        const button = (label, variant, fn) => { const b = h(doc, 'pk-button', { variant, size: 'mini' }, label); b.addEventListener('click', fn); return b; };
        parts.push(row(doc, button('Export history', 'ghost', actions.onExport), button('Import history', 'ghost', () => file.click()), button('Clear history', 'warn', actions.onClear), file));
    }
    if (!history.length) {
        parts.push(emptyState(doc, 'No runs yet', 'Each run is kept in this browser so the next one shows what changed.'));
    } else {
        const keys = historyCategories(history, scoring);
        const label = k => scoring?.categories?.[k]?.label ?? k;
        parts.push(table(doc, {
            label: 'Runs, newest first',
            columns: [text('when', 'Run'), num('overall', 'Overall'), ...keys.map(k => num(k, label(k))), num('change', 'Change')],
            rows: historyRows(history, keys).map(r => ({ ...r, change: signed(r.change) })),
            cells: { overall: r => (typeof r.overall === 'number' ? badge(doc, band(r.overall), String(r.overall)) : null) },
            maxHeight: '24rem',
        }));
    }
    host.replaceChildren(...parts);
}
