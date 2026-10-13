// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'dashboard' (#436, #489): tabs/widgets/sections/filters; load(key) per widget, with the page ctx.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'dashboard',
    summary: 'Tabs, widgets and filterable sections, each loaded on demand by key.',
    configKeys: ['surface', 'heading', 'breadcrumb', 'actions', 'tabs', 'widgets', 'sections', 'filters', 'empty', 'load'],
    states: ['empty'],
    useWhen: 'An overview of tiles, charts and sections a user filters, not a single record or a list to open.',
};
import { mountTitled } from '../../page-shell.js'; import { loadChunk } from '../module.js';
// The element and its title; `mk(el)` answers the load callback (it may read el.context). A route with a `surface` composes from modules in a lazy chunk (#494), so other dashboards never pay for it.
export const build = (host, config, ctx, mk) => {
    const el = host.ownerDocument.createElement('pk-dashboard-page'); el.config = { heading: config.heading, breadcrumb: config.breadcrumb, actions: config.actions, tabs: config.tabs, ...(config.tab && { tab: config.tab }), widgets: config.widgets, sections: config.sections, filters: config.filters, ...(config.values && { values: config.values }), empty: config.empty }; if (config.load || mk) el.load = mk ? mk(el) : key => config.load(key, ctx);
    return mountTitled(host, el, config.heading);
};
export default (host, config = {}, ctx) => (config.surface ? loadChunk('dashboard-modules').then(m => m.page(host, config, ctx)) : build(host, config, ctx));
