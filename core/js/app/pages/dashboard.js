// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'dashboard' (#436, #489): tabs/widgets/sections/filters; load(key) per widget, with the page ctx.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-dashboard-page');
    el.config = { tabs: config.tabs, widgets: config.widgets, sections: config.sections, filters: config.filters, empty: config.empty };
    if (config.load) el.load = key => config.load(key, ctx);
    host.append(el);
    return () => el.remove();
};
