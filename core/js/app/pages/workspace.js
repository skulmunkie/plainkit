// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'workspace' (#353): <pk-workspace-page>; config: panes, labels, fill, mount(panes, ctx) (callback: cleanup | { destroy() }).
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'workspace',
    summary: 'Arbitrary panes mounted by the app inside a workspace shell.',
    configKeys: ['panes', 'labels', 'fill', 'mount'],
    states: [],
    useWhen: 'A layout of multiple custom panes that does not fit list/record/dashboard but still deserves the workspace chrome.',
};
import { definePage } from '../../page-define.js';
export default definePage({
    tag: 'pk-workspace-page',
    data: ({ mount, fill, ...data }) => data,
    wire: (el, { mount, fill }, ctx) => { if (fill) el.fill = true; if (mount) el.mount = panes => mount(panes, ctx); },
});
