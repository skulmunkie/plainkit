// The module manifest (#364): the data part of a module as plain JSON (js/app/manifest.schema.json), readable by a .NET host or a tool without running a module.
// readManifest rejects unknown keys and non-data, then runs defineModule's own checks, so both worlds enforce one set of rules. appLocate is the pure
// "where is the reader" the Blazor frame ports (fixture ../tests/fixtures/app-nav.json).
import { defineModule } from '../js/app/module.js';
import { pageContext } from '../js/page-context.js';
import { navRoutes } from '../js/route-tree.js';

export const MANIFEST_KEYS = { module: ['id', 'title', 'icon', 'nav', 'routes', 'footer'], nav: ['id', 'title', 'route', 'href', 'icon', 'badge', 'children'], route: ['path', 'page', 'label', 'children'], footer: ['text', 'links'] };
const fail = (at, why) => { throw new TypeError(`readManifest: ${at} ${why}`); };

function check(v, kind, at) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(at, 'must be an object');
    for (const [k, x] of Object.entries(v)) {
        if (!MANIFEST_KEYS[kind].includes(k)) fail(at, `has an unknown key "${k}"`);
        if (typeof x === 'function') fail(`${at}.${k}`, 'must be data, not a function');
    }
    for (const [k, sub] of kind === 'module' ? [['nav', 'nav'], ['routes', 'route']] : [['children', kind]]) {
        if (v[k] !== undefined) (Array.isArray(v[k]) ? v[k] : fail(`${at}.${k}`, 'must be an array')).forEach((c, i) => check(c, sub, `${at}.${k}[${i}]`));
    }
    if (kind === 'route' && typeof v.page !== 'string') fail(at, 'needs page: a page type id');
    if (kind === 'module' && v.footer !== undefined) check(v.footer, 'footer', `${at}.footer`);
}

export function readManifest(data) {
    check(data, 'module', 'manifest');
    return defineModule(data);
}

// The module, nav ids, crumbs and title for an app-wide path ('/orders/open') among manifests: the first segment is the module, the rest module-relative.
// Crumbs read App > Module > the nav entry > route labels, like mountApp's trail. An unknown module answers null.
export function appLocate(manifests, brand, path) {
    const [id, ...rest] = path.split(/[?#]/)[0].split('/').filter(Boolean), m = manifests.find(x => x.id === id);
    if (!m) return null;
    const own = '/' + rest.join('/'), ctx = pageContext(m, navRoutes(m.nav ?? []), own);
    const inner = own === '/' ? [] : ctx.crumbs.filter(c => c.href !== '/').map(c => (c.href ? { label: c.label, href: `/${id}${c.href}` } : { label: c.label }));
    return { module: id, ids: ctx.ids, current: ctx.current, crumbs: [{ label: brand, href: '/' }, { label: m.title, href: `/${id}` }, ...inner], title: inner.length ? inner[inner.length - 1].label : m.title };
}
