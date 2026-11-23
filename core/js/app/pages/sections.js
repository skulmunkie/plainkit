// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'sections' (#2010): <pk-sections-page> (title bar, docked section tabs, a two-column layout of your panels). config: { sections: [{ id, label, count?, visible?, side? }], section, tabParam, tabsFrom, sticky, stickyFrom,
// sidebarFirst, sidebarTwoUp, heading, breadcrumb, actions, ... } as data; render(ctx) -> { [id]: Node | { main?: Node, side?: Node } } is the one callback: it returns the panels.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'sections',
    summary: 'A read-mostly record page: title bar, docked section tabs, a two-column layout of your panels. No load or save.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'sections', 'section', 'tabParam', 'sidebarFirst', 'sidebarTwoUp', 'tabsFrom', 'sticky', 'stickyFrom', 'render'],
    states: [],
    useWhen: 'Showing one record (or any subject) in tabbed sections with a primary action and a menu, where nothing is loaded or saved by the page itself.',
};
import { titleBarKeys } from '../../page-shell.js';
import { definePage } from '../../page-define.js';
export default definePage({
    tag: 'pk-sections-page',
    data: ({ render, section, ...data }) => ({ ...data, ...titleBarKeys(data) }),
    wire: (el, { render, section }, ctx, host) => {
        if (section) el.section = section;
        for (const [id, panel] of Object.entries(typeof render === 'function' ? render(ctx) ?? {} : {})) {
            const parts = panel instanceof host.ownerDocument.defaultView.Node ? { main: panel } : panel;
            for (const [k, p] of [['main', 'section-'], ['side', 'side-']]) if (parts[k]) { parts[k].slot = p + id; el.append(parts[k]); }
        }
    },
});
