// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'tool' (#351): <pk-tool-page> (input fields, Run, an outcome). config: { input, outcome, runLabel, run(values, ctx) } - run is a callback
// property, business logic never JSON data.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'tool',
    summary: 'Input fields, a Run action and an outcome panel.',
    configKeys: ['input', 'outcome', 'runLabel', 'run'],
    states: [],
    useWhen: 'A single-purpose utility: fill inputs, run, see a result.',
};
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-tool-page');
    el.config = { input: config.input, outcome: config.outcome };
    if (config.runLabel !== undefined) el.runLabel = config.runLabel;
    if (config.run) el.run = values => config.run(values, ctx);
    host.append(el);
    return () => el.remove();
};
