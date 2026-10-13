// Row links of <pk-table> (#366): `rowHrefTemplate` ('/orders/{id}', '#/orders/{id}') turns each row's first cell into a real <a href>, so a routed list opens a record
// the way any link does (new tab, middle click, copy address). The table imports this on demand, only when the template is set, so its own module stays inside the budget.
// A plain click on a link or on the row body navigates through the router: a cancelable, composed pk-navigate, the event pk-link reports (js/router.js mountRouter handles it);
// unhandled, the browser follows the address. A hash address is left to the browser. The table owns the links (shadow tree); the host's rows and cells are never touched.

import { sheetFor } from './element.js'; import { rowAt } from './rowset.js';

const STYLES = 'a[data-row-link]{color:var(--color-link);text-underline-offset:0.15em}a[data-row-link]:hover{color:var(--color-link-hover)}a[data-row-link]:focus-visible{outline:var(--focus-ring)}';
let sheet;

// The address of one row: every {name} is the row's field of that name, URL-encoded ({id} is the row's id); the result must be a same-site path or a hash, else null.
export const href = (tpl, row, id) => {
    const u = String(tpl).replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(k === 'id' ? id : row?.[k] ?? ''));
    return /^(\/(?![/\\])|#)/.test(u) && !/[\x00-\x20\x7f]/.test(u) ? u : null;
};

// A plain click on a link goes through the router; a click on the row body (not on a control) is a click on its link. A modified click stays the browser's.
export function click(table, e) {
    const t = e.target, a = t.closest?.('a[data-row-link]'), tr = t.closest?.('tr[data-pk-context]');
    if (!a) {
        const go = !table.clickable && tr && !t.closest('input,button,a,select,label') && tr.querySelector('a[data-row-link]');
        return go ? (go.click(), true) : false;
    }
    const to = a.getAttribute('href');
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || to[0] !== '/') return false;
    e.preventDefault();
    if (table.emit('pk-navigate', { to, href: to })) table.ownerDocument.defaultView.location.assign(to);
    return true;
}

// After each render: the first cell of every drawn row (a windowed table draws only the rows near the viewport) holds its link; a cell the host filled through a slot keeps its own content.
export function after(table) {
    const tpl = table.rowHrefTemplate, root = table.shadowRoot;
    if (!tpl) return;
    sheet ??= sheetFor(STYLES);
    if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    const view = table.view, ids = table.ids();
    for (const tr of table.part('body').querySelectorAll('tr[data-pk-context]')) {
        const td = tr.querySelector('td[data-key]'), url = td && !td.querySelector('slot') && href(tpl, rowAt(view, ids, tr.dataset.pkContext), tr.dataset.pkContext);
        if (td && !url && !td.querySelector('slot')) table.warnOnce('rowHrefTemplate', `rowHrefTemplate "${tpl}" must be a path ("/orders/{id}") or a hash ("#/orders/{id}")`);
        if (!url) continue;
        const a = table.ownerDocument.createElement('a');
        a.setAttribute('href', url); a.setAttribute('data-row-link', '');
        a.append(...td.childNodes); td.append(a);
        tr.setAttribute('data-clickable', '');
    }
}
