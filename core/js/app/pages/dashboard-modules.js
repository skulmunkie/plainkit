// A dashboard route with a `surface` (#494, design 2026-10-13-module-dashboard-design.md, step 3): composes its tabs and widgets from the metadata modules contribute
// on their config entries (dashboard-compose.js, pure) and loads each widget on demand through the host's internal service ctx._widgets (js/app/widget-host.js).
// A lazy chunk behind pages/dashboard.js: a dashboard configured by its route alone never loads it. No module code runs until a widget of a visible tab starts.
//
//   setup(config, ctx) -> Promise<{ config, load(key, context) }>   config: the page config with `tabs` and `widgets` composed; load: the pk-dashboard-page callback
// Each widget run has its own AbortController, chained to the page's ctx.signal; a new run of a widget aborts its previous one, leaving the page aborts them all.
// A failure shows the generic boundary text (failureText), the real error goes to the log. A widget gets a subset of the module ctx (id, log, auth, settings, signal, href): its module is loaded as a definition only, mount() never runs.
import { createLogger } from '../../log.js';
import { failureText } from '../boundary.js';
import { compose } from './dashboard-compose.js';
import { build } from './dashboard.js';

export async function setup(config, ctx) {
    const svc = ctx._widgets;
    if (!svc) throw new TypeError('dashboard: a `surface` needs the app module host (mountApp or createModuleHost)');
    const entries = await svc.entries(config.surface);
    const log = createLogger('app:dashboard');
    const own = (entry, c) => {
        try { return c.can ? c.can({ auth: ctx.auth, id: entry.id, route: ctx.route }) === true : true; } catch (e) { log.error(`can() of ${entry.id}:${c.key} threw`, e); return false; }
    };
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
            const widget = def.widgets?.[w.key];
            if (!widget) throw new Error(`the module "${w.module}" has no widgets.${w.key}, but its config entry contributes it`);
            return await widget.load({ context: { ...context }, signal: ac.signal, ctx: { id: w.module, log: lg, auth: ctx.auth, settings: ctx.settings, signal: ac.signal, href: ctx.href } });
        } catch (e) {
            if (ac.signal.aborted) throw e;
            lg.error(`widget ${w.key} failed`, e);
            throw new Error(failureText(e));   // the card never shows a backend message (#378): only a userFacing error, or debug logging, does
        } finally {
            ctx.signal.removeEventListener('abort', stop);
            if (runs.get(id) === ac) runs.delete(id);
        }
    };
    return {
        config: { ...config, tabs: config.tabs || tabs.length > 1 ? tabs : undefined, widgets: widgets.map(w => ({ key: w.id, label: w.label, kind: w.kind, tab: w.tab })) },
        load,
    };
}

// The page factory for a route with a `surface` (pages/dashboard.js calls it).
export async function page(host, config, ctx) {
    const m = await setup(config, ctx);
    return build(host, m.config, ctx, el => key => m.load(key, el.context));
}
