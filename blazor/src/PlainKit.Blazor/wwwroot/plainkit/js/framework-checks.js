// The pure logic behind the scorecard's framework sections (modules/scorecard): budget checks, the API-surface diff, the security and
// size-sweep summaries, metric and history rows. Data in, plain rows out: no DOM, no fetch, no fs, so it runs the same in a page and
// under Node. Framework-free; no imports.

// The colour word of a 0-100 score, the same bands the ranked table uses: 80 and up good, 55 and up warning.
export const band = s => (s === null || s === undefined ? '' : s >= 80 ? 'ok' : s >= 55 ? 'warn' : 'danger');

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEVERITY_VARIANT = { critical: 'danger', high: 'danger', medium: 'warn', low: 'muted' };
export const severityVariant = s => SEVERITY_VARIANT[s] ?? 'muted';

// KB with one decimal, or a dash when there is no number.
export const kb = n => (typeof n === 'number' && Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : '-');

// Comments and blank runs removed, the way the base-runtime budget counts a script (tests/budgets.test.mjs).
export const stripComments = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n').replace(/\n+/g, '\n');

// Is `value` (a URL string) on the same origin as `base`? Data files a module loads must be the host's own; a relative URL always is.
export function sameOrigin(value, base) {
    try { return new URL(value, base).origin === new URL(base).origin; } catch { return false; }
}

// ---- scored categories ----------------------------------------------------------------------------------------------------

// One category's metric table rows from scoreAll's output and the definitions: { metric, value, good, poor, score, tone }.
export function metricRows(scoring, key, category) {
    return category.metrics.map(m => {
        const def = scoring.categories[key].metrics[m.key];
        return { metric: m.label, value: m.value ?? 'n/a', good: def.good, poor: def.poor, score: m.score ?? 'n/a', tone: band(m.score) };
    });
}

// ---- size and budgets -----------------------------------------------------------------------------------------------------

// sizes: [{ name, budget, gzKb, rawKb }]; budgets: { key: { limit, target?, note? } } (scoring.data.js BUDGETS).
// Rows carry the headroom under the limit and a status: ok, over (past the limit) or none (no budget names this file). Worst first.
export function budgetRows(budgets, sizes) {
    const rows = sizes.map(s => {
        const b = budgets?.[s.budget];
        const limit = b?.limit ?? null;
        const headroom = limit === null || s.gzKb === null ? null : Math.round((limit - s.gzKb) * 100) / 100;
        return { name: s.name, budget: s.budget ?? '', rawKb: s.rawKb, gzKb: s.gzKb, target: b?.target ?? null, limit, headroom, status: limit === null || headroom === null ? 'none' : headroom >= 0 ? 'ok' : 'over' };
    });
    return rows.sort((a, b) => (a.headroom ?? Infinity) - (b.headroom ?? Infinity) || a.name.localeCompare(b.name));
}

export const budgetSummary = rows => ({ total: rows.length, over: rows.filter(r => r.status === 'over').length, unbudgeted: rows.filter(r => r.status === 'none').length });

// ---- API surface ----------------------------------------------------------------------------------------------------------

export const SURFACE_KINDS = ['classes', 'tokens', 'exports'];

// What the baseline holds that the current surface lost (a break) and what it gained. current may be missing: then only counts of the baseline.
export function apiDiff(baseline, current) {
    const counts = {}; const removed = []; const added = [];
    for (const k of SURFACE_KINDS) {
        const before = baseline?.[k] ?? [];
        const after = current?.[k] ?? null;
        const gone = after ? before.filter(x => !after.includes(x)) : [];
        const fresh = after ? after.filter(x => !before.includes(x)) : [];
        counts[k] = { baseline: before.length, current: after ? after.length : null, removed: gone.length, added: fresh.length };
        removed.push(...gone.map(name => ({ kind: k, name })));
        added.push(...fresh.map(name => ({ kind: k, name })));
    }
    return { available: Boolean(current), counts, removed, added };
}

// ---- security -------------------------------------------------------------------------------------------------------------

// The report tools/security.mjs writes: counts per severity (worst first) and the first `limit` findings with a "where" label.
export function securitySummary(report, { limit = 60 } = {}) {
    const findings = report?.findings ?? [];
    const counts = SEVERITIES.filter(k => k in (report?.counts ?? {})).map(k => ({ severity: k, count: report.counts[k] }));
    const rows = findings.slice(0, limit).map((f, i) => ({ id: i + 1, severity: f.severity, rule: f.rule, file: f.file, line: f.line, where: `${f.file}:${f.line}`, message: f.message }));
    return { counts, rows, total: findings.length, shown: rows.length, clean: findings.length === 0 };
}

// ---- size sweep -----------------------------------------------------------------------------------------------------------

// The last full size sweep (site/scorecard/sweep-report.json): the headline numbers, the failing cells and any re-measure notes.
export function sweepSummary(report, { limit = 40 } = {}) {
    const failures = report?.failures ?? [];
    const rows = failures.slice(0, limit).map((f, i) => ({ id: i + 1, item: f.item, width: f.width, theme: f.theme, overflow: f.overflow ?? 0, targets: f.smallTargets ?? 0, reading: f.readingSmall ?? 0, meta: f.metaTooSmall ?? 0, nested: f.nestedScrollers ?? 0 }));
    return {
        failing: failures.length, checked: report?.checked ?? 0, widths: report?.widths ?? [], themes: report?.themes ?? [], partial: Boolean(report?.partial),
        rows, total: failures.length, notes: (report?.remeasured ?? []).map(x => ({ item: x.item, note: x.note })),
    };
}

// ---- history --------------------------------------------------------------------------------------------------------------

// Category keys present in a history (the definitions' order when given, then any others the runs carry).
export function historyCategories(history, scoring) {
    const keys = Object.keys(scoring?.categories ?? {});
    for (const r of history) for (const k of Object.keys(r.categories ?? {})) if (!keys.includes(k)) keys.push(k);
    return keys;
}

// Newest first; each row has its change against the run before it. `when` formats the timestamp.
export function historyRows(history, keys, when = at => new Date(at).toLocaleString()) {
    return [...history].reverse().map((r, i, all) => {
        const before = all[i + 1];
        const row = { id: history.length - i, when: when(r.at), overall: r.overall ?? 'n/a', change: before && typeof r.overall === 'number' && typeof before.overall === 'number' ? r.overall - before.overall : null };
        for (const k of keys) row[k] = r.categories?.[k] ?? 'n/a';
        return row;
    });
}

// A signed change for display: "+3", "-2", "±0", "" when unknown.
export const signed = d => (d === null || d === undefined ? '' : d === 0 ? '±0' : `${d > 0 ? '+' : ''}${d}`);
