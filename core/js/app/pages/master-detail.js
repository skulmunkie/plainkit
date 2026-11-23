// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'master-detail' (#353): <pk-master-detail-page>. config: { list, backLabel, none, label, param, fill, rowHref(row), listHref, load(query, ctx),
// mountDetail(pane, id, ctx) }. The record shown is ctx.route.params[param] (default 'id'); a row click and Back navigate through ctx.navigate.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'master-detail',
    summary: 'A list pane plus a detail pane for the selected record, on one route.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'list', 'backLabel', 'none', 'label', 'param', 'fill', 'rowHref', 'listHref', 'load', 'mountDetail'],
    states: ['none'],
    useWhen: 'A record opened beside its list on one route, such as an inbox. Not the default: a list and its record are usually two routes (the list and record page types).',
};
import { titleBarKeys } from '../../page-shell.js';
import { definePage, withSignal } from '../../page-define.js';
export default definePage({
    tag: 'pk-master-detail-page',
    data: c => ({ heading: c.heading, breadcrumb: c.breadcrumb, ...titleBarKeys(c), actions: c.actions, list: c.list, backLabel: c.backLabel, none: c.none, label: c.label }),
    wire: (el, { param = 'id', rowHref, listHref, load, mountDetail, fill }, ctx) => {
        const id = ctx.route?.params?.[param];
        if (id) el.recordId = String(id); if (fill) el.fill = true;
        if (load) el.load = withSignal(ctx, (query, signal) => load(query, ctx, signal));
        if (rowHref) el.open = row => ctx.navigate(rowHref(row));
        if (listHref) el.close = () => ctx.navigate(listHref);
        if (mountDetail) el.mountDetail = (pane, rid) => mountDetail(pane, rid, ctx);
    },
});
