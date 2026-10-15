// Dashboard composition (#494, design 2026-10-13-module-dashboard-design.md, model B): modules CONTRIBUTE widget metadata on their config entry, and a dashboard
// route composes the widgets for its `surface`. Pure: no DOM, no imports of module code, never calls a loader or `can` (the caller passes `allow`).
// Used by pages/dashboard-modules.js (the dashboard page type, step 3). A lazy chunk under pages/, outside the entry graph (js/app.js never imports it).
//
//   modules: [{ id: 'sales', title: 'Sales', load, contributes: [
//       { key: 'churn', for: ['overview'], tab: 'sales', label: 'Churn', kind: 'stat', size: 'sm', order: 20, needs: ['range'], can: ctx => true } ] }]
//
//   compose(entries, route, { allow }) => { tabs: [{ id, label }], widgets: [{ id: 'sales:churn', module, key, tab, label, kind, size, order, needs }] }   (frozen copies)
//     entries: the normalised config modules ({ id, contributes }); route: { surface, tabs?: [{ id, label }], filters?: [{ key }] }
//     allow(entry, contribution): sync visibility (app/entry/own `can`), default allows all. A hidden widget is dropped, a tab with no widgets is dropped.
//     Tab labels belong to the route; a contribution naming an undeclared tab gets an implicit tab titled from its id, with one warning.
//     A `needs` key the route has no filter for warns once and the widget still renders.
//     Order: `order` (default 100, lower first), then the module's position in `entries`, then declaration order. The route may curate (order/allow/deny by `module:key`): dashboard-curate.js.
import { createLogger } from '../../log.js';
import { MODULE_ID } from '../module.js';
import { curate } from './dashboard-curate.js';

const log = createLogger('app:dashboard');
const KINDS = ['stat', 'chart'];
const SIZES = ['sm', 'md', 'lg'];
const fail = (where, why) => { throw new TypeError(`dashboard: ${where} ${why}`); };
const strs = (v, where) => (Array.isArray(v) && v.length && v.every(s => typeof s === 'string' && s) ? v : fail(where, 'must be a non-empty array of strings'));

// One contribution checked and copied; throws a TypeError naming module and key. `where` is "<module>.contributes[i]".
export function readContribution(c, where) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail(where, 'must be an object');
    if (typeof c.key !== 'string' || !MODULE_ID.test(c.key)) fail(`${where}.key`, `must match ${MODULE_ID}`);
    const at = `${where}(${c.key})`;
    const surfaces = strs(c.for, `${at}.for`);
    if (new Set(surfaces).size !== surfaces.length) fail(`${at}.for`, 'repeats a surface');
    if (typeof c.label !== 'string' || !c.label.trim()) fail(`${at}.label`, 'must be a non-empty string');
    if (c.tab !== undefined && (typeof c.tab !== 'string' || !c.tab)) fail(`${at}.tab`, 'must be a non-empty string');
    if (!KINDS.includes(c.kind)) fail(`${at}.kind`, `must be one of ${KINDS.join(', ')}`);
    if (c.size !== undefined && !SIZES.includes(c.size)) fail(`${at}.size`, `must be one of ${SIZES.join(', ')}`);
    if (c.order !== undefined && !Number.isFinite(c.order)) fail(`${at}.order`, 'must be a finite number');
    if (c.can !== undefined && typeof c.can !== 'function') fail(`${at}.can`, 'must be a function');
    return { key: c.key, for: surfaces, tab: c.tab, label: c.label, kind: c.kind, size: c.size ?? 'md', order: c.order ?? 100, needs: c.needs === undefined ? [] : strs(c.needs, `${at}.needs`), can: c.can };
}

export function compose(entries, route, { allow = () => true } = {}) {
    if (!Array.isArray(entries)) fail('entries', 'must be an array');
    if (!route || typeof route.surface !== 'string' || !route.surface) fail('route.surface', 'must be a non-empty string');
    const declared = new Map((route.tabs ?? []).map(t => [t.id, t.label ?? t.id]));
    const filters = new Set((route.filters ?? []).map(f => f.key)), first = route.tabs?.[0]?.id ?? 'main';
    const found = [], offered = new Set(), warned = new Set();
    const warnOnce = (id, msg) => { if (!warned.has(id)) { warned.add(id); log.warn(msg); } };
    const finish = curate(route, fail, warnOnce);
    entries.forEach((entry, pos) => {
        const keys = new Set();
        (entry.contributes ?? []).forEach((raw, i) => {
            const c = readContribution(raw, `${entry.id}.contributes[${i}]`);
            if (keys.has(c.key)) fail(`${entry.id}.contributes[${i}].key`, `"${c.key}" is used twice`);
            keys.add(c.key);
            if (!c.for.includes(route.surface) || (offered.add(`${entry.id}:${c.key}`), !allow(entry, c))) return;
            const tab = c.tab ?? first;
            if (!declared.has(tab)) { warnOnce(`tab:${tab}`, `dashboard "${route.surface}": tab "${tab}" is not declared on the route, an implicit tab is used`); declared.set(tab, tab); }
            for (const k of c.needs) if (!filters.has(k)) warnOnce(`need:${entry.id}:${c.key}:${k}`, `dashboard "${route.surface}": ${entry.id}:${c.key} needs filter "${k}", which the route does not declare`);
            found.push({ pos, i, w: Object.freeze({ id: `${entry.id}:${c.key}`, module: entry.id, key: c.key, tab, label: c.label, kind: c.kind, size: c.size, order: c.order, needs: Object.freeze([...c.needs]) }) });
        });
    });
    const widgets = finish(found, offered);
    const used = new Set(widgets.map(w => w.tab));
    const tabs = [...declared].filter(([id]) => used.has(id)).map(([id, label]) => Object.freeze({ id, label }));
    return Object.freeze({ tabs: Object.freeze(tabs), widgets: Object.freeze(widgets) });
}
