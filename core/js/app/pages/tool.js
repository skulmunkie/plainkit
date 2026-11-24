// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'tool' (#351): <pk-tool-page> (input fields, Run, an outcome). config: { heading, input, outcome, runLabel, run(values, ctx) }, heading = the page's h1 (focused after navigation; none drawn when unset) - run is a callback
// property, business logic never JSON data.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'tool',
    summary: 'Input fields, a Run action and an outcome panel.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'variant', 'wrapTitle', 'input', 'outcome', 'runLabel', 'run'],
    states: [],
    useWhen: 'A single-purpose utility: fill inputs, run, see a result.',
};
import { titleBarKeys } from '../../page-shell.js';
import { definePage } from '../../page-define.js';
export default definePage({
    tag: 'pk-tool-page',
    data: c => ({ heading: c.heading, breadcrumb: c.breadcrumb, actions: c.actions, ...titleBarKeys(c), input: c.input, outcome: c.outcome }),
    wire: (el, c, ctx) => { if (c.runLabel !== undefined) el.runLabel = c.runLabel; if (c.run) el.run = values => c.run(values, ctx); },
});
