// Pure logic behind the dev console (modules/console): turning any value into a short readable string, the entry list with its cap,
// level and text filters, and describing an element. No browser API is required, so node tests cover it.

export const LEVELS = Object.freeze(['debug', 'log', 'info', 'warn', 'error']);
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

// Turns a console argument into text: strings as they are, errors as name and message, objects as compact JSON with cycles and depth cut.
export function formatArg(value, depth = 2, seen = new WeakSet()) {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof Node !== 'undefined' && value instanceof Node) return describeNode(value);
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (depth < 0) return Array.isArray(value) ? `[Array(${value.length})]` : '[object]';
    if (Array.isArray(value)) return `[${value.slice(0, 20).map(v => formatArg(v, depth - 1, seen)).join(', ')}${value.length > 20 ? `, ... ${value.length - 20} more` : ''}]`;
    const keys = Object.keys(value);
    return `{${keys.slice(0, 20).map(k => `${k}: ${formatArg(value[k], depth - 1, seen)}`).join(', ')}${keys.length > 20 ? `, ... ${keys.length - 20} more` : ''}}`;
}

// Console.log-style formatting: a leading %s/%d/%i/%f/%o/%O/%j string consumes arguments, the rest are appended.
export function formatArgs(args) {
    if (!args.length) return '';
    const [first, ...rest] = args;
    if (typeof first !== 'string' || !/%[sdifoOj%]/.test(first)) return args.map(a => formatArg(a)).join(' ');
    let i = 0;
    const text = first.replace(/%([sdifoOj%])/g, (m, t) => {
        if (t === '%') return '%';
        if (i >= rest.length) return m;
        const v = rest[i++];
        return t === 'd' || t === 'i' ? String(Math.trunc(Number(v))) : t === 'f' ? String(Number(v)) : formatArg(v);
    });
    return [text, ...rest.slice(i).map(a => formatArg(a))].join(' ');
}

const describeNode = n => (n.nodeType === 1 ? `<${n.localName}${n.id ? `#${n.id}` : ''}${typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/).join('.')}` : ''}>` : `[${n.nodeName}]`);

// { tag, id, classes, text } for something that looks like an element (works on the DOM and on plain test doubles).
export function describeElement(el) {
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    return { tag: el.localName ?? String(el.tagName ?? '').toLowerCase(), id: el.id || '', classes, text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) };
}

// A console entry. source: 'console' | 'error' | 'rejection' | 'event'.
export function makeEntry(level, text, { source = 'console', at = Date.now(), detail } = {}) {
    return { level: LEVELS.includes(level) ? level : 'log', text, source, at, ...(detail === undefined ? {} : { detail }) };
}

// Appends keeping the newest `max`. Returns a new array.
export const pushEntry = (entries, entry, max = 500) => [...entries, entry].slice(-max);

// Entries at or above `minLevel`, from the given sources (all when empty), whose text contains `text` (case-insensitive).
export function filterEntries(entries, { minLevel = 'debug', text = '', sources } = {}) {
    const needle = text.trim().toLowerCase();
    const floor = RANK[minLevel] ?? 0;
    return entries.filter(e => RANK[e.level] >= floor && (!sources?.length || sources.includes(e.source)) && (!needle || e.text.toLowerCase().includes(needle)));
}

// Counts per level, for the toolbar badges.
export function countByLevel(entries) {
    const out = Object.fromEntries(LEVELS.map(l => [l, 0]));
    for (const e of entries) out[e.level]++;
    return out;
}

// The entries as JSON text, for copying or saving.
export const exportEntries = entries => JSON.stringify(entries.map(e => ({ ...e, at: new Date(e.at).toISOString() })), null, 2);

// pk-* tags with how many of each are in the page: [{ tag, count, defined }] sorted by tag. tags: local names found in the document;
// isDefined(tag) says whether the custom element is registered.
export function elementInventory(tags, isDefined) {
    const counts = new Map();
    for (const t of tags) if (t.startsWith('pk-')) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([tag, count]) => ({ tag, count, defined: Boolean(isDefined(tag)) }));
}
