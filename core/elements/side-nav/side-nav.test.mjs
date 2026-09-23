// Unit tests for the side nav's filter, tree keys and persisted state. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNav, splitMatch, treeKey, serializeNav, parseNav, navMode, railRowTooltip, resolveActiveRoute } from './side-nav.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sideNav, { rowsOf } from './side-nav.js';

const entries = [
    { id: 'sell', label: 'Sell', parent: null },
    { id: 'orders', label: 'Orders', parent: 'sell' },
    { id: 'products', label: 'Products', parent: null },
    { id: 'all', label: 'All products', parent: 'products' },
    { id: 'drafts', label: 'Drafts', parent: 'products' },
];

test('an empty query shows everything and opens nothing', () => {
    const r = filterNav(entries, '  ');
    assert.equal(r.visible.size, 5);
    assert.equal(r.open.size, 0);
});

test('a match keeps its branch visible and opens it', () => {
    const r = filterNav(entries, 'draft');
    assert.deepEqual([...r.matches], ['drafts']);
    assert.deepEqual([...r.visible].sort(), ['drafts', 'products']);
    assert.deepEqual([...r.open], ['products']);
});

test('matching is case-insensitive and a branch name matches on its own', () => {
    const r = filterNav(entries, 'SELL');
    assert.deepEqual([...r.visible], ['sell']);
    assert.equal(r.open.size, 0);
    assert.equal(filterNav(entries, 'zzz').visible.size, 0);
});

test('the matched text of a label is split for highlighting', () => {
    assert.deepEqual(splitMatch('All products', 'prod'), [{ text: 'All ', match: false }, { text: 'prod', match: true }, { text: 'ucts', match: false }]);
    assert.deepEqual(splitMatch('Orders', ''), [{ text: 'Orders', match: false }]);
    assert.deepEqual(splitMatch('Orders', 'x'), [{ text: 'Orders', match: false }]);
});

test('arrow keys walk the tree: Right opens then enters, Left folds then goes up', () => {
    assert.equal(treeKey('ArrowDown'), 'next');
    assert.equal(treeKey('ArrowUp'), 'prev');
    assert.equal(treeKey('Home'), 'first');
    assert.equal(treeKey('End'), 'last');
    assert.equal(treeKey('ArrowRight', { hasChildren: true, expanded: false }), 'expand');
    assert.equal(treeKey('ArrowRight', { hasChildren: true, expanded: true }), 'focus-child');
    assert.equal(treeKey('ArrowRight', { hasChildren: false }), null);
    assert.equal(treeKey('ArrowLeft', { hasChildren: true, expanded: true }), 'collapse');
    assert.equal(treeKey('ArrowLeft', { isChild: true }), 'focus-parent');
    assert.equal(treeKey('ArrowLeft', {}), null);
    assert.equal(treeKey('x'), null);
});

const routeEntries = [
    { id: 'dashboard', href: '/dashboard', parent: null },
    { id: 'users', href: '/users', parent: null },
    { id: 'users-archive', href: '/users-archive', parent: null },
    { id: 'settings', href: '/users/settings', parent: 'users' },
    { id: 'profile', href: '/users/settings/profile', parent: 'settings' },
];

test('active route: an exact href match wins over nothing else', () => {
    const r = resolveActiveRoute(routeEntries, '/dashboard');
    assert.equal(r.current, 'dashboard');
    assert.deepEqual([...r.open], []);
});

test('active route: the deepest matching branch wins, not the first prefix hit', () => {
    const r = resolveActiveRoute(routeEntries, '/users/settings/profile');
    assert.equal(r.current, 'profile');
    assert.deepEqual([...r.open].sort(), ['settings', 'users']);
});

test('active route: a sibling that is a literal string prefix of another route is not a false match', () => {
    const r = resolveActiveRoute(routeEntries, '/users-archive');
    assert.equal(r.current, 'users-archive');
    assert.deepEqual([...r.open], []);
});

test('active route: a detail page not literally in the tree falls back to the deepest segment-prefix match', () => {
    const r = resolveActiveRoute(routeEntries, '/users/42');
    assert.equal(r.current, 'users');
    assert.deepEqual([...r.open], []);
});

test('active route: the fallback still prefers the deepest ancestor, never a shallower one', () => {
    const r = resolveActiveRoute(routeEntries, '/users/settings/42');
    assert.equal(r.current, 'settings');
    assert.deepEqual([...r.open], ['users']);
});

test('active route: a path outside the tree, or an empty tree, resolves to nothing', () => {
    assert.equal(resolveActiveRoute(routeEntries, '/nowhere').current, null);
    assert.equal(resolveActiveRoute([], '/dashboard').current, null);
});

test('persisted state round-trips and survives garbage', () => {
    const text = serializeNav(new Set(['products', 'sell']), true);
    assert.deepEqual(parseNav(text), { open: ['products', 'sell'], collapsed: true });
    assert.deepEqual(parseNav('not json'), { open: [], collapsed: false });
    assert.deepEqual(parseNav('{"o":[1,"a"],"c":"yes"}'), { open: ['a'], collapsed: false });
    assert.deepEqual(parseNav(null), { open: [], collapsed: false });
});

test('the nav is a drawer on a phone or tablet, a rail when collapsed, otherwise full', () => {
    assert.equal(navMode(800, true), 'drawer');
    assert.equal(navMode(1280, true), 'rail');
    assert.equal(navMode(1280, false), 'full');
    assert.equal(railRowTooltip('  Orders '), 'Orders');
    assert.equal(railRowTooltip(undefined), '');
});

// Issue #21: group titles (a pk-nav-item with the group attribute) are static: never a row, never focused, hidden by the filter.
const item = (label, extra = {}) => ({ childNodes: [{ nodeType: 3, textContent: label }], textContent: label, parentElement: null, hidden: false, expanded: false, ...extra });

test('rowsOf leaves group titles out', () => {
    const list = [item('Sell', { group: true }), item('Orders'), item('Reports')];
    assert.deepEqual(rowsOf({ querySelectorAll: () => list }).map(i => i.textContent), ['Orders', 'Reports']);
});

test('arrow-key rows skip group titles', () => {
    const list = [item('Sell', { group: true }), item('Orders'), item('Reports')];
    const SideNav = sideNav(class {});
    assert.deepEqual(SideNav.prototype.rows.call({ querySelectorAll: () => list }).map(i => i.textContent), ['Orders', 'Reports']);
});

test('the filter hides group titles while a query is active and shows them again after', () => {
    const list = [item('Sell', { group: true }), item('Orders'), item('Reports')];
    const SideNav = sideNav(class {});
    const scroll = { setAttribute() {} };
    const host = { querySelectorAll: () => list, part: () => scroll, $saved: null };
    SideNav.prototype.filter.call(host, 'ord');
    assert.equal(list[0].hidden, true); assert.equal(list[1].hidden, false); assert.equal(list[2].hidden, true);
    SideNav.prototype.filter.call(host, '');
    assert.equal(list[0].hidden, false); assert.equal(list[2].hidden, false);
});

test('the meta says a group title goes in the default slot', () => {
    const meta = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./side-nav.meta.json', import.meta.url)), 'utf8'));
    assert.match(meta.slots.find(s => s.name === '').description, /group/);
});
