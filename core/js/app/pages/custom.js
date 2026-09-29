// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// PAGE_TYPE: a small descriptor read at build time by core/tools/audit/data.mjs (design 2026-09-28-conformance-audit-cli-design.md
// section 3.2), for the P3/P7/P8 audit rules and the skills' page-type chooser. Not used at runtime.
export const PAGE_TYPE = {
    id: 'custom',
    summary: 'Escape hatch: mounts arbitrary DOM through config.mount(host, ctx).',
    configKeys: ['mount'],
    states: [],
    useWhen: 'A view no built-in page type fits; every real use is a candidate for a new page type (file under #336 or #346).',
};
export default (host, config, ctx) => {
    if (typeof config?.mount !== 'function') throw new TypeError("page type 'custom' needs config.mount(host, ctx)");
    return config.mount(host, ctx);
};
