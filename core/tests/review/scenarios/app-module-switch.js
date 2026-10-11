// Switching modules in a mounted app (#350): the previous module stays under a busy overlay while the next one loads, the bar's current link, the side nav, the breadcrumbs and the
// title follow, focus lands on the new page's h1, and the failure states (a chunk that will not load, a module denied by `can`, a route the module does not have) draw inside the shell.
import { mountApp, defineModule } from '../../../js/app.js';
import { BOUNDARY_FAILED_TEXT } from '../../../js/app/boundary.js';

const page = (heading, text) => host => {
    const h1 = host.ownerDocument.createElement('h1'), p = host.ownerDocument.createElement('pk-card');
    h1.textContent = heading;
    p.setAttribute('heading', 'About this page');
    p.textContent = text;
    host.append(h1, p);
};
const orders = defineModule({
    id: 'orders', title: 'Orders',
    nav: () => [{ id: 'all', title: 'All orders', route: '/' }, { id: 'open', title: 'Open', route: '/open' }],
    routes: [{ path: '/', page: 'custom', config: { mount: page('All orders', 'Every order.') } }, { path: '/open', page: 'custom', config: { mount: page('Open orders', 'Orders still to ship.') } }, { path: '*', page: 'not-found' }],
});
const reports = defineModule({
    id: 'reports', title: 'Reports',
    nav: () => [{ id: 'sales', title: 'Sales', route: '/' }, { id: 'audit', title: 'Audit', route: '/audit' }],
    routes: [{ path: '/', page: 'custom', config: { mount: page('Sales', 'The sales report.') } }, { path: '/audit', page: 'custom', config: { mount: page('Audit', 'Three findings.') } }],
});
const ALERT = 'pk-alert[kind=danger]';
const STATE = '#pk-main pk-empty-state';
// A module is chosen with the module picker (#388): the dropdown in the bar, or on a phone the drawer's first row, opened by the hamburger.
const go = id => [
    { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 500, on: ['phone'] }, { click: '#pk-nav > pk-nav-item:first-child', on: ['phone'] }, { wait: 300, on: ['phone'] },
    { click: 'pk-navbar pk-dropdown [slot=trigger]', on: ['desktop'] }, { wait: 300, on: ['desktop'] }, { shot: `picker-${id}`, on: ['desktop'] },
    { click: `pk-nav-item[data-module=${id}]`, on: ['phone'] }, { click: `pk-navbar pk-menu-item[data-module=${id}]`, on: ['desktop'] },
];

export default {
    name: 'app-module-switch',
    issue: [350],
    elements: ['app-shell', 'navbar', 'side-nav', 'loading-overlay', 'alert', 'empty-state'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/orders');
        // The reports chunk stays "in flight" until the scenario presses r: the loading state is held for as long as the shot needs, whatever the timing of the run.
        const gate = new Promise(resolve => document.addEventListener('keydown', e => { if (e.key === 'r') resolve(reports); }));
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Acme' }, home: 'orders', footer: { links: [{ label: 'A page that is gone', href: '#/orders/gone/for/good' }] },
            modules: [
                { id: 'orders', title: 'Orders', icon: 'orders', load: async () => orders },
                { id: 'reports', title: 'Reports', icon: 'dashboard', load: () => gate },
                { id: 'broken', title: 'Broken', icon: 'error', load: async () => { throw new Error('Failed to fetch dynamically imported module: /modules/broken.js'); } },
                { id: 'payroll', title: 'Payroll', icon: 'finance', can: () => false, load: async () => { throw new Error('never loaded'); } },
            ],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 500 }, { shot: 'start' },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 500, on: ['phone'] }, { click: '#pk-nav > pk-nav-item:first-child', on: ['phone'] }, { wait: 300, on: ['phone'] }, { shot: 'drawer-picker', on: ['phone'] },
        { click: '#pk-nav > pk-nav-item:first-child', on: ['phone'] }, { key: 'Escape', on: ['phone'] }, { wait: 500, on: ['phone'] },
        ...go('reports'), { wait: 700 }, { shot: 'loading' },
        { key: 'r' }, { wait: 1500 }, { shot: 'switched' },
        ...go('broken'), { wait: 1500 }, { shot: 'error' },
        ...go('payroll'), { wait: 600 }, { shot: 'forbidden' },
        ...go('orders'), { wait: 700 },
        { click: 'pk-app-shell > a[slot=footer]' }, { wait: 700 }, { shot: 'not-found' },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        t.exists('main#pk-main');
        t.inViewport('#pk-main');
        t.noOverlap('pk-navbar', '#pk-main');
        t.inViewport('pk-app-bar-search', 1);
        if (t.shot === 'start') {
            t.hasText('#pk-main h1', 'All orders'); t.exists('pk-nav-item[current][href="#/orders"]');
            t.ok(document.querySelectorAll('pk-navbar pk-dropdown:not([slot=actions]):not([hidden])').length === (desktop ? 1 : 0), 'exactly one picker in the bar on desktop, none on a phone');
            t.ok(document.querySelector('pk-navbar pk-dropdown [slot=trigger]')?.textContent.trim() === 'Orders', 'the picker shows the active module');
            t.ok(document.querySelectorAll('#pk-nav > pk-nav-item[data-module]').length === 0, 'the side nav holds no module rows');
        }
        if (t.shot === 'drawer-picker') { t.exists('#pk-nav > pk-nav-item:first-child[expanded] > pk-nav-item[data-module=reports]'); t.inViewport('#pk-nav > pk-nav-item:first-child'); }
        if (t.shot?.startsWith('picker-')) { t.visible('pk-navbar pk-menu-item[data-module=orders]', 'the list'); t.inViewport('pk-navbar pk-menu-item[data-module=payroll]'); }
        if (t.shot === 'loading') {
            t.exists('pk-loading-overlay[busy]');
            t.hasText('#pk-main h1', 'All orders'); // the previous module stays, covered
            t.exists('pk-nav-item[href="#/orders/open"]');
        }
        if (t.shot === 'switched') {
            t.absent('pk-loading-overlay[busy]');
            t.ok(document.querySelector('pk-navbar pk-dropdown [slot=trigger]')?.textContent.trim() === 'Reports' || !desktop, 'the picker shows Reports');
            t.hasText('#pk-main h1', 'Sales');
            t.hasText('pk-breadcrumb', 'Reports');
            t.absent('pk-nav-item[href="#/orders/open"]'); // the section swapped with the module
            t.exists('pk-nav-item[href="#/reports/audit"]');
            t.ok(document.title === 'Reports - Acme', `the document title is "${document.title}"`);
            const h1 = document.querySelector('#pk-main h1');
            t.ok(document.activeElement === h1, `focus is on ${document.activeElement?.localName ?? 'nothing'}, expected the page's h1`);
            t.ok(document.querySelector('[role=status]')?.textContent === 'Reports, page loaded', `the live region says "${document.querySelector('[role=status]')?.textContent}"`);
        }
        if (t.shot === 'error') {
            t.visible(ALERT, 'the error alert');
            t.hasText(ALERT, BOUNDARY_FAILED_TEXT); // a raw import error is not userFacing (#378): the generic text shows, not the fetch detail
            t.visible(`${ALERT} pk-button`, 'Retry');
            t.inViewport(ALERT);
            t.exists('pk-nav-item[href="#/reports/audit"]'); // the previous module stays usable
            t.visible('#pk-main h1');
        }
        if (t.shot === 'forbidden') {
            t.visible(STATE, 'the forbidden state');
            t.ok(t.attr(STATE, 'heading') === 'Not allowed', `the heading is "${t.attr(STATE, 'heading')}"`);
            t.hidden(ALERT, 'the error alert');
            t.hasText('pk-breadcrumb', 'Not allowed');
            t.inViewport(STATE);
        }
        if (t.shot === 'not-found') {
            t.visible(STATE, 'the not-found state');
            t.ok(t.attr(STATE, 'heading') === 'Not found', `the heading is "${t.attr(STATE, 'heading')}"`);
            t.hasText('pk-breadcrumb', 'Orders');
            t.hasText('pk-breadcrumb', 'Not found');
            t.inViewport(STATE);
        }
    },
};
