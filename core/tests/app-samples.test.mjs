// The app samples (samples/app/) are the source the "Build an app" guide copies from, so they are held to the real framework: every config passes readConfig, every module
// passes defineModule, and every route of the page-type tour goes through the real page-type factory (mountPage) and lands on the element the type is documented to use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../js/app/config.js';
import { mountPage } from '../js/app/module.js';
import { flattenRoutes } from '../js/route-tree.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');
const ELEMENT = { list: 'pk-list-page', record: 'pk-record-page', dashboard: 'pk-dashboard-page', tool: 'pk-tool-page', settings: 'pk-settings-page', wizard: 'pk-wizard-page', doc: 'pk-doc-page', workspace: 'pk-workspace-page', states: 'pk-states-page', 'not-found': 'pk-not-found-page' };

function fakeHost() {
    const made = [];
    const doc = { createElement: tag => { const el = { tag, addEventListener() {}, removeEventListener() {}, remove() {} }; made.push(el); return el; } };
    return { made, host: { ownerDocument: doc, append() {} } };
}

test('every sample app config is a valid mountApp config and every module it lists is a valid module', async () => {
    for (const name of ['app', 'top', 'pages']) {
        const config = (await import(`../samples/app/${name}.config.js`)).default;
        const read = readConfig(config);
        for (const m of read.modules) assert.equal((await m.load()).default.id, m.id, `${name}: module ${m.id} exports its own definition`);
    }
});

test('every route of the page-type tour mounts through the real page type factory', async () => {
    const tour = (await import('../samples/app/modules/tour.js')).default;
    const seen = new Set();
    for (const { node: route } of flattenRoutes(tour.routes)) {
        const type = typeof route.page === 'string' ? route.page : route.page.type;
        const config = typeof route.config === 'function' ? route.config({ params: { id: '8' }, query: {} }) : route.config;
        const { host, made } = fakeHost();
        const handle = await mountPage(host, { type, config });
        seen.add(type);
        if (type === 'custom') continue;
        assert.equal(made[0]?.tag, ELEMENT[type], `${route.path}: page type ${type} draws ${ELEMENT[type]}`);
        handle.destroy();
    }
    for (const type of Object.keys(ELEMENT)) if (type !== 'not-found' || seen.has(type)) assert.ok(seen.has(type), `the tour has a ${type} route`);
});

test('the tour\'s callbacks return what their page types read', async () => {
    const tour = (await import('../samples/app/modules/tour.js')).default;
    const cfg = path => flattenRoutes(tour.routes).map(x => x.node).find(r => r.path === path).config;
    const list = await cfg('/').load({ page: 1, pageSize: 10, filters: { status: 'Open' } });
    assert.deepEqual([list.total, list.rows.map(r => r.id)], [2, ['7', '9']]);
    assert.equal(cfg('/').rowHref({ id: '7' }), '/orders/7');
    assert.equal((await cfg('/orders/:id').load('8')).customer, 'Grace Hopper');
    assert.equal(await cfg('/orders/:id').load('404'), null);
    assert.equal((await cfg('/overview').load('open')).value, '2');
    assert.equal((await cfg('/tool').run({ amount: '10' })).value, '12.00');
    assert.deepEqual(await cfg('/wizard').validate('source', { url: 'ftp://x' }), { errors: { url: 'Use an http or https address.' } });
    assert.equal(await cfg('/wizard').validate('source', { url: 'https://x' }), undefined);
    const notes = [];
    await cfg('/settings').save({}, { notify: { success: m => notes.push(m) } });
    assert.deepEqual(notes, ['Settings saved']);
});
