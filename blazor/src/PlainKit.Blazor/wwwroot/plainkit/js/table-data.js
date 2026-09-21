// The pure data logic of <pk-table>: sorting and filtering rows. It sits in js/ so node tests and other code can import it without a DOM.

// A comparable value: numbers ignore currency and grouping, dates parse, text folds case.
export function sortKey(value, type = 'text') {
    if (type === 'text') return String(value ?? '').toLowerCase();
    const n = type === 'number' ? (typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.+-]/g, ''))) : Date.parse(value);
    return Number.isNaN(n) ? -Infinity : n;
}

// Rows sorted by a column ({ key, type }), stable, text with numeric collation; a new array.
export function sortRows(rows, column, direction = 'ascending') {
    if (!column) return rows.slice();
    const s = direction === 'descending' ? -1 : 1, k = rows.map(r => sortKey(r[column.key], column.type));
    return rows.map((_, i) => i).sort((a, b) => s * (typeof k[a] === 'string' ? k[a].localeCompare(k[b], undefined, { numeric: true }) : k[a] - k[b]) || a - b).map(i => rows[i]);
}

// Rows whose text contains every non-empty filter ({ key: text }), case-insensitive.
export function filterRows(rows, filters) {
    const active = Object.entries(filters ?? {}).filter(([, v]) => String(v ?? '').trim() !== '');
    return rows.filter(r => active.every(([k, v]) => String(r[k] ?? '').toLowerCase().includes(String(v).trim().toLowerCase())));
}
