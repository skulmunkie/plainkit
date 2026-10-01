// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'master-detail' (#353): <pk-master-detail-page>. config: { list, backLabel, none, label, param, fill, rowHref(row), listHref, load(query, ctx),
// mountDetail(pane, id, ctx) }. The record shown is ctx.route.params[param] (default 'id'); a row click and Back navigate through ctx.navigate.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'master-detail',
    summary: 'A list pane plus a detail pane for the selected record, on one route.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'list', 'backLabel', 'none', 'label', 'param', 'fill', 'rowHref', 'listHref', 'load', 'mountDetail'],
    states: ['none'],
    useWhen: 'A record opened beside its list rather than on its own page, such as an inbox.',
};
import { mountTitled } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-master-detail-page');
    const { list, backLabel, none, label, param = 'id', rowHref, listHref, load, mountDetail, fill } = config;
    el.config = { heading: config.heading, breadcrumb: config.breadcrumb, actions: config.actions, list, backLabel, none, label };
    const id = ctx.route?.params?.[param];
    if (id) el.recordId = String(id);
    if (fill) el.fill = true;
    if (load) el.load = query => load(query, ctx);
    if (rowHref) el.open = row => ctx.navigate(rowHref(row));
    if (listHref) el.close = () => ctx.navigate(listHref);
    if (mountDetail) el.mountDetail = (pane, rid) => mountDetail(pane, rid, ctx);
    return mountTitled(host, el, config.heading);
};
