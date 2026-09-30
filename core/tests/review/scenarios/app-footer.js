// The app footer and a module's own footer (#373): config.footer is drawn by mountApp, a module's `footer` replaces it while that module is active, `footer: false` draws none
// (the strip is not drawn at all), and going back restores the app footer. Text only; the links are real links with a tap target.
import { mountApp, defineModule } from '../../../js/app.js';

const page = heading => host => { const h1 = host.ownerDocument.createElement('h1'); h1.textContent = heading; host.append(h1); };
const mod = (id, title, extra = {}) => defineModule({ id, title, routes: [{ path: '/', page: 'custom', config: { mount: page(title) } }], ...extra });
const orders = mod('orders', 'Orders');
const billing = mod('billing', 'Billing', { footer: { text: 'Billing is run by Finance', links: [{ label: 'Invoice policy', href: '#/billing/policy' }] } });
const kiosk = mod('kiosk', 'Kiosk', { footer: false });
const go = id => [{ click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { click: `pk-nav-item[data-module=${id}]` }, { wait: 800 }];

export default {
    name: 'app-footer',
    issue: [373],
    elements: ['app-shell'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/orders');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Acme' }, home: 'orders', footer: { text: 'Acme Inc.', links: [{ label: 'Privacy', href: '#/orders' }] },
            modules: [
                { id: 'orders', title: 'Orders', icon: 'orders', load: async () => orders },
                { id: 'billing', title: 'Billing', icon: 'finance', load: async () => billing },
                { id: 'kiosk', title: 'Kiosk', icon: 'dashboard', load: async () => kiosk },
            ],
        });
    },
    steps: [
        { wait: 'settle' }, { shot: 'app' },
        ...go('billing'), { shot: 'module' },
        ...go('kiosk'), { shot: 'none' },
        ...go('orders'), { shot: 'restored' },
    ],
    expect(t) {
        const text = () => document.querySelector('pk-app-shell').textContent;
        t.inViewport('#pk-main');
        if (t.shot === 'app' || t.shot === 'restored') {
            t.exists('pk-app-shell > span[slot=footer]');
            t.ok(text().includes('Acme Inc.') && !text().includes('Finance'), `the app footer shows, got "${text()}"`);
            t.inViewport('pk-app-shell > a[slot=footer]');
        }
        if (t.shot === 'module') {
            t.ok(text().includes('Billing is run by Finance') && !text().includes('Acme Inc.'), `the module footer replaces the app footer, got "${text()}"`);
            t.exists('pk-app-shell > a[slot=footer][href="#/billing/policy"]');
            t.inViewport('pk-app-shell > a[slot=footer]');
        }
        if (t.shot === 'none') t.absent('pk-app-shell > [slot=footer]');
    },
};
