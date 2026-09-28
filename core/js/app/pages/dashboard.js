// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'dashboard' (#436): tiles/sections; load(key) per tile.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-dashboard-page');
    el.config = { tiles: config.tiles, sections: config.sections };
    if (config.load) el.load = key => config.load(key, ctx);
    host.append(el);
    return () => el.remove();
};
