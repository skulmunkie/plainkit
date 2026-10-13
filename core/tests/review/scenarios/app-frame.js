// The app frame from data (#364): header (brand, module picker, search, settings), the side nav, the breadcrumb above the page and the footer, all inside pk-app-frame's
// own shadow tree. Shots: resting; the host moves the current row (the branch stays open, the trail follows); the drawer on a phone.
const nav = [{ id: 'home', title: 'Home', href: '#home', icon: 'home' }, { id: 'orders', title: 'Orders', href: '#orders', badge: 3, children: [{ id: 'open', title: 'Open', href: '#open' }, { id: 'shipped', title: 'Shipped', href: '#shipped' }] }, { id: 'reports', title: 'Reports', href: '#reports' }];
const attr = v => JSON.stringify(v);

export default {
    name: 'app-frame',
    issue: [364],
    elements: ['app-frame'],
    html: `<pk-app-frame id="f" brand="Acme" brand-href="#home" module-title="Sales" current-id="open" search search-placeholder="Search orders" nav='${attr(nav)}' trail='${attr(['orders', 'open'])}' modules='${attr([{ id: 'sales', title: 'Sales', href: '#sales' }, { id: 'support', title: 'Support', href: '#support' }])}' crumbs='${attr([{ label: 'Sales', href: '#sales' }, { label: 'Orders', href: '#orders' }, { label: 'Open' }])}'><main id="pk-main" tabindex="-1"><pk-page-header heading="Open orders"></pk-page-header><p>The page is the default slot.</p></main><span slot="footer">Acme 2026</span></pk-app-frame>`,
    steps: [
        { wait: 'settle' }, { shot: 'resting' },
        { set: '#f', prop: 'currentId', value: 'shipped' }, { set: '#f', prop: 'crumbs', value: [{ label: 'Sales', href: '#sales' }, { label: 'Orders', href: '#orders' }, { label: 'Shipped' }] }, { wait: 'settle' }, { shot: 'moved' },
        { click: '#f >>> pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 'settle', on: ['phone'] }, { shot: 'drawer', on: ['phone'] },
    ],
    expect(t) {
        t.exists('#f >>> pk-navbar');
        t.exists('#f >>> pk-breadcrumb');
        t.inViewport('#pk-main');
        t.noOverlap('#f >>> pk-navbar', '#pk-main');
        t.ok(t.text('#f >>> [part="brand"]') === 'Acme', 'the brand text is drawn');
        if (t.shot === 'resting' && t.viewport.name === 'desktop') {
            t.exists('#f >>> pk-side-nav');
            t.exists('#f >>> pk-nav-item[current]');
            t.exists('#f >>> pk-dropdown[part="picker"]:not([hidden])');
            t.exists('#f >>> [part="footer"]');
        }
        if (t.shot === 'moved') t.ok(t.attr('#f >>> pk-nav-item[current]', 'href') === '#shipped', 'the current row follows currentId');
    },
};
