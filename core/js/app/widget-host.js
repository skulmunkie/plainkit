// The import path for module definitions, shared by the module host and its internal dashboard service (#494, design 2026-10-13-module-dashboard-design.md, section 8).
// Not public: the host hands `widgets` to page factories as the non-enumerable ctx._widgets, and only the dashboard page type reads it.
//   widgets.entries(surface)  -> Promise of the frozen [{ id, contributes }] of the allow-listed modules that contribute to the surface (config data, no module code runs)
//   widgets.def(id)           -> Promise of that module's DEFINITION (no mount, no nav): allow-list, access check, retry/timeout, re-validation and id check as for a visit; one import per module
// The part only a dashboard needs (the allow-list and single-flight guard of def) is the lazy chunk pages/svc-widgets.js, so a page without widgets never loads it.
import { defineModule, loadChunk } from './module.js';
import { loadWithRetry } from './boundary.js';

export function createLoader({ allow, defs, retry, access, dead }) {
    const importDef = async (id, entry, alive) => {
        const mod = await loadWithRetry(entry.load, { ...retry, alive });
        const def = defineModule(mod?.default ?? mod);
        if (def.id !== id) throw new Error(`the module loaded for "${id}" says its id is "${def.id}"`);
        defs.set(id, def);
        return def;
    };
    const deps = { allow, defs, access, importDef, dead };
    const widgets = Object.freeze({
        entries: surface => loadChunk('svc-widgets').then(m => m.entries(deps, surface)),
        def: id => loadChunk('svc-widgets').then(m => m.def(deps, id)),
    });
    return { importDef, widgets };
}
