// Plainkit scoring: turn measurements into 0-100 scores, rank the worst first, and keep a history so a regression
// shows as a delta. Pure functions over a definitions object (scorecard/scoring.data.js); storage is passed in.
// Framework-free; no imports.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// 100 at or better than good, 0 at or worse than poor, linear between; null when there is no measurement.
export function scoreMetric(value, { good, poor, lowerIsBetter = true }) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    const t = lowerIsBetter ? (poor - value) / (poor - good) : (value - poor) / (good - poor);
    return Math.round(clamp(t, 0, 1) * 100);
}

// Weighted mean of the scored metrics of one category. Metrics with no measurement are left out. Returns { score, metrics }.
export function scoreCategory(def, measured) {
    const rows = []; let sum = 0; let weights = 0;
    for (const [key, m] of Object.entries(def.metrics)) {
        const value = measured[key];
        const score = scoreMetric(value, m);
        rows.push({ key, label: m.label, value: value ?? null, score, weight: m.weight ?? 1 });
        if (score !== null) { sum += score * (m.weight ?? 1); weights += m.weight ?? 1; }
    }
    return { score: weights ? Math.round(sum / weights) : null, metrics: rows };
}

// { overall, categories: { key: { label, score, metrics } } } from a flat map of measurements.
export function scoreAll(scoring, measured) {
    const categories = {}; let sum = 0; let weights = 0;
    for (const [key, def] of Object.entries(scoring.categories)) {
        const c = scoreCategory(def, measured);
        categories[key] = { label: def.label, weight: def.weight, ...c };
        if (c.score !== null) { sum += c.score * def.weight; weights += def.weight; }
    }
    return { overall: weights ? Math.round(sum / weights) : null, categories };
}

// A control's score: 100 minus a penalty per finding, floor 0. Findings are { severity }.
export function scoreFindings(findings, penalty) {
    return Math.max(0, 100 - findings.reduce((n, f) => n + (penalty[f.severity] ?? 0), 0));
}

// Rank items { name, score, findings } worst first (lowest score, then most findings, then name).
export function rankWorstFirst(items) {
    return [...items].sort((a, b) => (a.score - b.score) || ((b.findings?.length ?? 0) - (a.findings?.length ?? 0)) || String(a.name).localeCompare(b.name));
}

// Collapse repeated findings (same check + selector across widths and themes) into one row with a count.
export function groupFindings(findings) {
    const map = new Map();
    for (const f of findings) {
        const key = `${f.check}|${f.selector}`;
        const row = map.get(key) ?? { ...f, count: 0, contexts: [] };
        row.count++;
        if (f.context && !row.contexts.includes(f.context)) row.contexts.push(f.context);
        map.set(key, row);
    }
    return [...map.values()];
}

export function readHistory(storage, key) {
    try { const v = JSON.parse(storage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Append a run { at, overall, categories: { key: score }, items: { name: score } } and keep the newest `max`.
export function pushRun(storage, key, run, max = 40) {
    const history = [...readHistory(storage, key), run].slice(-max);
    try { storage.setItem(key, JSON.stringify(history)); } catch { /* storage full or blocked: the run is still returned */ }
    return history;
}

// Differences between two runs: overall and category deltas, and items whose score changed (regressions first).
export function deltas(previous, current) {
    if (!previous) return { overall: null, categories: {}, items: [] };
    const categories = {};
    for (const [k, v] of Object.entries(current.categories ?? {})) categories[k] = previous.categories?.[k] === undefined || v === null || previous.categories[k] === null ? null : v - previous.categories[k];
    const items = [];
    for (const [name, score] of Object.entries(current.items ?? {})) {
        const before = previous.items?.[name];
        if (before !== undefined && before !== score) items.push({ name, before, after: score, delta: score - before });
    }
    items.sort((a, b) => a.delta - b.delta);
    return { overall: current.overall === null || previous.overall === null ? null : current.overall - previous.overall, categories, items };
}

export const exportHistory = history => JSON.stringify({ version: 1, history }, null, 2);

export function importHistory(text) {
    const o = JSON.parse(text);
    const history = Array.isArray(o) ? o : o.history;
    if (!Array.isArray(history) || history.some(r => typeof r !== 'object' || r === null || !('at' in r))) throw new Error('not a scorecard history file');
    return history;
}
