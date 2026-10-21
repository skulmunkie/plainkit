// The page the full-height list browser case opens in an iframe of a chosen width: pk-app-shell[contain] around a pk-list-page (pinned header, title bar, before-list alert,
// selectable table, bulk bar, pager), optionally inside a busy <pk-loading-overlay fill>. `?overlay=1` adds the overlay. The frame script gives the shell the viewport height through CSSOM (CSP: no style attribute).
import { loadElements } from '../../js/loader.js';

const ROWS = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const overlay = new URLSearchParams(location.search).has('overlay');
const mk = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };

const shell = mk('pk-app-shell', { contain: '' });
shell.append(mk('span', { slot: 'header' }, 'Orders'));
const list = mk('pk-list-page');
list.append(mk('pk-alert', { slot: 'before-list', kind: 'info' }, 'Prices include tax.'));
list.config = {
    heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '#' }, { label: 'Orders' }], stickyHeader: true, selectable: true, pageSize: 50,
    columns: [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }], bulkActions: [{ id: 'archive', label: 'Archive' }],
};
list.load = () => ({ rows: ROWS, total: 200 });
if (overlay) { const o = mk('pk-loading-overlay', { fill: '', busy: '', label: 'Saving' }); o.append(list); shell.append(o); } else shell.append(list);
document.body.append(shell);
shell.style.blockSize = `${innerHeight}px`;
loadElements(document);
