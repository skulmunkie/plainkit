// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
export default (host, config, ctx) => {
    if (typeof config?.mount !== 'function') throw new TypeError("page type 'custom' needs config.mount(host, ctx)");
    return config.mount(host, ctx);
};
