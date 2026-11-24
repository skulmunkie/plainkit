// The size trend report (#1985 step 6, policy decision 9, 2026-11-23). REPORT ONLY: it never fails a size, it fails only a missing owner acknowledgement.
// Measures the metrics of the budget policy (the three reference pages, the app entry, core and every built package, the Blazor payload when asked, the
// elements), prints a table with the delta to the previous release and to the 0.30.0 baseline, and flags every metric above +15 percent of that baseline.
// A flagged metric needs an acknowledgement line in the history entry (`acknowledged: [{ metric, approvedBy, reason }]`, written by the owner or with the owner's yes).
// The history, core/tests/size-history.json, is a release artefact like core/VERSION: the release pull request appends one entry with --append.
//   node scripts/size-trend.mjs [--payload] [--json]       measure this tree and print the table against the history (needs the bootstrap)
//   node scripts/size-trend.mjs --append [--payload]       the release pull request: measure and append the entry for core/VERSION (refuses a second entry for one version)
//   node scripts/size-trend.mjs --check [--require-current] check the committed history only (no measurement): shape, flagged metrics acknowledged,
//                                                           and with --require-current an entry for core/VERSION exists
// Exit: 0 ok, 1 an unacknowledged flag or a malformed history, 2 bad input or nothing measurable.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { measure } from './set-ceilings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HISTORY_FILE = path.join(root, 'core', 'tests', 'size-history.json');
export const BASELINE_VERSION = '0.30.0';
/** A metric above this percent over the baseline needs an acknowledgement; above WARN_PCT over the previous release it is only marked. */
export const FLAG_PCT = 15;
export const WARN_PCT = 5;

/** The flat metric map of a measurement: { 'page.table.gzip': n, 'core.packed': n, 'pkg.plainkit.tools.zip': n, ... }. Missing parts (no payload) are left out. */
export function flatten(m) {
    const out = {};
    for (const [page, v] of Object.entries(m.pageWeight ?? {})) for (const k of ['requests', 'gzip', 'brotli']) out[`page.${page}.${k}`] = v[k];
    if (m.appEntryGzBytes) out['app.entryGz'] = m.appEntryGzBytes;
    if (m.core) { out['core.packed'] = m.core.packed; out['core.unpacked'] = m.core.unpacked; }
    for (const [id, v] of Object.entries(m.packages ?? {})) { out[`pkg.${id}.zip`] = v.zip; out[`pkg.${id}.unpacked`] = v.unpacked; }
    if (m.blazorPayload) { out['blazor.coreOnly'] = m.blazorPayload.coreOnly; out['blazor.full'] = m.blazorPayload.full; }
    if (m.elements) { out['elements.totalGz'] = m.elements.totalGz; out['elements.count'] = m.elements.count; out['elements.above3_5kb'] = m.elements.above3_5; out['elements.above4kb'] = m.elements.above4; }
    return out;
}

/** gzip bytes of every core/dist/elements/*.js (the figure core/tests/budgets.test.mjs reports), the total, the counts above 3.5 and 4 KB, the top 15. */
export function measureElements(rootDir) {
    const dir = path.join(rootDir, 'core', 'dist', 'elements');
    const sizes = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'registry.js')
        .map(f => ({ name: f, bytes: zlib.gzipSync(fs.readFileSync(path.join(dir, f))).length })).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
    return {
        count: sizes.length, totalGz: sizes.reduce((s, e) => s + e.bytes, 0),
        above3_5: sizes.filter(e => e.bytes > 3.5 * 1024).length, above4: sizes.filter(e => e.bytes > 4 * 1024).length,
        top: sizes.slice(0, 15).map(e => [e.name, e.bytes]),
    };
}

/** One history entry from a measurement (what --append writes). `exceptions` is the number of active budget exceptions in the ledger. */
export function makeEntry({ version, date, measured, elements, exceptions = 0 }) {
    return { version, date, tree: measured.tree, exceptions, metrics: flatten({ ...measured, elements }), topElements: elements.top };
}

/** Rows of the table: every metric of `entry` with the previous release's and the baseline's value, the deltas in percent (null when there is no reference) and the flags. */
export function compare(history, entry) {
    const at = history.entries.findIndex(e => e.version === entry.version), previous = (at < 0 ? history.entries[history.entries.length - 1] : history.entries[at - 1]) ?? null;
    const baseline = history.entries.find(e => e.version === BASELINE_VERSION) ?? null;
    const acknowledged = new Set((entry.acknowledged ?? []).map(a => a.metric));
    const pct = (now, was) => (typeof was === 'number' && was > 0 ? Math.round(((now - was) / was) * 1000) / 10 : null);
    return Object.entries(entry.metrics).map(([metric, now]) => {
        const prev = previous?.metrics[metric] ?? null, base = baseline?.metrics[metric] ?? null;
        const vsPrev = pct(now, prev), vsBase = pct(now, base);
        return { metric, now, prev, base, vsPrev, vsBase, warn: vsPrev !== null && vsPrev > WARN_PCT, flagged: vsBase !== null && vsBase > FLAG_PCT, acknowledged: acknowledged.has(metric) };
    });
}

/** Problems with a history file: the shape, and (the only gate) a flagged metric of an entry that has no acknowledgement. Sizes themselves never fail. */
export function validate(history) {
    const errors = [];
    if (!history || !Array.isArray(history.entries) || !history.entries.length) return ['size-history.json: `entries` must be a non-empty array'];
    const seen = new Set();
    for (const e of history.entries) {
        const at = `size-history.json entry ${e?.version}`;
        if (!e || !/^\d+\.\d+\.\d+$/.test(e.version ?? '')) { errors.push(`${at}: version must be X.Y.Z`); continue; }
        if (seen.has(e.version)) errors.push(`${at}: appears twice`);
        seen.add(e.version);
        if (!e.metrics || typeof e.metrics !== 'object' || !Object.keys(e.metrics).length) { errors.push(`${at}: metrics missing`); continue; }
        for (const [k, v] of Object.entries(e.metrics)) if (!Number.isFinite(v) || v < 0) errors.push(`${at}: metric ${k} is not a non-negative number`);
        for (const a of e.acknowledged ?? []) if (!a.metric || !a.approvedBy || !a.reason) errors.push(`${at}: an acknowledgement needs metric, approvedBy and reason`);
    }
    if (!seen.has(BASELINE_VERSION)) errors.push(`size-history.json: the baseline entry ${BASELINE_VERSION} is missing`);
    if (errors.length) return errors;
    for (const e of history.entries) {
        if (e.version === BASELINE_VERSION) continue;
        for (const r of compare(history, e)) if (r.flagged && !r.acknowledged) errors.push(`${e.version}: ${r.metric} is ${r.vsBase}% over the ${BASELINE_VERSION} baseline (${r.base} -> ${r.now}), above +${FLAG_PCT}% and not acknowledged. FIX: get the owner's acknowledgement and add { "metric": "${r.metric}", "approvedBy": "<owner>", "reason": "<why>" } to \`acknowledged\` of that entry, or make the source smaller`);
    }
    return errors;
}

/** The markdown table the release pull request description gets. */
export function table(rows) {
    const f = n => (n === null ? '-' : String(n)), p = n => (n === null ? '-' : `${n > 0 ? '+' : ''}${n}%`);
    const lines = ['| metric | now | previous | vs previous | baseline | vs baseline | note |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
    for (const r of rows) lines.push(`| ${r.metric} | ${r.now} | ${f(r.prev)} | ${p(r.vsPrev)} | ${f(r.base)} | ${p(r.vsBase)} | ${r.flagged ? (r.acknowledged ? 'over +15%, acknowledged' : 'OVER +15%, NEEDS ACKNOWLEDGEMENT') : r.warn ? 'over +5% since previous' : ''} |`);
    return lines.join('\n');
}

const readHistory = () => JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
const writeHistory = h => fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(h, null, 2)}\n`.replace(/\n/g, '\r\n'));

async function main(argv) {
    const has = f => argv.includes(f), version = fs.readFileSync(path.join(root, 'core', 'VERSION'), 'utf8').trim();
    let history;
    try { history = readHistory(); } catch (e) { console.error(`size-history.json: ${e.message}`); return 1; }
    if (has('--check')) {
        const errors = validate(history);
        if (has('--require-current') && !history.entries.some(e => e.version === version)) errors.push(`size-history.json has no entry for ${version}. FIX: node scripts/size-trend.mjs --append (in the release pull request, after the bootstrap)`);
        for (const e of errors) console.error(e);
        if (!errors.length) console.log(`size-trend: history ok (${history.entries.length} entries, latest ${history.entries[history.entries.length - 1].version})`);
        return errors.length ? 1 : 0;
    }
    let measured, elements;
    try { measured = await measure(root, { payload: has('--payload') }); elements = measureElements(root); } catch (e) { console.error(e.message); return 2; }
    const ledger = JSON.parse(fs.readFileSync(path.join(root, 'core', 'tests', 'budget-ledger.json'), 'utf8'));
    const entry = makeEntry({ version, date: new Date().toISOString().slice(0, 10), measured, elements, exceptions: (ledger.exceptions ?? []).length });
    if (has('--append')) {
        if (history.entries.some(e => e.version === version)) { console.error(`size-history.json already has an entry for ${version}`); return 1; }
        history.entries.push(entry);
        writeHistory(history);
        console.log(`size-trend: appended ${version}; paste the table below into the release pull request`);
    }
    const prior = history.entries.find(e => e.version === version) ?? entry;
    const rows = compare(history, prior);
    if (has('--json')) console.log(JSON.stringify({ entry, rows }, null, 2)); else console.log(`${table(rows)}\n\nactive budget exceptions: ${entry.exceptions}\ntop elements (gzip bytes): ${entry.topElements.map(([n, b]) => `${n} ${b}`).join(', ')}`);
    const unack = rows.filter(r => r.flagged && !r.acknowledged);
    for (const r of unack) console.error(`FIX: ${r.metric} is ${r.vsBase}% over the ${BASELINE_VERSION} baseline: ask the owner for an acknowledgement line in the history entry, or make the source smaller`);
    return unack.length && has('--append') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
