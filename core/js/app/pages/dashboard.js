// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'dashboard' (#436, #489): tabs/widgets/sections/filters; load(key) per widget, with the page ctx.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'dashboard',
    summary: 'Tabs, widgets and filterable sections, each loaded on demand by key.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'tabs', 'widgets', 'sections', 'filters', 'empty', 'load'],
    states: ['empty'],
    useWhen: 'An overview of tiles, charts and sections a user filters, not a single record or a list to open.',
};
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-dashboard-page');
    el.config = { heading: config.heading, breadcrumb: config.breadcrumb, actions: config.actions, tabs: config.tabs, widgets: config.widgets, sections: config.sections, filters: config.filters, empty: config.empty };
    if (config.load) el.load = key => config.load(key, ctx);
    host.append(el);
    return () => el.remove();
};
