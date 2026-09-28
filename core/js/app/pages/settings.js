// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'settings' (#351): <pk-settings-page> (sectioned fields, a sticky Save/Discard bar). config: { sections, values, save(values, ctx) } - save
// is a callback property, business logic never JSON data.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-settings-page');
    el.config = { sections: config.sections };
    if (config.values !== undefined) el.values = config.values;
    if (config.save) el.save = values => config.save(values, ctx);
    host.append(el);
    return () => el.remove();
};
