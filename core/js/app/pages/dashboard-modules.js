// A dashboard route with a `surface` (#494, design 2026-10-13-module-dashboard-design.md): composes its tabs and widgets from the metadata modules contribute on their config entries
// (dashboard-compose.js, pure) and loads each widget on demand through the host service ctx._widgets (js/app/widget-host.js). A lazy chunk behind pages/dashboard.js; no module code runs
// until a widget of a visible tab starts. setup(config, ctx) -> { config, load(key, context) }. Each widget run has its own AbortController chained to ctx.signal (a rerun or leaving aborts it).
// A failure shows the generic boundary text (failureText), the real error goes to the log. A widget gets a subset of the module ctx (id, log, auth, settings, signal, href): mount() never runs.
import { createLogger } from '../../log.js';
import { BOUNDARY_FAILED_TEXT, failureText } from '../boundary.js';
import { compose } from './dashboard-compose.js';
import { build } from './dashboard.js';
import { restore, wire } from './dashboard-state.js';

export async function setup(config, ctx) {
    const svc = ctx._widgets;
    if (!svc) throw new TypeError('dashboard: a `surface` needs the app module host (mountApp or createModuleHost)');
    const entries = await svc.entries(config.surface);
    const log = createLogger('app:dashboard');
    const allowed = check => { try { const r = check(); return r === true || r?.allow === true; } catch (e) { log.error('can() threw: denied', e); return false; } };
    const own = (entry, c) => !c.can || allowed(() => c.can({ auth: ctx.auth, id: entry.id, route: ctx.route }));
    const { tabs, widgets } = compose(entries, { surface: config.surface, tabs: config.tabs, filters: config.filters }, { allow: own });
    const byId = new Map(widgets.map(w => [w.id, w]));
    const runs = new Map();
    const load = async (id, context) => {
        const w = byId.get(id);
        if (!w) throw new Error(`dashboard: unknown widget "${id}"`);
        runs.get(id)?.abort();
        const ac = new AbortController();
        runs.set(id, ac);
        const stop = () => ac.abort();
        if (ctx.signal.aborted) stop();
        ctx.signal.addEventListener('abort', stop, { once: true });
        const lg = createLogger(`app:${w.module}`);
        try {
            const def = await svc.def(w.module);
            // The module's own `can` is only known now: a denial withdraws the card (null), one layout shift; apps that mind put the check in the entry `can`.
            if (def.can && !allowed(() => def.can({ auth: ctx.auth, id: w.module, route: ctx.route }))) return null;
            const widget = def.widgets?.[w.key];
            if (!widget) throw new Error(`the module "${w.module}" has no widgets.${w.key}, but its config entry contributes it`);
            return await widget.load({ context: { ...context }, signal: ac.signal, ctx: { id: w.module, log: lg, auth: ctx.auth, settings: ctx.settings, signal: ac.signal, href: ctx.href } });
        } catch (e) {
            if (ac.signal.aborted) throw e;
            lg.error(`widget ${w.key} failed`, e);
            throw new Error(failureText(e) === BOUNDARY_FAILED_TEXT ? 'This widget could not be loaded. Try again.' : failureText(e));   // the card never shows a backend message (#378): only a userFacing error, or debug logging, does
        } finally {
            ctx.signal.removeEventListener('abort', stop);
            if (runs.get(id) === ac) runs.delete(id);
        }
    };
    return {
        config: { ...config, tabs: config.tabs || tabs.length > 1 ? tabs : undefined, widgets: widgets.map(w => ({ key: w.id, label: w.label, kind: w.kind, tab: w.tab, size: w.size })) },
        load,
    };
}

// The page factory for a route with a `surface` (pages/dashboard.js calls it).
// The page factory for a route with a `surface` (pages/dashboard.js calls it); what it remembers is in dashboard-state.js.
export async function page(host, config, ctx) {
    const m = await setup(config, ctx), s = restore(ctx, config, m.config.tabs);
    return build(host, { ...m.config, tab: s.tab, values: s.values }, ctx, el => (wire(host, ctx, s, el, m.config.tabs), key => m.load(key, el.context)));
}
