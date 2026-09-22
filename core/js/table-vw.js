// Windowing for <pk-table> (issue 131): kept out of table.js so its own module stays inside the per-element budget. table.js already
// keeps this out of an expandable table (a detail row changes its row's height, which a fixed row height cannot follow) and a
// host-supplied one (the default slot): every row this module ever draws is a plain data row of the element's own shadow tree, built the
// same way table.js builds one when it draws all of them.

// Re-exported so table.js can take both this module and table-data.js's pure sort/filter helpers from one import: table-vw.js is
// already an unconditional dependency of table.js (this default export, below), so folding the two saves a second import statement.
// Neither this module nor table-data.js touches the DOM at import time (no PkElement/HTMLElement dependency): view(), like the rest of
// table-data.js, is plain data logic table.js can call, and is tested, outside a browser.
export { sortKey, sortRows, filterRows, nextSort } from './table-data.js';

// Issue 131: at or above this many rows a non-expandable, non-slotted table windows instead of drawing every row. One constant, not a
// magic number scattered across the source; table.meta.json's summary documents it, so it is the one place a host reads it (no prop:
// the threshold is fixed, to keep this element inside its own gzip budget).
export const THRESHOLD = 500;
const OVERSCAN = 10; // extra rows drawn above and below the viewport, so a fast scroll or a focus move does not flash empty rows

// The table's own view getter (sorted + filtered rows), memoized against the inputs that decide it: a scroll-driven re-render hits the
// cache instead of re-sorting thousands of rows every frame. Correctness never depends on the cache: any changed input recomputes
// through the getter itself, so windowing can never show a different order or a different set of rows than a plain table would.
function view(el) {
    const rows = el.rows, columns = el.columns, filters = el.filters, sort = el.sort, sortDir = el.sortDir, c = el.$vc;
    if (c && c.rows === rows && c.columns === columns && c.filters === filters && c.sort === sort && c.sortDir === sortDir) return c.result;
    const result = el.view;
    el.$vc = { rows, columns, filters, sort, sortDir, result };
    return result;
}

// The first time a render windows: listens on the scroll frame (the table's own shadow node, built once in the constructor, never
// replaced), re-rendering only while windowing stays active.
function attach(el) {
    el.part('scroll').addEventListener('scroll', () => {
        if (!el.$virtual || el.$sq) return;
        el.$sq = true;
        requestAnimationFrame(() => { el.$sq = false; el.requestUpdate(); });
    }, { passive: true });
}

// The rows to draw, or null when this render should not window: table.js then draws every row itself, as it does for a table under
// THRESHOLD rows. Windowing never applies to an expandable table (a detail row changes its row's height, which a fixed row height
// cannot follow) or a host-supplied one (table.js never calls this for that case). Sets el.$virtual, which the scroll listener above
// reads. When it does window: only the rows near the scroll frame's viewport, plus a buffer, flanked by a spacer standing in for the
// rest. el.$rowH drives the range (32 is a first guess); refined here from the previous render's actual row height each time, so it
// converges without table.js ever having to ask for a post-render measurement. h is table.js's own element-builder, passed through so
// this stays a pure function of its arguments (no document dependency of its own), like table-expand.js's h-taking functions. cols is
// el.list('columns') (table.js already validated it once for its own header, so this reads it again rather than take it as a third
// argument).
function body(el, rowsAll, h) {
    const prev = el.part('body').querySelector('tr[data-id]');
    if (prev) el.$rowH = prev.getBoundingClientRect().height || el.$rowH;
    if (el.expandable || rowsAll.length <= THRESHOLD) return el.$virtual = false, null;
    if (!el.$vs) { el.$vs = 1; attach(el); }
    el.$virtual = true;
    const cols = el.list('columns'), lead = Number(el.selectable), sel = new Set(el.selected.map(String));
    const s = el.part('scroll'), rowH = el.$rowH || 32, vh = s.clientHeight || 400, span = cols.length + lead;
    const start = Math.max(0, Math.floor(s.scrollTop / rowH) - OVERSCAN);
    const end = Math.min(rowsAll.length, start + Math.ceil(vh / rowH) + OVERSCAN * 2);
    const al = c => c.align ?? (c.type === 'number' ? 'end' : null), ph = c => c.hidePhone;
    const bump = (size, place) => { const td = h('td', { colspan: span }); td.style.setProperty('padding', '0'); td.style.setProperty('border', '0'); td.style.setProperty('block-size', `${size}px`); return h('tr', { 'data-spacer': place, 'aria-hidden': true }, td); };
    const drawn = rowsAll.slice(start, end).flatMap((row, j) => {
        const i = start + j, id = String(row[el.rowKey] ?? i), pick = h('input', { type: 'checkbox', 'data-select': id, 'aria-label': `Select row ${id}` });
        pick.checked = sel.has(id);
        return [h('tr', { 'data-id': id, 'data-selected': sel.has(id), 'data-clickable': el.clickable, 'aria-current': el.currentRow && el.currentRow === id ? 'true' : null },
            ...(el.selectable ? [h('td', { 'data-check': true }, pick)] : []),
            ...cols.map(c => { const name = `cell-${id}-${c.key}`; return h('td', { 'data-label': c.label ?? c.key, 'data-align': al(c), 'data-hide-phone': ph(c) }, el.querySelector(`:scope > [slot="${name}"]`) ? h('slot', { name }) : String(row[c.key] ?? '')); }))];
    });
    return [...(start > 0 ? [bump(start * rowH, 'top')] : []), ...drawn, ...(end < rowsAll.length ? [bump((rowsAll.length - end) * rowH, 'bottom')] : [])];
}

export default { view, body };
