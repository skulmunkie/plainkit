// Row identity and the selection model <pk-table> and its helpers share; headless (no DOM). A row's id is its `key` field as a string, else its position.
export const rowId = (row, i, key) => String(row[key] ?? i);
export const rowIds = (rows, key) => rows.map((r, i) => rowId(r, i, key));
export const rowAt = (rows, ids, id) => rows[ids.indexOf(id)];
export const idSet = selected => new Set(selected.map(String));
export const toggleId = (ids, selected, id, on, keep) => { const s = idSet(selected); s[on ? 'add' : 'delete'](id); return keep ? [...s] : ids.filter(x => s.has(x)); }; // in row order; ids not in the view drop out, unless keep (a manual table's other pages)
export const setPage = (ids, selected, on, keep) => { const s = idSet(selected); for (const i of ids) s[on ? 'add' : 'delete'](i); return keep ? [...s] : on ? ids : []; }; // the select-all box: every loaded row on or off
export const boxState = (selected, total) => { const n = idSet(selected).size; return { count: n, checked: total > 0 && n >= total, mixed: n > 0 && n < total }; }; // the select-all box
