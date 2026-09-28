// The app shell mountApp builds (#350): the bar, the module's own side nav, the breadcrumbs, the header search, the settings menu, the footer and the landmarks, in the resting state and
// with the nav collapsed or open as a drawer, the search open and the settings menu open. Nothing in the markup is ours: the scenario only mounts the app with a config, like a consumer.
// The default layout: the module list is the side nav, the active module a section holding its own entries. The nav is structure (three destinations); an order is a record route under the list, so the list's entry stays current and the crumbs read Acme > Orders > Order 8.
import { mountApp, defineModule } from '../../../js/app.js';

const page = (heading, text) => host => {
    const h1 = host.ownerDocument.createElement('h1'), p = host.ownerDocument.createElement('pk-card');
    h1.textContent = heading;
    p.setAttribute('heading', 'About this page');
    p.textContent = text;
    host.append(h1, p);
};
const orders = defineModule({
    id: 'orders', title: 'Orders',
    nav: () => [{ id: 'all', title: 'All orders', route: '/', icon: 'orders' }, { id: 'open', title: 'Open', route: '/open' }, { id: 'archive', title: 'Archive', route: '/archive', badge: 12 }],
    search: query => [7, 8, 9].filter(n => `order ${n}`.includes(query.toLowerCase())).map(n => ({ id: String(n), label: `Order ${n}`, sub: 'Open', route: `/${n}` })),
    routes: [
        { path: '/', label: 'All orders', page: 'custom', config: { mount: page('All orders', 'Every order.') }, children: [{ path: '/:id', label: p => `Order ${p.id}`, page: 'custom', config: ({ params }) => ({ mount: page(`Order ${params.id}`, `The details of order ${params.id}.`) }) }] },
        { path: '/open', label: 'Open', page: 'custom', config: { mount: page('Open orders', 'Orders still to ship.') } },
        { path: '/archive', label: 'Archive', page: 'custom', config: { mount: page('Archive', 'Old orders.') } },
    ],
});
const overview = defineModule({ id: 'overview', title: 'Overview', routes: [{ path: '/', page: 'custom', config: { mount: page('Overview', 'No menu here: the page has the full width.') } }] });

const BAR = 'pk-navbar';
const HEADER = 'pk-app-shell >>> [part=header]';
const FOOTER = 'pk-app-shell >>> [part=footer]';

export default {
    name: 'app-shell',
    issue: [350, 448],
    elements: ['app-shell', 'navbar', 'side-nav', 'app-bar-search'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/orders/8');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Acme' }, home: 'orders',
            modules: [{ id: 'orders', title: 'Orders', icon: 'orders', load: async () => orders }, { id: 'overview', title: 'Overview', icon: 'document', load: async () => overview }],
            search: { placeholder: 'Search orders' }, footer: { text: 'Acme Inc.', links: [{ label: 'Privacy', href: '/privacy.html' }] },
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 500 }, { shot: 'idle' },
        { click: '#pk-nav >>> [part=collapse]', on: ['desktop'] }, { wait: 400, on: ['desktop'] }, { shot: 'nav-collapsed', on: ['desktop'] },
        { click: '#pk-nav >>> [part=collapse]', on: ['desktop'] }, { wait: 400, on: ['desktop'] },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 500, on: ['phone'] }, { shot: 'nav-open', on: ['phone'] },
        { key: 'Escape', on: ['phone'] }, { wait: 400, on: ['phone'] },
        { click: 'pk-app-bar-search >>> [part=expand]', on: ['phone'] }, { wait: 300, on: ['phone'] },
        { click: 'pk-app-bar-search >>> [part=control]' }, { type: 'order' }, { wait: 700 }, { shot: 'search-open' },
        { key: 'Escape' }, { key: 'Escape' }, { wait: 300 },
        { click: 'pk-dropdown pk-button' }, { wait: 400 }, { shot: 'settings-menu' },
        { key: 'Escape' }, { wait: 300 },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 500, on: ['phone'] },
        { click: 'pk-nav-item[data-module=overview]' }, { wait: 800 }, { shot: 'module-chosen' },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        t.exists('main#pk-main');
        t.exists('#pk-main h1');
        t.absent('main#pk-main main');
        t.exists('pk-skip-link');
        const h = t.rect(HEADER), f = t.rect(FOOTER);
        if (h) t.ok(Math.abs(h.y) <= 1, `the header starts at y=${Math.round(h.y)}, expected the top of the window`);
        if (f) t.ok(Math.abs(f.bottom - t.viewport.height) <= 1, `the footer ends at y=${Math.round(f.bottom)}, expected the bottom of the ${t.viewport.height}px window`);
        t.hasText('pk-app-shell [slot=footer]', 'Acme Inc.');
        t.inViewport('pk-app-bar-search', 1);
        if (t.shot === 'idle') {
            t.hasText('pk-breadcrumb', 'Acme');
            t.hasText('pk-breadcrumb', 'Orders');
            t.hasText('pk-breadcrumb', 'Order 8');
            t.absent('pk-breadcrumb a[href$="/orders/8"]'); // the current page is not a link
            t.exists('pk-nav-item[current][href="#/orders"]'); // the list's entry stays current for its record
            t.exists('pk-nav-item[expanded], pk-nav-item[current]');
            t.absent('pk-loading-overlay[busy]');
            t.ok(document.title === 'Order 8 - Acme', `the document title is "${document.title}"`);
            t.noOverlap(BAR, '#pk-main');
            t.inViewport('#pk-main');
            t.visible('pk-app-bar-search');
            t.absent('pk-navbar a[data-module]'); // the default layout keeps the modules out of the bar
            t.hidden('pk-navbar >>> [part=toggle]', "the bar's own hamburger (the shell has the one menu control)");
            t.exists('pk-nav-item[data-module=overview][href="#/overview"]');
            t.exists('pk-nav-item[data-module=orders][expanded]'); // the active module is a section holding its own entries
            if (desktop) t.hidden('pk-button[data-nav-toggle]', 'the hamburger (the side nav has its own collapse chevron, #448)'); else t.visible('pk-button[data-nav-toggle]', 'the hamburger (opens the drawer)');
            if (desktop) t.visible('#pk-nav >>> [part=collapse]', 'the one collapse control');
            if (desktop) { t.visible('#pk-nav'); t.atLeast('#pk-nav', 'width', 150); t.sameRow('pk-navbar a[slot=brand]', 'pk-app-bar-search'); t.visible('pk-nav-item[data-module=overview]'); }
            else t.hidden('#pk-nav', 'the nav (a drawer, closed)');
        }
        if (t.shot === 'nav-collapsed') { t.visible('#pk-nav'); t.ok(t.rect('#pk-nav')?.width < 100, 'the nav is an icon rail'); t.hidden('pk-button[data-nav-toggle]', 'no second collapse control'); t.visible('#pk-nav >>> [part=collapse]'); t.visible('#pk-main'); }
        if (t.shot === 'nav-open') {
            t.visible('#pk-nav', 'the drawer');
            t.inViewport('#pk-nav');
            t.hasText('#pk-nav', 'Overview'); // every module is listed, the active one holds its own entries
            t.hasText('#pk-nav', 'Orders');
            t.hasText('#pk-nav', 'All orders');
            t.exists('#pk-nav pk-nav-item[current][href="#/orders"]');
            // #385: no empty band (the desktop place of the rail chevron, hidden here) above the first row of the drawer.
            const nav = t.rect('#pk-nav'), first = t.rect('#pk-nav pk-nav-item');
            if (nav && first) t.ok(first.y - nav.y <= 16, `the drawer's first row starts ${Math.round(first.y - nav.y)}px below its top (an empty band); expected within 16px`);
        }
        if (t.shot === 'search-open') {
            t.visible('pk-app-bar-search >>> [part=popup]', 'the results');
            t.hasText('pk-app-bar-search >>> [part=popup]', 'Order 7');
            t.inViewport('pk-app-bar-search >>> [part=popup]');
        }
        if (t.shot === 'module-chosen') {
            t.hasText('#pk-main h1', 'Overview');
            t.exists('pk-nav-item[current][data-module=overview]');
            t.ok(document.title === 'Overview - Acme', `the document title is "${document.title}"`);
            if (!desktop) t.hidden('#pk-nav', 'the drawer (closed after choosing a module)');
        }
        if (t.shot === 'settings-menu') {
            t.visible('pk-menu-item[value=theme]', 'the theme switch');
            t.ok(/theme/i.test(t.text('pk-menu-item[value=theme]')), 'the theme switch says which theme it turns on');
            t.inViewport('pk-menu-item[value=theme]');
        }
    },
};
