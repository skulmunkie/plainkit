// Windowing for <pk-table> (issue 131): kept out of table.js so its own module stays inside the per-element budget. table.js already
// keeps this out of an expandable table (a detail row changes its row's height, which a fixed row height cannot follow) and a
// host-supplied one (the default slot): every row this module ever draws is a plain data row of the element's own shadow tree, built the
// same way table.js builds one when it draws all of them.

// Re-exported so table.js takes this module and table-data.js's pure sort/filter helpers from one import (neither touches the DOM at import time).
export { sortKey, sortRows, filterRows, nextSort } from './table-data.js';
import { rowId, idSet } from './rowset.js';

// Issue 131: at or above this many rows a non-expandable, non-slotted table windows instead of drawing every row. One constant, not a
// magic number scattered across the source; table.meta.json's summary documents it, so it is the one place a host reads it (no prop:
// the threshold is fixed, to keep this element inside its own gzip budget).
export const THRESHOLD = 500;
const OVERSCAN = 10; // extra rows drawn above and below the viewport, so a fast scroll or a focus move does not flash empty rows

// The table's own view getter (sorted + filtered rows), memoized against the inputs that decide it: a scroll-driven re-render hits the
// cache instead of re-sorting thousands of rows every frame. Correctness never depends on the cache: any changed input recomputes
// through the getter itself, so windowing can never show a different order or a different set of rows than a plain table would.
function view(el) {
    const k = ['rows', 'columns', 'filters', 'sort', 'sortDir'], c = el.$vc;
    if (c && k.every(n => c[n] === el[n])) return c.result;
    return (el.$vc = { ...Object.fromEntries(k.map(n => [n, el[n]])), result: el.view }).result;
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

// The rows to draw, or null when this render should not window (table.js then draws every row itself): never for an expandable table (a detail row
// changes its row's height) or a host-supplied one. Sets el.$virtual for the scroll listener above. Otherwise only the rows near the viewport, plus a buffer,
// flanked by spacers. el.$rowH (32 is a first guess) is refined from the previous render's real row height. h is table.js's element-builder, passed through
// so this stays pure, like table-expand.js's h-taking functions.
function body(el, rowsAll, h) {
    const prev = el.part('body').querySelector('tr[data-pk-context]');
    if (prev) el.$rowH = prev.getBoundingClientRect().height || el.$rowH;
    if (el.expandable || el.editable || rowsAll.length <= THRESHOLD) return el.$virtual = false, null;
    if (!el.$vs) { el.$vs = 1; attach(el); }
    el.$virtual = true;
    const cols = el.list('columns'), lead = Number(el.selectable), sel = el.chosen?.() ?? idSet(el.selected);
    const s = el.part('scroll'), rowH = el.$rowH || 32, vh = s.clientHeight || 400, span = cols.length + lead;
    const start = Math.max(0, Math.floor(s.scrollTop / rowH) - OVERSCAN);
    const end = Math.min(rowsAll.length, start + Math.ceil(vh / rowH) + OVERSCAN * 2);
    const bump = (size, place) => { const td = h('td', { colspan: span }); td.style.setProperty('padding', '0'); td.style.setProperty('border', '0'); td.style.setProperty('block-size', `${size}px`); return h('tr', { 'data-spacer': place, 'aria-hidden': true }, td); };
    const drawn = rowsAll.slice(start, end).flatMap((row, j) => {
        return [tr(el, row, rowId(row, start + j, el.rowKey), sel, h)];
    });
    return [...(start > 0 ? [bump(start * rowH, 'top')] : []), ...drawn, ...(end < rowsAll.length ? [bump((rowsAll.length - end) * rowH, 'bottom')] : [])];
}

// The frame state of the table: busy flag, the empty state, the bulk bar count, the scroll frame's max height, and the foot cell spanning all `span` columns (#1020). Lives here, not in table.js, to keep that module in its gzip budget.
function frame(el, tb, span, rows) {
    tb.setAttribute('aria-busy', String(el.loading));
    if (el.maxHeight) el.style.setProperty('--pk-table-max-height', el.maxHeight); else el.style.removeProperty('--pk-table-max-height');
    el.part('foot').colSpan = span;
    el.part('empty').hidden = el.loading || rows > 0;
    const n = idSet(el.selected).size;
    el.part('bulk').hidden = n === 0; el.part('bulk-count').textContent = `${n} selected`;
}


// Issue 1019: a row object may carry tone (warning, positive, accent, critical) and indent (1 or 2); they become data-tone and data-indent on the <tr>.
const TONES = new Set(['warning', 'positive', 'accent', 'critical']);
const mark = row => ({ 'data-tone': TONES.has(row.tone) ? row.tone : null, 'data-indent': row.indent >= 1 ? (row.indent >= 2 ? 2 : 1) : null });
// One data row, shared by the plain render (table.js) and the windowed one above: a select box, then a td per column (a slotted cell where the host gave one).
const al = c => c.align ?? (c.type === 'number' ? 'end' : null);
function tr(el, row, id, sel, h) {
    const pick = h('input', { type: 'checkbox', 'data-select': id, 'aria-label': `Select row ${id}` });
    pick.checked = sel.has(id);
    return h('tr', { 'data-pk-context': id, 'data-selected': sel.has(id), 'data-clickable': el.clickable, ...mark(row), 'aria-current': el.currentRow && el.currentRow === id ? 'true' : null },
        ...(el.selectable ? [h('td', { 'data-check': true }, pick)] : []),
        ...el.list('columns').map(c => { const name = `cell-${id}-${c.key}`; return h('td', { 'data-key': c.key, 'data-label': c.label ?? c.key, 'data-align': al(c), 'data-hide-phone': c.hidePhone }, el.querySelector(`:scope > [slot="${CSS.escape(name)}"]`) ? h('slot', { name }) : String(row[c.key] ?? '')); }));
}

// The header rows (the titles, and the filter row when filterable) for table.js, which has no room for them in its gzip budget.
function head(el, k, x, lead, sel, h) {
    const box = h('input', { type: 'checkbox', 'data-select-all': true, 'aria-label': 'Select all rows' });
    box.checked = sel.checked; box.indeterminate = sel.mixed;
    const head = [h('tr', {}, ...(el.selectable ? [h('th', { 'data-check': true }, box)] : []), ...(x ? [x.head(h)] : []),
        ...k.map(c => h('th', { 'data-key': c.key, 'data-align': al(c), 'data-hide-phone': c.hidePhone, scope: 'col', 'aria-sort': c.sortable ? (el.sort === c.key ? el.sortDir : 'none') : null }, c.sortable ? h('button', { type: 'button' }, c.label ?? c.key) : (c.label ?? c.key))))];
    if (el.filterable) head.push(h('tr', { 'data-filters': true }, ...(lead ? [h('th', { colspan: lead })] : []), ...k.map(c => h('th', { 'data-hide-phone': c.hidePhone }, h('input', { type: 'search', 'data-filter': c.key, 'aria-label': `Filter ${c.label ?? c.key}`, value: el.filters[c.key] ?? '' })))));
    return head;
}

export default { view, body, frame, mark, head };
