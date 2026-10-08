// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'list' (#352): <pk-list-page> (filterable, sortable, paginated pk-table). config: { columns, filters, actions, empty, pageSize,
// load(query)->{rows,total}, rowHref(row), selectable, rowKey, bulkActions, onSelect(detail, ctx), onBulk(detail, ctx) } - load/rowHref are callback properties; rowHref is routed through ctx.navigate, not the element.
// With selectable, onSelect gets the pk-select detail { selected, scope, query } and each bulkActions entry ({ id, label, variant? }) calls onBulk with { action, selected, scope, query } (return a promise: the list reloads, selection cleared, when it settles).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'list',
    summary: 'A filterable, sortable, paginated table with row actions.',
    configKeys: ['heading', 'breadcrumb', 'columns', 'filters', 'actions', 'empty', 'pageSize', 'load', 'rowHref', 'selectable', 'rowKey', 'bulkActions', 'onSelect', 'onBulk'],
    states: ['empty'],
    useWhen: 'A collection the user filters, sorts and opens: table plus toolbar plus row actions.',
};
import { mountTitled } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-list-page');
    el.config = { heading: config.heading, breadcrumb: config.breadcrumb, columns: config.columns, filters: config.filters, actions: config.actions, empty: config.empty, pageSize: config.pageSize, selectable: config.selectable, rowKey: config.rowKey, bulkActions: config.bulkActions };
    if (config.load) el.load = query => config.load(query, ctx);
    if (config.rowHref) el.rowHref = row => ctx.navigate(config.rowHref(row));
    if (config.onSelect) el.addEventListener('pk-select', e => config.onSelect(e.detail, ctx));
    // The bulk action may return a promise; when it settles the selection is cleared and the list reloads, so the result shows.
    if (config.onBulk) el.addEventListener('pk-bulk', async e => { await config.onBulk(e.detail, ctx); const table = el.part?.('table'); if (table) { table.selected = []; table.selectScope = 'page'; table.refresh(); } });
    return mountTitled(host, el, config.heading);
};
