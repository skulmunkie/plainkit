// Lazy chunk behind ctx._widgets.def (js/app/widget-host.js, #494): the allow-list check, the access check and the single flight for a module definition.
// `deps` is the host's own closure (allow-list, definition cache, permit, importDef, dead); nothing here can import anything the host would not.
import { MODULE_ID } from '../module.js';

const pend = new WeakMap();
// Access at the door, as for a visit but without a route of its own: the app and entry `can` (the module's own is only known once it is loaded).
const open = (access, entry) => access(entry, null, { path: '/', params: {}, query: {} }) === true;

export const entries = ({ allow, access }, surface) => Object.freeze([...allow.values()].filter(e => open(access, e) && e.contributes?.some(c => c?.for?.includes(surface))).map(e => Object.freeze({ id: e.id, contributes: e.contributes })));

export function def(deps, id) {
    const { allow, defs, access, importDef, dead } = deps;
    const entry = typeof id === 'string' && MODULE_ID.test(id) ? allow.get(id) : undefined;
    if (!entry) return Promise.reject(new TypeError(`widgets: "${id}" is not an allow-listed module`));
    if (defs.has(id)) return Promise.resolve(defs.get(id));
    const flights = pend.get(deps) ?? pend.set(deps, new Map()).get(deps);
    if (!flights.has(id)) flights.set(id, (open(deps.access, entry) ? importDef(id, entry, () => !dead()) : Promise.reject(new Error(`widgets: "${id}" is not allowed`))).finally(() => flights.delete(id)));
    return flights.get(id);
}
