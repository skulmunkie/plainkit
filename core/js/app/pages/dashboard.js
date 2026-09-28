// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'dashboard' (#436, #489): tabs/widgets/sections/filters; load(key) per widget, with the page ctx.
// A route with no config of its own ({ page: 'dashboard' }) is composed from the modules' dashboardTabs/dashboard (#494, js/app/dashboard.js, loaded only then).
const mount = (host, config, ctx, composed) => {
    const el = host.ownerDocument.createElement('pk-dashboard-page');
    const { tabs, widgets } = composed?.config ?? config;
    const load = composed?.load ?? config.load;
    el.config = { tabs, widgets, sections: config.sections, filters: config.filters, empty: config.empty };
    if (load) el.load = function (key) { return load.call(this, key, ctx); };
    host.append(el);
    return () => el.remove();
};

export default (host, config = {}, ctx) => {
    if (config.widgets == null && config.load == null && config.tabs == null && ctx?.modules) {
        return import('../dashboard.js').then(async d => mount(host, config, ctx, d.composeDashboard(await ctx.modules(), ctx)));
    }
    return mount(host, config, ctx);
};
