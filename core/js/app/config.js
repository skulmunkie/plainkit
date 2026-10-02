// The app config of mountApp (#350): what the one JS module a consumer writes may say, checked before anything is built. Pure, no DOM.
//
//   export default {
//       title: 'Orders',                                    // the document title's second half (default: brand.text)
//       brand: { text: 'Orders' },                           // the bar's brand; it always links to the app home
//       modules: [                                           // the top menu, in order, and the ALLOW-LIST: the only code the app ever imports
//           { id: 'orders', title: 'Orders', load: () => import('./modules/orders.js') },
//           { id: 'settings', title: 'Settings', load: () => import('./modules/settings.js'), menu: 'settings' },   // in the settings menu, not the bar
//       ],                                                   // entry: id, title, load (required), icon, menu ('settings'), can
//       home: 'orders',                                      // where '#/' goes (default: the first module in the bar)
//       layout: 'side',                                      // 'side' (the default): the module list is the side nav, each module a section whose own nav is its children; 'top' (the exception,
//                                                            // for a tiny app with few modules and no module nav): the modules are links in the header bar. On a narrow screen both use ONE drawer.
//       routing: 'hash', base: '',                           // 'hash' ('#/<moduleId>/...', static hosting, the default) or 'path' (server rewrites; base = the prefix)
//       search: { placeholder: 'Search', minLength: 1 },     // the header search; false leaves it out. Results: the active module's `search(query, ctx)`, else its nav
//       footer: { text: 'Acme', links: [{ label: 'Privacy', href: '/privacy.html' }] },   // a module's own `footer` (same shape, or false for none) replaces it while that module is active (#373)
//       theme: { default: 'dark', param: 'theme' },          // ?theme=light wins over the stored choice, which wins over the default
//       storage: { prefix: 'pk', version: 1, legacy: { theme: 'pk-site-theme' } },   // the store's namespace and schema version; legacy: old localStorage keys read once
//       auth, can,                                           // ctx.auth (opaque to the framework) and the app-wide (entry, { auth, id, route }) => true | { allow: false, redirect }
//   }
//
// readConfig returns the normalised copy or throws a TypeError naming the key. A key nobody knows is ignored with ONE warning through the SDK logger (a typo is
// visible, never fatal). Module ids follow MODULE_ID (js/app/module.js); the loaders are stored, never called here.
import { createLogger } from '../log.js';
import { safeHref } from '../safe-url.js';
import { MODULE_ID } from './module.js';

const log = createLogger('app');
const isFn = v => typeof v === 'function';
const fail = (key, why) => { throw new TypeError(`mountApp: config${key ? '.' + key : ''} ${why}`); };
const obj = (v, key) => (v === undefined ? {} : v && typeof v === 'object' && !Array.isArray(v) ? v : fail(key, 'must be an object'));
const str = (v, key, dflt) => (v === undefined ? dflt : typeof v === 'string' && v.trim() ? v : fail(key, 'must be a non-empty string'));
const known = (o, keys, where) => { for (const k of Object.keys(o)) if (!keys.includes(k)) log.warn(`mountApp: unknown config key "${where}${k}" ignored`); return o; };

// A footer ({ text, links }) checked and normalised; also used for a module's own `footer` (a module may replace the app's while it is active). Throws a TypeError naming `key`.
export function readFooter(footer, key = 'footer') {
    const foot = known(obj(footer, key), ['text', 'links'], `${key}.`);
    const links = (Array.isArray(foot.links) ? foot.links : foot.links === undefined ? [] : fail(`${key}.links`, 'must be an array')).map((l, i) => (typeof l?.label === 'string' && safeHref(l.href) ? { label: l.label, href: l.href } : fail(`${key}.links[${i}]`, 'needs a label and an http(s), mailto, tel or relative href')));
    return { text: str(foot.text, `${key}.text`, ''), links };
}

export function readConfig(config) {
    const c = known(obj(config ?? fail('', 'is required (an object: modules, brand, ...)'), ''), ['title', 'brand', 'modules', 'home', 'layout', 'routing', 'base', 'search', 'footer', 'theme', 'storage', 'auth', 'can'], '');
    if (!Array.isArray(c.modules) || !c.modules.length) fail('modules', 'must be a non-empty array of { id, title, load }');
    const ids = new Set();
    const modules = c.modules.map((m, i) => {
        const at = `modules[${i}]`;
        known(obj(m, at), ['id', 'title', 'icon', 'load', 'menu', 'can'], `${at}.`);
        if (typeof m.id !== 'string' || !MODULE_ID.test(m.id)) fail(`${at}.id`, `must match ${MODULE_ID}`);
        if (ids.has(m.id)) fail(`${at}.id`, `"${m.id}" is used twice`);
        ids.add(m.id);
        if (!isFn(m.load)) fail(`${at}.load`, 'must be a function that imports the module (see the header of js/app/config.js)');
        if (m.can !== undefined && !isFn(m.can)) fail(`${at}.can`, 'must be a function');
        if (m.menu !== undefined && m.menu !== 'settings') fail(`${at}.menu`, "must be 'settings' or left out");
        return { ...m, title: str(m.title, `${at}.title`, m.id) };
    });
    const home = str(c.home, 'home', (modules.find(m => !m.menu) ?? modules[0]).id);
    if (!ids.has(home)) fail('home', `"${home}" is not one of the modules`);
    if (c.layout !== undefined && c.layout !== 'side' && c.layout !== 'top') fail('layout', "must be 'side' or 'top'");
    if (c.routing !== undefined && c.routing !== 'hash' && c.routing !== 'path') fail('routing', "must be 'hash' or 'path'");
    if (c.can !== undefined && !isFn(c.can)) fail('can', 'must be a function');
    const brand = known(obj(c.brand, 'brand'), ['text'], 'brand.');
    const search = c.search === false ? null : known(obj(c.search, 'search'), ['placeholder', 'minLength'], 'search.');
    const theme = known(obj(c.theme, 'theme'), ['default', 'param'], 'theme.');
    const storage = known(obj(c.storage, 'storage'), ['prefix', 'version', 'legacy'], 'storage.');
    if (theme.default !== undefined && theme.default !== 'light' && theme.default !== 'dark') fail('theme.default', "must be 'light' or 'dark'");
    if (storage.version !== undefined && !Number.isInteger(storage.version)) fail('storage.version', 'must be an integer');
    return {
        title: str(c.title, 'title', str(brand.text, 'brand.text', 'App')),
        brand: { text: str(brand.text, 'brand.text', 'App') },
        modules, home, auth: c.auth, can: c.can,
        layout: c.layout ?? 'side', routing: c.routing ?? 'hash', base: str(c.base, 'base', ''),
        search: search && { placeholder: str(search.placeholder, 'search.placeholder', 'Search'), minLength: Number.isInteger(search.minLength) && search.minLength >= 0 ? search.minLength : 1 },
        footer: c.footer === undefined ? null : readFooter(c.footer, 'footer'),
        theme: { default: theme.default ?? 'dark', param: str(theme.param, 'theme.param', 'theme') },
        storage: { prefix: str(storage.prefix, 'storage.prefix', 'pk'), version: storage.version ?? 1, legacy: obj(storage.legacy, 'storage.legacy') },
    };
}
