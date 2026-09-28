// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'tool' (#351): <pk-tool-page> (input fields, Run, an outcome). config: { input, outcome, runLabel, run(values, ctx) } - run is a callback
// property, business logic never JSON data.
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-tool-page');
    el.config = { input: config.input, outcome: config.outcome };
    if (config.runLabel !== undefined) el.runLabel = config.runLabel;
    if (config.run) el.run = values => config.run(values, ctx);
    host.append(el);
    return () => el.remove();
};
