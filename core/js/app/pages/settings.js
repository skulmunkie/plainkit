// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'settings' (#351): <pk-settings-page> (sectioned fields, a sticky Save/Discard bar). config: { sections, values, save(values, ctx) } - save
// is a callback property, business logic never JSON data.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'settings',
    summary: 'Sectioned fields with a sticky Save/Discard bar.',
    configKeys: ['sections', 'values', 'save'],
    states: [],
    useWhen: 'App or account configuration organised into sections, saved as a whole.',
};
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-settings-page');
    el.config = { sections: config.sections };
    if (config.values !== undefined) el.values = config.values;
    if (config.save) el.save = values => config.save(values, ctx);
    host.append(el);
    return () => el.remove();
};
