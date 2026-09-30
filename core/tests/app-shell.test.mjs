// mountApp's pure parts (js/app/config.js, js/app/nav.js) and the rules of its entry (#350): the config is checked before anything is built, the nav is structure, the module
// route tree says which nav entry a record page belongs to, and the entry pulls in no module and no page type. The DOM side (the shell, the drawer, focus, leaks, layout shift)
// is proved in a real browser: tests/browser/cases-app-shell.js and the scenarios app-shell, app-shell-top and app-module-switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, readFooter } from '../js/app/config.js';
import { locate, pageContext, menuTree, absolute, navOf, searchNav, MAX_TOP, MAX_ALL } from '../js/app/nav.js';
import { navRoutes } from '../js/route-tree.js';
import { defineModule } from '../js/app/module.js';
import { addLogSink, setLogLevel } from '../js/log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
setLogLevel('warn');
const logs = [];
addLogSink(e => logs.push(e));
const load = () => Promise.resolve({});
const base = { modules: [{ id: 'orders', title: 'Orders', load }, { id: 'reports', load }] };

test('the config: defaults, the side layout, the first bar module is home', () => {
    const c = readConfig(base);
    assert.equal(c.layout, 'side');
    assert.equal(c.routing, 'hash');
    assert.equal(c.home, 'orders');
    assert.equal(c.modules[1].title, 'reports');
    assert.deepEqual(c.theme, { default: 'dark', param: 'theme' });
    assert.equal(c.search.placeholder, 'Search');
    assert.equal(readConfig({ ...base, search: false }).search, null);
    assert.equal(readConfig({ modules: [{ id: 'about', menu: 'settings', load }, { id: 'orders', load }] }).home, 'orders');
    assert.equal(readConfig({ ...base, layout: 'top' }).layout, 'top');
});

test('the config: a bad value throws naming the key, an unknown key is ONE warning and is ignored', () => {
    assert.throws(() => readConfig(undefined), /config is required/);
    assert.throws(() => readConfig({}), /config\.modules/);
    assert.throws(() => readConfig({ modules: [{ id: '../x', load }] }), /modules\[0\]\.id/);
    assert.throws(() => readConfig({ modules: [{ id: 'a', load }, { id: 'a', load }] }), /used twice/);
    assert.throws(() => readConfig({ modules: [{ id: 'a' }] }), /modules\[0\]\.load/);
    assert.throws(() => readConfig({ modules: [{ id: 'a', load, menu: 'top' }] }), /menu/);
    assert.throws(() => readConfig({ ...base, home: 'nope' }), /config\.home/);
    assert.throws(() => readConfig({ ...base, layout: 'left' }), /config\.layout/);
    assert.throws(() => readConfig({ ...base, routing: 'query' }), /config\.routing/);
    assert.throws(() => readConfig({ ...base, theme: { default: 'blue' } }), /theme\.default/);
    assert.throws(() => readConfig({ ...base, footer: { links: [{ label: 'x', href: ['java', 'script:x'].join('') }] } }), /footer\.links\[0\]/);
    logs.length = 0;
    readConfig({ ...base, colour: 'red', brand: { text: 'A', logo: 'x' }, modules: [{ id: 'a', load, badge: 1 }] });
    const said = logs.filter(e => e.level === 'warn').map(e => e.message);
    assert.equal(said.length, 3, said.join(' | '));
    for (const key of ['colour', 'brand.logo', 'modules[0].badge']) assert.ok(said.some(m => m.includes(`"${key}"`)), `no warning for ${key}`);
});

test('readFooter: the shape of a footer (the app one and a module footer), links checked, text a string', () => {
    assert.deepEqual(readFooter({ text: 'A', links: [{ label: 'P', href: '/p' }] }), { text: 'A', links: [{ label: 'P', href: '/p' }] });
    assert.deepEqual(readFooter({}), { text: '', links: [] });
    assert.throws(() => readFooter({ links: 'x' }, 'orders.footer'), /orders\.footer\.links/);
    assert.throws(() => readFooter({ links: [{ label: 'x', href: ['java', 'script:x'].join('') }] }, 'orders.footer'), /orders\.footer\.links\[0\]/);
    assert.throws(() => readFooter('text'), /footer must be an object/);
});

const ORDERS = defineModule({
    id: 'orders',
    routes: [
        { path: '/', label: 'All orders', page: 'custom', children: [{ path: '/:id', label: p => `Order ${p.id}`, page: 'custom' }] },
        { path: '/open', label: 'Open', page: 'custom' },
        { path: '*', page: 'not-found' },
    ],
});
const NAV = [{ id: 'all', title: 'All orders', route: '/' }, { id: 'open', title: 'Open', route: '/open' }, { id: 'more', title: 'More', children: [{ id: 'shipped', title: 'Shipped', route: '/shipped' }] }];

test('pageContext: one answer for the nav, the breadcrumb and the title, with an explicit override (#670)', () => {
    const tree = navRoutes(NAV);
    assert.deepEqual(pageContext(ORDERS, tree, '/8'), { ids: ['all'], section: 'all', current: 'all', crumbs: [{ label: 'All orders', href: '/' }, { label: 'Order 8' }], title: 'Order 8' });
    assert.deepEqual(pageContext(ORDERS, tree, '/nothing/here'), { ids: [], section: null, current: null, crumbs: [], title: '' });
    const t = pageContext(ORDERS, tree, '/8', { title: 'Order 8 (paid)' });
    assert.equal(t.title, 'Order 8 (paid)');
    assert.equal(t.crumbs.at(-1).label, 'Order 8 (paid)');
    const o = pageContext(ORDERS, tree, '/8', { ids: ['a', 'b'], crumbs: [{ label: 'X' }] });
    assert.deepEqual([o.section, o.current, o.title], ['a', 'b', 'X']);
});

test('a record route belongs to its list: the list entry is current, the trail is the route labels', () => {
    const tree = navRoutes(NAV);
    assert.deepEqual(locate(ORDERS, tree, '/8'), { ids: ['all'], crumbs: [{ label: 'All orders', href: '/' }, { label: 'Order 8' }] });
    assert.deepEqual(locate(ORDERS, tree, '/open'), { ids: ['open'], crumbs: [{ label: 'Open' }] });
    assert.deepEqual(locate(ORDERS, tree, '/'), { ids: ['all'], crumbs: [{ label: 'All orders' }] });
    assert.deepEqual(locate(ORDERS, tree, '/nothing/here'), { ids: [], crumbs: [] });
    // a nav entry that is deeper in the nav keeps its group in the trail, and a route the nav does not list still gets a trail from its labels
    assert.deepEqual(locate(defineModule({ id: 'x', routes: [{ path: '/shipped', label: 'Shipped', page: 'custom' }] }), tree, '/shipped'), { ids: ['more', 'shipped'], crumbs: [{ label: 'More' }, { label: 'Shipped' }] });
    assert.deepEqual(locate(defineModule({ id: 'x', routes: [{ path: '/a', label: 'A', page: 'custom', children: [{ path: '/a/:id', label: 'B', page: 'custom' }] }] }), [], '/a/1'), { ids: [], crumbs: [{ label: 'A', href: '/a' }, { label: 'B' }] });
});

test('defineModule checks nested routes too (a duplicate or a bad page type inside children)', () => {
    assert.throws(() => defineModule({ id: 'x', routes: [{ path: '/a', page: 'custom', children: [{ path: '/a', page: 'custom' }] }] }), /duplicate route/);
    assert.throws(() => defineModule({ id: 'x', routes: [{ path: '/a', page: 'custom', children: [{ path: '/a/b' }] }] }), /needs page/);
});

test('the one menu tree: modules with the active one holding its entries; the settings-menu modules are left out; links are built through hrefOf', () => {
    const modules = [{ id: 'orders', title: 'Orders', icon: 'orders' }, { id: 'reports', title: 'Reports' }, { id: 'about', title: 'About', menu: 'settings' }];
    const shown = absolute(NAV, r => `#/orders${r === '/' ? '' : r}`);
    assert.deepEqual(shown[0], { id: 'all', title: 'All orders', icon: undefined, badge: undefined, href: '#/orders', children: [] });
    assert.equal(shown[2].children[0].href, '#/orders/shipped');
    const tree = menuTree(modules, p => `#${p}`, 'orders', shown);
    assert.deepEqual(tree.map(t => [t.module, t.active, t.children.length, t.href]), [['orders', true, 3, '#/orders'], ['reports', false, 0, '#/reports']]);
    assert.equal(menuTree(modules, p => `#${p}`, null, []).some(t => t.active), false);
});

test('search: the nav is searched by title, at most eight, groups have no route', () => {
    assert.deepEqual(searchNav(NAV, 'ship').map(r => [r.id, r.sub, r.route]), [['shipped', 'More', '/shipped']]);
    assert.deepEqual(searchNav(NAV, '  '), []);
    assert.equal(searchNav(Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, title: `Item ${i}`, route: `/${i}` })), 'item').length, 8);
});

test('a nav that is not structure is logged once: more than 12 top-level or 40 entries suggests a list page', () => {
    const many = n => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, title: `Entry ${i}`, route: `/${i}` }));
    logs.length = 0;
    assert.equal(navOf({ id: 'big', nav: many(MAX_TOP) }).length, MAX_TOP);
    assert.equal(logs.length, 0, 'twelve entries are fine');
    navOf({ id: 'big', nav: () => many(MAX_TOP + 1) });
    navOf({ id: 'big', nav: many(MAX_TOP + 5) });
    const said = logs.filter(e => e.level === 'warn');
    assert.equal(said.length, 1, 'once per module');
    assert.match(said[0].message, /list page/);
    logs.length = 0;
    navOf({ id: 'deep', nav: [{ id: 'g', title: 'G', children: many(MAX_ALL) }] });
    assert.equal(logs.filter(e => e.level === 'warn').length, 1, 'forty-one entries in total warn as well');
    logs.length = 0;
    assert.deepEqual(navOf({ id: 'boom', nav: () => { throw new Error('nope'); } }), []);
    assert.equal(logs.filter(e => e.level === 'error').length, 1, 'a throwing nav is logged, not thrown');
});

test('the entry (js/app.js) reaches no module of the modules unit and no page type: its static import graph is the framework only', () => {
    const seen = new Set();
    const walk = f => {
        if (seen.has(f)) return;
        seen.add(f);
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'/g)) walk(path.resolve(path.dirname(f), m[1]));
    };
    walk(path.join(root, 'js', 'app.js'));
    const rel = [...seen].map(f => path.relative(root, f).replace(/\\/g, '/'));
    assert.ok(rel.includes('js/app/app.js') && rel.includes('js/router.js'));
    for (const f of rel) assert.ok(f.startsWith('js/'), `${f} is outside js/: the runtime entry must not pull in the modules unit`);
    for (const f of rel) assert.ok(!/pages?\//.test(f) && !/page-type|-page\.js/.test(f), `${f} looks like a page type`);
});

test('the demo apps and the shell carry no consumer CSS: no style attribute or property, no class, no stylesheet of their own', () => {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|html)$/.test(e.name)) files.push(p); } };
    walk(path.join(root, 'samples', 'app'));
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
        assert.ok(!/\sstyle\s*=|<style|\.style\b|setAttribute\(\s*['"](style|class)|classList|className|\sclass\s*=/.test(src), `${path.relative(root, f)} has CSS of its own: a missing style is a framework gap, not a local fix`);
    }
    // the shell adds one class, the framework's own utility that keeps the route announcement off the screen, and nothing else
    const shell = fs.readFileSync(path.join(root, 'js', 'app', 'shell.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.deepEqual([...shell.matchAll(/class:\s*'([^']+)'/g)].map(m => m[1]), ['u-sr-only']);
    assert.ok(!/style/.test(shell));
});
