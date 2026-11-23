// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'settings' (#351): <pk-settings-page> (sectioned fields, a sticky Save/Discard bar). config: { sections, nav, values, save(values, ctx) } - save
// is a callback property, business logic never JSON data.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'settings',
    summary: 'Sectioned fields with a sticky Save/Discard bar and a section nav from three sections.',
    configKeys: ['heading', 'breadcrumb', 'actions', 'badges', 'newAction', 'actionsCollapse', 'actionsOverflow', 'overflowLabel', 'homeHref', 'homeLabel', 'homeIcon', 'sections', 'nav', 'values', 'save'],
    states: [],
    useWhen: 'App or account configuration organised into sections, saved as a whole.',
};
import { titleBarKeys } from '../../page-shell.js';
import { definePage } from '../../page-define.js';
export default definePage({
    tag: 'pk-settings-page',
    data: c => ({ heading: c.heading, breadcrumb: c.breadcrumb, ...titleBarKeys(c), actions: c.actions, sections: c.sections, nav: c.nav }),
    wire: (el, c, ctx) => { if (c.values !== undefined) el.values = c.values; if (c.save) el.save = values => c.save(values, ctx); },
});
