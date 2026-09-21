// Lazy parts of <pk-table>: expandable rows (the toggle column and the detail rows) and the keyboard for clickable rows. The table imports this on
// demand, only when `expandable` or `clickable` is set, so its own module stays inside the per-element budget. The table owns everything drawn here (shadow tree); the detail content is host-provided
// light DOM in a `detail-<rowId>` slot, and expanding only renders that slot, it never moves or edits the host's nodes.

import { sheetFor } from './element.js';

// The styles of what this module draws, adopted by the table's shadow root the first time a row is drawn (the table's own css knows nothing of them).
const STYLES = ('[data-expand]{inline-size:var(--space-8);text-align:center}[data-expand] button{all:unset;display:inline-block;padding:var(--space-1) var(--space-2);cursor:pointer}[data-expand] button:focus-visible{outline:var(--focus-ring)}@media (max-width:640px){[data-expand] button{display:inline-flex;align-items:center;min-block-size:var(--touch-target);min-inline-size:var(--touch-target)}:host([cards]) tr[data-detail] td{display:block;text-align:start}:host([cards]) td[data-expand]:empty{display:none}}');
let sheet;

// The expanded ids after one row opens or closes (ids are strings; the host may have given numbers).
export const toggled = (ids, id, open) => [...ids.map(String).filter(x => x !== id), ...(open ? [id] : [])];

// A row can expand when the host gave it detail content.
export const hasDetail = (table, id) => [...table.children].some(c => c.slot === `detail-${id}`);

// The header cell over the toggle column: empty, named for assistive technology.
export const head = h => h('th', { 'data-expand': true, scope: 'col' }, h('span', { class: 'sr' }, 'Details'));

// The row's toggle cell goes in after the checkbox cell; an expandable row is followed by its detail row (hidden while collapsed, so
// aria-controls always points at a real element). `span` is the column count the detail cell covers.
export function rows(table, tr, id, i, span, h) {
    const has = hasDetail(table, id), open = has && table.expanded.map(String).includes(id);
    const button = has && h('button', { type: 'button', 'data-expand-id': id, 'aria-expanded': String(open), 'aria-controls': `pk-d${i}`, 'aria-label': `Details for row ${id}` }, open ? '▾' : '▸');
    tr.insertBefore(h('td', { 'data-expand': true }, button || ''), tr.children[Number(table.selectable)] ?? null);
    return has ? [tr, h('tr', { id: `pk-d${i}`, 'data-detail': true, hidden: !open }, h('td', { colspan: span }, h('slot', { name: `detail-${id}` })))] : [tr];
}

// A click on content the host put in a cell slot: it is light DOM, so closest('tr') cannot reach the row from the target; the composed path can. Only a click on non-interactive content is a row click
// (a slotted button, link or field keeps its click). Clicks inside the shadow tree stay with the table's own handler.
export function slotted(table, e) {
    const p = table.clickable && !table.shadowRoot.contains(e.target) ? e.composedPath?.() ?? [] : [], i = p.findIndex(n => n.matches?.('tbody tr[data-id]'));
    if (i < 0) return false;
    if (!p.slice(0, i).some(n => n.matches?.('input,button,a,select,label'))) table.emit('pk-row-click', { id: p[i].dataset.id, row: table.view[table.ids().indexOf(p[i].dataset.id)] });
    return true;
}

// A click on a toggle: the element owns the change until the event, then the host owns it (STANDARDS: two-way values).
export function click(table, e) {
    const b = e.target.closest?.('button[data-expand-id]');
    if (!b) return slotted(table, e);
    const id = b.dataset.expandId, open = b.getAttribute('aria-expanded') !== 'true';
    table.expanded = toggled(table.expanded, id, open);
    table.$f = id;
    table.emit('pk-row-expand', { id, index: table.ids().indexOf(id), expanded: open });
    return true;
}

// Keyboard for clickable rows: each row is a tab stop (the checkbox, button and link cells inside it keep theirs), and Enter or Space on the row
// itself is a click on it, so pk-row-click has one path. A key pressed on a control inside the row is left to that control.
export const activates = (e, table) => table.clickable && (e.key === 'Enter' || e.key === ' ') && !!e.target.matches?.('tbody tr[data-clickable]');

// After each render: make clickable rows focusable, adopt the styles, and put the keyboard focus back on the toggle that was used (the render replaced it).
export function after(table) {
    const root = table.shadowRoot, sheets = root.adoptedStyleSheets;
    if (!table.$k) { table.$k = 1; root.addEventListener('keydown', e => { if (activates(e, table)) { e.preventDefault(); e.target.click(); } }); }
    if (table.clickable) for (const tr of table.part('body').querySelectorAll('tr[data-clickable]')) tr.tabIndex = 0;
    if (table.expandable) {
        sheet ??= sheetFor(STYLES);
        if (!sheets.includes(sheet)) root.adoptedStyleSheets = [...sheets, sheet];
    }
    if (table.$f === undefined) return;
    table.part('body').querySelector(`button[data-expand-id="${CSS.escape(table.$f)}"]`)?.focus();
    table.$f = undefined;
}
