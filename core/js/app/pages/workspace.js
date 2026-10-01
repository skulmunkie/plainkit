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
import { mountTitled } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-workspace-page');
    const { mount, fill, ...data } = config;
    el.config = data;
    if (fill) el.fill = true;
    if (mount) el.mount = panes => mount(panes, ctx);
    return mountTitled(host, el, config.heading);
};
