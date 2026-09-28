// A dashboard composed from modules (#494, spec section 5 of the dashboard design): every module may declare `dashboardTabs: [{ id, label }]` and `dashboard: array | (ctx) => array` of
// widget entries { key, tab?, label, kind, empty?, load? }, the way it declares `nav` (js/app/nav.js). A route { page: 'dashboard' } with no config of its own gets the merge.
// A widget's `load` is author-written JS in the module's file (defineModule is source, never a wire payload); it is taken OUT of the entry into one key -> loader map, so
// pk-dashboard-page still gets what it always did: config.widgets as pure JSON and ONE load(key) callback (called with the page element as `this`, like any load).
//
// The first module to declare a tab id owns its label; a later one only adds widgets to it. A widget key must be unique across modules (an error naming both). A `dashboard` function
// that throws is logged once and contributes nothing; a bad entry is logged and skipped; a size over MAX_WIDGETS / MAX_TABS is logged once with the advice, never fatal.
import { createLogger } from '../log.js';

export const MAX_WIDGETS = 40;
export const MAX_TABS = 8;
const log = createLogger('app');
const told = new Set();
const once = (key, msg, e) => { if (!told.has(key)) { told.add(key); log.warn(msg, e); } };

// ctx.modules() (host.js): the definitions of every module the user may open, in allow-list order, loading the ones not loaded yet (a failed load is logged and left out).
export async function allModules({ allow, defs, access, define, log }) {
    const open = { path: '/', params: {}, query: {} };
    for (const [id, entry] of allow) {
        if (defs.has(id) || access(entry, null, open) !== true) continue;
        try {
            const def = define(await Promise.resolve().then(entry.load).then(m => m?.default ?? m));
            if (def.id !== id) throw new Error(`the module loaded for "${id}" says its id is "${def.id}"`);
            defs.set(id, def);
        } catch (e) {
            log.warn(`could not load the module "${id}" for the dashboard`, e);
        }
    }
    return [...allow].filter(([id, entry]) => defs.has(id) && access(entry, defs.get(id), open) === true).map(([id]) => defs.get(id));
}

// The module's { tabs, widgets } as declared (arrays, [] when absent or when its function threw). Pure apart from the log.
export function dashboardOf(def, ctx) {
    let widgets = [];
    try {
        widgets = typeof def.dashboard === 'function' ? def.dashboard(ctx) : def.dashboard ?? [];
    } catch (e) {
        if (!told.has(`throw:${def.id}`)) { told.add(`throw:${def.id}`); log.error(`the dashboard of "${def.id}" threw, it adds no widgets`, e); }
    }
    const ok = x => x && typeof x.key === 'string' && typeof x.label === 'string' && typeof x.kind === 'string';
    if (!Array.isArray(widgets)) widgets = [];
    for (const w of widgets) if (!ok(w)) log.error(`a dashboard widget of "${def.id}" needs a string key, label and kind, skipped`, w);
    const tabs = Array.isArray(def.dashboardTabs) ? def.dashboardTabs.filter(t => t && typeof t.id === 'string' && typeof t.label === 'string') : [];
    return { tabs, widgets: widgets.filter(ok) };
}

// Merges the modules' shares: { config: { tabs, widgets } (pure JSON), load(key) } . `load` is the one dispatcher; an unknown key rejects, so the widget's own card shows the error.
export function composeDashboard(defs, ctx) {
    const tabs = new Map(), widgets = [], loaders = new Map(), owner = new Map();
    for (const def of defs) {
        const mine = dashboardOf(def, ctx);
        for (const t of mine.tabs) if (!tabs.has(t.id)) tabs.set(t.id, { id: t.id, label: t.label });
        for (const w of mine.widgets) {
            if (owner.has(w.key)) throw new Error(`dashboard widget "${w.key}" is declared by both "${owner.get(w.key)}" and "${def.id}": keys must be unique across modules`);
            owner.set(w.key, def.id);
            const { load, ...json } = w;
            if (typeof load === 'function') loaders.set(w.key, load);
            widgets.push(json);
        }
    }
    for (const w of widgets) if (w.tab != null && !tabs.has(w.tab)) { once(`tab:${w.tab}`, `dashboard widget "${w.key}" is in the tab "${w.tab}" that no module declares in dashboardTabs; it is shown under that id`); tabs.set(w.tab, { id: w.tab, label: w.tab }); }
    if (widgets.length > MAX_WIDGETS || tabs.size > MAX_TABS) once('size', `the composed dashboard has ${widgets.length} widgets in ${tabs.size} tabs: a dashboard is a few key figures, put detail in a list page`);
    const config = { widgets };
    if (tabs.size) config.tabs = [...tabs.values()];
    return {
        config,
        load(key) {
            const fn = loaders.get(key);
            if (!fn) return Promise.reject(new Error(`no module provides the widget "${key}"`));
            return fn.call(this, key);
        },
    };
}
