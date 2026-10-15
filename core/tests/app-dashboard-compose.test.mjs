// Dashboard composition, step 1 (#494): `contributes` on a config entry and the pure compose() in js/app/pages/dashboard-compose.js. Nothing imports the composer at runtime yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../js/app/config.js';
import { compose } from '../js/app/pages/dashboard-compose.js';
import { addLogSink, setLogLevel } from '../js/log.js';

setLogLevel('warn');
const warns = [];
addLogSink(e => { if (e.level === 'warn' && e.scope === 'app:dashboard') warns.push(e.message); });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = () => Promise.resolve({});
const c = (key, extra = {}) => ({ key, for: ['overview'], label: key, kind: 'stat', ...extra });
const route = { surface: 'overview', tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }], filters: [{ key: 'range' }] };

test('readConfig accepts contributes on an entry, keeps it, and rejects a non-array (items are checked by compose)', () => {
    const cfg = readConfig({ modules: [{ id: 'sales', load, contributes: [c('churn')] }, { id: 'ops', load }] });
    assert.equal(cfg.modules[0].contributes[0].key, 'churn');
    assert.throws(() => readConfig({ modules: [{ id: 'a', load, contributes: 'x' }] }), /modules\[0\]\.contributes must be an array/);
});

test('compose picks the surface, orders by order then module position then declaration, and freezes the result', () => {
    const entries = [
        { id: 'sales', contributes: [c('b', { tab: 'sales', order: 20 }), c('a', { tab: 'sales' }), c('other', { for: ['reports'], tab: 'sales' })] },
        { id: 'ops', contributes: [c('c', { tab: 'ops', order: 20 }), c('d', { tab: 'sales', order: 20 })] },
    ];
    const out = compose(entries, route);
    assert.deepEqual(out.widgets.map(w => w.id), ['sales:b', 'ops:c', 'ops:d', 'sales:a']);
    assert.deepEqual(out.tabs, [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }]);
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out.widgets[0]));
    assert.equal(out.widgets[0].size, 'md');
});

test('compose hides what allow denies and drops a tab with no widgets', () => {
    const entries = [{ id: 'sales', contributes: [c('a', { tab: 'sales' })] }, { id: 'ops', contributes: [c('b', { tab: 'ops' })] }];
    const out = compose(entries, route, { allow: e => e.id !== 'ops' });
    assert.deepEqual(out.widgets.map(w => w.id), ['sales:a']);
    assert.deepEqual(out.tabs.map(t => t.id), ['sales']);
    assert.deepEqual(compose([], route), { tabs: [], widgets: [] });
});

test('an undeclared tab becomes an implicit tab with one warning; a missing needs key warns and still renders', () => {
    warns.length = 0;
    const out = compose([{ id: 'sales', contributes: [c('a', { tab: 'extra' }), c('b', { tab: 'extra', needs: ['region'] })] }], route);
    assert.deepEqual(out.tabs, [{ id: 'extra', label: 'extra' }]);
    assert.equal(out.widgets.length, 2);
    assert.equal(warns.filter(m => /tab "extra"/.test(m)).length, 1);
    assert.equal(warns.filter(m => /needs filter "region"/.test(m)).length, 1);
    assert.equal(compose([{ id: 'sales', contributes: [c('a')] }], { surface: 'overview' }).tabs[0].id, 'main');
});

test('compose validates shape and names the module and key', () => {
    const bad = (extra, re) => assert.throws(() => compose([{ id: 'sales', contributes: [c('a', extra)] }], route), re);
    bad({ kind: 'pie' }, /sales\.contributes\[0\]\(a\)\.kind/);
    bad({ for: [] }, /\.for/);
    bad({ for: ['overview', 'overview'] }, /repeats a surface/);
    bad({ size: 'xl' }, /\.size/);
    bad({ order: NaN }, /\.order/);
    bad({ needs: 'range' }, /\.needs/);
    bad({ can: true }, /\.can/);
    bad({ label: '' }, /\.label/);
    assert.throws(() => compose([{ id: 'sales', contributes: [c('a'), c('a')] }], route), /"a" is used twice/);
    assert.throws(() => compose([{ id: 'sales', contributes: [c('Bad Key')] }], route), /\.key/);
    assert.throws(() => compose([], {}), /route\.surface/);
});

test('route curation (#1294): order lists first, allow keeps, deny drops (deny wins), all by module:key', () => {
    const entries = [
        { id: 'sales', contributes: [c('a', { tab: 'sales', order: 10 }), c('b', { tab: 'sales', order: 20 }), c('x', { tab: 'sales', for: ['other'] })] },
        { id: 'ops', contributes: [c('c', { tab: 'ops' }), c('d', { tab: 'ops', size: 'lg' })] },
    ];
    const ids = r => compose(entries, { ...route, ...r }).widgets.map(w => w.id).join();
    assert.equal(ids({}), 'sales:a,sales:b,ops:c,ops:d');
    assert.equal(ids({ order: ['ops:d', 'sales:b'] }), 'ops:d,sales:b,sales:a,ops:c');
    assert.equal(ids({ allow: ['ops:c', 'sales:a'] }), 'sales:a,ops:c');
    assert.equal(ids({ deny: ['sales:a'] }), 'sales:b,ops:c,ops:d');
    assert.equal(ids({ allow: ['sales:a', 'sales:b'], deny: ['sales:b'], order: ['sales:b', 'sales:a'] }), 'sales:a');
    assert.deepEqual(compose(entries, { ...route, deny: ['ops:c', 'ops:d'] }).tabs.map(t => t.id), ['sales'], 'a tab left with no widgets is dropped');
    assert.equal(compose(entries, { ...route, order: ['ops:d'] }).widgets[0].size, 'lg', 'curation keeps size and the rest of the widget');
});

test('route curation: unknown ids warn once and are ignored, a malformed list throws, access checks still apply after curation', () => {
    const entries = [{ id: 'sales', contributes: [c('a'), c('hidden', { can: () => false }), c('elsewhere', { for: ['other'] })] }];
    const can = (e, k) => !k.can || k.can();
    warns.length = 0;
    const r = compose(entries, { ...route, order: ['sales:nope', 'sales:a'], allow: ['sales:a', 'sales:nope', 'gone:x'], deny: ['sales:elsewhere'] }, { allow: can });
    assert.equal(r.widgets.map(w => w.id).join(), 'sales:a');
    assert.equal(warns.filter(m => /sales:nope/.test(m)).length, 1, 'warned once though listed twice');
    assert.ok(warns.some(m => /gone:x/.test(m)) && warns.some(m => /sales:elsewhere/.test(m)), 'a widget of another surface counts as not offered');
    warns.length = 0;
    assert.equal(compose(entries, { ...route, allow: ['sales:hidden', 'sales:a'] }, { allow: can }).widgets.map(w => w.id).join(), 'sales:a', 'allowing a widget its can denies does not show it');
    assert.equal(warns.length, 0, 'a widget hidden by can is still offered, so naming it is not unknown');
    for (const key of ['order', 'allow', 'deny']) {
        assert.throws(() => compose(entries, { ...route, [key]: 'sales:a' }), new RegExp(`route\\.${key}`));
        assert.throws(() => compose(entries, { ...route, [key]: ['sales'] }), new RegExp(`route\\.${key}`));
        assert.throws(() => compose(entries, { ...route, [key]: ['sales:a', 'sales:a'] }), /distinct/);
    }
});

test('the composer is lazy: nothing in the entry graph imports it', () => {
    for (const f of fs.readdirSync(path.join(root, 'js/app')).filter(n => n.endsWith('.js') && true)) assert.ok(!/dashboard\.js'/.test(fs.readFileSync(path.join(root, 'js/app', f), 'utf8')), `${f} must not import the composer yet`);
    assert.ok(!/dashboard\.js'/.test(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8')));
});
