// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'sections' (#2010): <pk-sections-page> (title bar, docked section tabs, a two-column layout of your panels). config: { sections: [{ id, label, count?, visible? }], section, tabParam,
// sidebarFirst, sidebarTwoUp, heading, breadcrumb, actions, ... } as data; render(ctx) -> { [id]: Node | { main?: Node, side?: Node } } is the one callback: it returns the panels.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'sections',
    summary: 'A read-mostly record page: title bar, docked section tabs, a two-column layout of your panels. No load or save.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'sections', 'section', 'tabParam', 'sidebarFirst', 'sidebarTwoUp', 'render'],
    states: [],
    useWhen: 'Showing one record (or any subject) in tabbed sections with a primary action and a menu, where nothing is loaded or saved by the page itself.',
};
import { mountTitled, titleBarKeys } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-sections-page');
    const { render, section, ...data } = config;
    el.config = { ...data, ...titleBarKeys(config) };
    if (section) el.section = section;
    for (const [id, panel] of Object.entries(typeof render === 'function' ? render(ctx) ?? {} : {})) {
        const parts = panel instanceof host.ownerDocument.defaultView.Node ? { main: panel } : panel;
        if (parts.main) { parts.main.slot = 'section-' + id; el.append(parts.main); }
        if (parts.side) { parts.side.slot = 'side-' + id; el.append(parts.side); }
    }
    return mountTitled(host, el, config.heading);
};
