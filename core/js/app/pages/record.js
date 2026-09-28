// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'record' (#353): <pk-record-page>; config: { fields, sidebar, heading, saveLabel, editable, mode, idParam } as data, and the callbacks
// load(id, ctx) -> record and save(values, ctx) -> void | updated values (reject with { errors: { field: message } } for inline errors).
// The record id is the route param named config.idParam (default 'id'); with none the page is a new record.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-record-page');
    const { load, save, mode, idParam = 'id', ...data } = config;
    data.id = data.id ?? ctx?.route?.params?.[idParam];
    el.config = data;
    if (mode) el.mode = mode;
    if (load) el.load = id => load(id, ctx);
    if (save) el.save = values => save(values, ctx);
    host.append(el);
    return () => el.remove();
};
