// Pure logic behind the audit dashboard's module-baseline panel (modules/audit-dashboard): parsing plainkit.audit.modules.baseline.json
// (docs/superpowers/specs/2026-09-30-audit-dashboard-design.md), grouping its entries, filtering them and describing one entry for the
// Properties panel. No browser API is required, so node tests cover it directly. The dashboard never regenerates this file: it only reads
// whatever is already on disk (node scripts/audit-modules.mjs is the regen command, documented in the panel header, never run here).

// { version, entries: [{ rule, file, fingerprint }] } -> entries, or throws a message naming what is wrong (the panel shows it instead of a blank table).
export function parseBaseline(json) {
    if (!json || typeof json !== 'object') throw new Error('not a module baseline: expected an object');
    if (!Array.isArray(json.entries)) throw new Error('not a module baseline: expected an "entries" array');
    for (const e of json.entries) {
        if (!e || typeof e.rule !== 'string' || typeof e.file !== 'string') throw new Error('not a module baseline: every entry needs a rule and a file');
    }
    return json.entries;
}

// Entries whose rule/file match the given (case-insensitive) substrings. Either filter left out or empty matches everything.
export function filterBaseline(entries, { rule = '', file = '' } = {}) {
    const r = rule.trim().toLowerCase(), f = file.trim().toLowerCase();
    return entries.filter(e => (!r || e.rule.toLowerCase().includes(r)) && (!f || e.file.toLowerCase().includes(f)));
}

// Grouped by file then rule id, each with its count, sorted by file then rule for a stable read (most files first would hide the rest, so this
// is alphabetical, matching #682's paydown notes). [{ file, count, rules: [{ rule, count }] }]
export function groupBaselineByFile(entries) {
    const byFile = new Map();
    for (const e of entries) {
        if (!byFile.has(e.file)) byFile.set(e.file, new Map());
        const byRule = byFile.get(e.file);
        byRule.set(e.rule, (byRule.get(e.rule) ?? 0) + 1);
    }
    return [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, byRule]) => ({
        file,
        count: [...byRule.values()].reduce((n, c) => n + c, 0),
        rules: [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rule, count]) => ({ rule, count })),
    }));
}

// The same entries grouped by rule id first, for a "which rule is noisiest" read. [{ rule, count, files: [{ file, count }] }]
export function groupBaselineByRule(entries) {
    const byRule = new Map();
    for (const e of entries) {
        if (!byRule.has(e.rule)) byRule.set(e.rule, new Map());
        const byFile = byRule.get(e.rule);
        byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);
    }
    return [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rule, byFile]) => ({
        rule,
        count: [...byFile.values()].reduce((n, c) => n + c, 0),
        files: [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, count]) => ({ file, count })),
    }));
}

// One row per (file, rule) pair for the flat pk-table view, each with a stable id (its position after sorting) for row-click -> Properties lookup.
export function baselineRows(entries) {
    return groupBaselineByFile(entries).flatMap(g => g.rules.map(r => ({ id: `${g.file}::${r.rule}`, file: g.file, rule: r.rule, count: r.count })));
}

// A readable timestamp for the panel header: an ISO mtime formatted as "generated <date>, <time>" (the caller passes the file's mtime; the
// baseline JSON itself carries no timestamp field). Falls back to "unknown" for a missing/invalid date.
export function describeStaleness(mtimeIso) {
    const d = new Date(mtimeIso);
    if (Number.isNaN(d.getTime())) return 'generated: unknown';
    return `generated ${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

// The detail shown in the Properties panel when a baseline row is selected.
export function baselineDetail(row) {
    if (!row) return null;
    return {
        heading: row.rule,
        fields: [
            { label: 'Rule', value: row.rule },
            { label: 'File', value: row.file },
            { label: 'Occurrences', value: String(row.count) },
        ],
        fix: `node scripts/audit-modules.mjs to see this finding's current text and re-check it; the baseline only tracks accepted legacy debt for ${row.file}.`,
    };
}
