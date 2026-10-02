// Lazy part of <pk-table>: the selection scope of a paged list (issue 801). The table imports this on demand, only when `total` is set, so its own module stays inside its budget.
// The element draws the "Select all N rows" button inside the bulk status (part bulk-all) and keeps `selectScope`; this module styles it, shows and words it after each render,
// and raises pk-select-all. The ids never travel for scope "all": `selected` stays the loaded ids and the host expands the scope by asking its data source again.

import { sheetFor } from './element.js';

const STYLES = '[part="bulk-all"]{padding:var(--space-1) var(--space-2);border:0;border-radius:var(--radius-sm);background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}[part="bulk-all"]:focus-visible{outline:var(--focus-ring)}@media (max-width:640px){[part="bulk-all"]{min-block-size:var(--touch-target)}}';
let sheet;

// A click on the button: widen the page selection to every row of the query, or (once widened) clear it.
export function click(t, e) {
    if (!e.target.closest('[part="bulk-all"]')) return false;
    if (t.wide) t.pick([]); else { t.selectScope = 'all'; t.emit('pk-select-all', { scope: 'all', count: t.total }); }
    return true;
}

// The user selected every loaded row (pk-select carries the ids as well).
export const page = (t, count) => t.emit('pk-select-all', { scope: 'page', count });

// After each render: the button shows when the whole page is selected and the query has more rows (then it says how many), and once widened it clears.
export function after(t, rows, checked) {
    const root = t.shadowRoot, b = t.part('bulk-all'), wide = t.wide;
    if (!root.adoptedStyleSheets.includes(sheet ??= sheetFor(STYLES))) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    b.hidden = !(wide || (t.total > rows && checked));
    b.textContent = wide ? 'Clear selection' : `Select all ${t.total} rows`;
    if (wide) t.part('bulk-count').textContent = `All ${t.total || t.selected.length} selected`;
}
