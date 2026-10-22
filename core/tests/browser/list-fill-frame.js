// The page the full-height list browser case opens in an iframe of a chosen width: pk-app-shell[contain] around a pk-list-page (pinned header, title bar, before-list alert,
// selectable table, bulk bar, pager), optionally inside a busy <pk-loading-overlay fill>. `?overlay=1` adds the overlay. The frame script gives the shell the viewport height through CSSOM (CSP: no style attribute).
import { loadElements } from '../../js/loader.js';

const ROWS = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const q = new URLSearchParams(location.search), overlay = q.has('overlay'), wrap = q.get('wrap'), tall = q.has('tall'), bar = q.has('bar');
const mk = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };

if (q.get('theme')) document.documentElement.setAttribute('data-theme', q.get('theme'));
const shell = mk('pk-app-shell', { contain: '' });
shell.append(mk('span', { slot: 'header' }, 'Orders'));
const list = mk('pk-list-page');
if (tall) {
    // ?tall=1: a before-list region far taller than the window, wrapped the way the Blazor PkListPage draws it (<span slot="before-list" class="u-contents">, display: contents !important) (#1726).
    const w = mk('span', { slot: 'before-list', class: 'u-contents' }), box = mk('div', { id: 'tall' });
    for (let i = 0; i < 24; i++) box.append(mk('p', {}, 'Summary line ' + (i + 1) + ': totals, tax and the notes the reader should see before the list.'));
    w.append(box); list.append(w);
} else list.append(mk('pk-alert', { slot: 'before-list', kind: 'info' }, 'Prices include tax.'));
list.config = {
    heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '#' }, { label: 'Orders' }], stickyHeader: true, selectable: true, pageSize: 50,
    ...(bar ? { toolbarInHeader: true, searchable: true, actions: [{ label: 'New order' }], filters: [{ key: 'kind', type: 'select', label: 'Kind', options: ['a', 'b'] }] } : {}),
    columns: [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }], bulkActions: [{ id: 'archive', label: 'Archive' }],
};
list.load = () => ({ rows: ROWS, total: 200 });
let top = list;
if (overlay) { const o = mk('pk-loading-overlay', { fill: '', busy: '', label: 'Saving' }); o.append(list); top = o; }
// wrap=main: the <main id="pk-main"> that the Blazor PkApp draws around the page (a block, not a flex column) (#1716).
if (wrap) { const w = mk(wrap); w.append(top); top = w; }
shell.append(top);
document.body.append(shell);
shell.style.blockSize = `${innerHeight}px`;
loadElements(document);
