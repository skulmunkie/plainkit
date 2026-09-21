// Pure logic behind the logs viewer (modules/logs): filtering the entries of js/log.js by level, scope and text, the list of scopes seen,
// counts per level, a row for the table, a readable form of an entry's detail (objects as JSON, errors with their stack), and the JSON
// export/import format. No browser API is required, so node tests cover it.

export const VIEW_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
const RANK = Object.fromEntries([...VIEW_LEVELS, 'silent'].map((l, i) => [l, i]));
export const MAX_IMPORT = 2000;
export const EXPORT_FORMAT = 'plainkit-log';

const pad = (n, w = 2) => String(n).padStart(w, '0');

// 14:03:09.042 in the viewer's time zone.
export function formatTime(at) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// Entries at or above `minLevel`, in one of `scopes` (any scope when the list is empty), whose scope or message contains `text`
// (case-insensitive). Returns a new array in the same order.
export function filterLogEntries(entries, { minLevel = 'debug', scopes = [], text = '' } = {}) {
    const floor = RANK[minLevel] ?? 0;
    const wanted = new Set(scopes);
    const needle = String(text ?? '').trim().toLowerCase();
    return entries.filter(e => (RANK[e.level] ?? 0) >= floor
        && (!wanted.size || wanted.has(e.scope))
        && (!needle || e.message.toLowerCase().includes(needle) || e.scope.toLowerCase().includes(needle)));
}

// The distinct scopes of the entries (plus any extra ones), sorted.
export const scopesOf = (entries, extra = []) => [...new Set([...entries.map(e => e.scope), ...extra])].sort((a, b) => a.localeCompare(b));

// { debug, info, warn, error } counts.
export function countLevels(entries) {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of entries) if (e.level in counts) counts[e.level]++;
    return counts;
}

// Where an entry went: the level it needed to reach an output (the scope's level, else the global one) and the outputs its level is
// routed to. `config` is getLoggingConfig(). An entry below the level was only buffered: seen here, in no output.
export function routeOf(entry, config) {
    const needed = config?.scopes?.[entry.scope] ?? config?.level ?? 'warn';
    const outputs = config?.routes?.[entry.level] ?? [];
    const below = (RANK[entry.level] ?? 0) < (RANK[needed] ?? 0);
    return { below, needed, outputs: below ? [] : outputs };
}

// Words for the Output column: 'buffered only' for a muted entry, else the outputs it was sent to.
export function outputLabel(entry, config) {
    const r = routeOf(entry, config);
    if (r.below) return 'buffered only';
    return r.outputs.length ? r.outputs.join(', ') : 'no output';
}

const isNode = v => typeof Node !== 'undefined' && v instanceof Node;

// A JSON-safe copy of any value: errors become { name, message, stack, cause }, cycles and depth are cut, functions and elements are named.
export function toPlain(value, depth = 6, seen = new WeakSet()) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value === undefined) return null;
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
    if (isNode(value)) return `[${value.nodeType === 1 ? `<${value.localName}${value.id ? `#${value.id}` : ''}>` : value.nodeName}]`;
    if (seen.has(value)) return '[circular]';
    if (depth < 0) return Array.isArray(value) ? `[Array(${value.length})]` : '[object]';
    seen.add(value);
    try {
        if (value instanceof Error) {
            const out = { name: value.name, message: value.message, stack: value.stack };
            if (value.cause !== undefined) out.cause = toPlain(value.cause, depth - 1, seen);
            return out;
        }
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
        if (Array.isArray(value)) return value.slice(0, 200).map(v => toPlain(v, depth - 1, seen));
        const out = {};
        for (const k of Object.keys(value).slice(0, 100)) out[k] = toPlain(value[k], depth - 1, seen);
        return out;
    } catch { return '[unreadable]'; }
    finally { seen.delete(value); }
}

// How to show an entry's detail: { kind: 'none' | 'error' | 'text' | 'json', text }. An Error is its stack; a string is itself; anything
// else is pretty JSON (capped, so a huge object does not freeze the page).
export function describeDetail(detail, limit = 20000) {
    if (detail === undefined) return { kind: 'none', text: '' };
    if (detail instanceof Error) return { kind: 'error', text: detail.stack || `${detail.name}: ${detail.message}` };
    if (typeof detail === 'string') return { kind: 'text', text: detail };
    let text;
    try { text = JSON.stringify(toPlain(detail), null, 2) ?? String(detail); } catch { text = String(detail); }
    return { kind: 'json', text: text.length > limit ? `${text.slice(0, limit)}\n... ${text.length - limit} more characters` : text };
}

// One table row: { id, time, level, scope, message, output }. The message keeps to one line (the full text is in the detail).
export function rowFor(entry, config) {
    return {
        id: entry.id, time: formatTime(entry.at), level: entry.level, scope: entry.scope,
        message: entry.message.replace(/\s+/g, ' ').slice(0, 300), output: outputLabel(entry, config),
    };
}

// Appends an entry, keeping the newest `max`. Returns a new array.
export const pushLog = (entries, entry, max = 1000) => [...entries, entry].slice(-max);

// Text of the export file: { format, version, exported, entries: [{ at (ISO), level, scope, message, detail? }] }.
export function serializeEntries(entries, now = Date.now()) {
    return JSON.stringify({
        format: EXPORT_FORMAT, version: 1, exported: new Date(now).toISOString(),
        entries: entries.map(e => ({ at: new Date(e.at).toISOString(), level: e.level, scope: e.scope, message: e.message, ...(e.detail === undefined ? {} : { detail: toPlain(e.detail) }) })),
    }, null, 2);
}

// Reads an export file (or a bare array of entries). Entries that are not valid are skipped and counted; nothing throws.
// Returns { entries: [{ at, level, scope, message, detail? }], skipped, error? }.
export function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch { return { entries: [], skipped: 0, error: 'That is not a JSON file.' }; }
    const list = Array.isArray(data) ? data : data?.entries;
    if (!Array.isArray(list)) return { entries: [], skipped: 0, error: 'No entries found in that file.' };
    const entries = [];
    let skipped = 0;
    for (const raw of list.slice(0, MAX_IMPORT)) {
        const at = typeof raw?.at === 'number' ? raw.at : Date.parse(raw?.at);
        const ok = raw && typeof raw === 'object' && VIEW_LEVELS.includes(raw.level) && typeof raw.scope === 'string' && raw.scope && raw.scope.length <= 60
            && typeof raw.message === 'string' && Number.isFinite(at);
        if (!ok) { skipped++; continue; }
        entries.push({ at, level: raw.level, scope: raw.scope, message: raw.message.slice(0, 5000), ...(raw.detail === undefined ? {} : { detail: raw.detail }) });
    }
    skipped += Math.max(0, list.length - MAX_IMPORT);
    return { entries, skipped, ...(entries.length ? {} : { error: 'No valid entries in that file.' }) };
}

// Merges imported entries into the list by time, keeping the newest `max`. Every entry gets an id from `nextId` upward.
export function mergeEntries(entries, incoming, nextId, max = 1000) {
    const added = incoming.map((e, i) => ({ ...e, id: nextId + i, imported: true }));
    return { entries: [...entries, ...added].sort((a, b) => a.at - b.at || a.id - b.id).slice(-max), nextId: nextId + added.length };
}
