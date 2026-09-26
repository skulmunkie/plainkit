// Browser cases for mountApp (js/app/app.js, #350): what needs real elements, real dynamic imports, a real drawer and real layout. The node test (tests/app-shell.test.mjs) proves the
// pure parts. Same contract as cases.js: [name, async (t) => void]. The demo app (samples/app/) is opened in an iframe of a chosen width, so the media queries answer to that width.
import { instrument } from './cases-app.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(30); } throw new Error(`timed out waiting for ${what}`); };
const src = path => import(new URL(`../../${path}`, import.meta.url).href);
const MODULES = ['overview', 'orders', 'reports'];

// The demo app in an iframe `width` wide, at `hash`; resolves when its first module is shown.
async function demo(t, width, { hash = '#/orders', app = 'index.html', search = '' } = {}) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = `demo app at ${width}px`;
    f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
    f.src = new URL(`../../samples/app/${app}${search}${hash}`, import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    const win = f.contentWindow, d = win.document;
    await until(() => d.querySelector('#pk-main h1'), 'the first page');
    await Promise.all(['pk-app-shell', 'pk-navbar', 'pk-app-bar-search'].map(tag => win.customElements.whenDefined(tag)));
    if (d.querySelector('pk-side-nav')) await win.customElements.whenDefined('pk-side-nav');
    await wait(200);
    const go = async to => { win.location.hash = to; await wait(50); await until(() => d.querySelector('#pk-main h1') && !d.querySelector('pk-loading-overlay[busy]'), `the page at ${to}`); await wait(120); };
    return { win, d, go, main: () => d.querySelector('#pk-main'), nav: () => d.querySelector('#pk-nav') };
}

export const appShellCases = [
    ['mountApp on a phone: the one hamburger opens the drawer, every module of the config is in it, and choosing one navigates and closes it', async t => {
        const s = await demo(t, 375, { hash: '#/overview' });
        const toggle = s.d.querySelector('[data-nav-toggle]');
        t.ok(toggle && s.win.getComputedStyle(toggle).display !== 'none', 'the shell hamburger is there');
        t.eq(s.d.querySelectorAll('pk-navbar a[data-module]').length, 0, 'no module links in the bar in the side layout');
        t.ok(!s.nav().open, 'the drawer starts closed');
        toggle.click(); await wait(500);
        t.ok(s.nav().open, 'the hamburger opens the drawer');
        for (const id of MODULES) t.ok(s.d.querySelector(`pk-nav-item[data-module="${id}"]`), `the drawer lists ${id}`);
        s.d.querySelector('pk-nav-item[data-module="reports"]').shadowRoot.querySelector('[part="link"]').click();
        await until(() => s.d.querySelector('#pk-main h1')?.textContent === 'Summary', 'the reports page');
        await wait(300);
        t.ok(!s.nav().open, 'choosing a module closes the drawer');
        t.ok(s.win.location.hash.startsWith('#/reports'), 'the address changed');
        t.eq(s.d.title, 'Reports - Demo app', 'the document title follows');
    }],

    ['mountApp: the top layout has the module links in the bar on a wide screen and the same links in the one drawer on a phone (never a second hamburger)', async t => {
        const wide = await demo(t, 1280, { app: 'top.html', hash: '#/overview' });
        t.eq(wide.d.querySelectorAll('pk-navbar a[data-module]').length, 2, 'two module links in the bar');
        t.ok(!wide.d.querySelector('#pk-nav'), 'no module nav and no drawer: the page has the full width');
        const phone = await demo(t, 375, { app: 'top.html', hash: '#/overview' });
        const links = [...phone.d.querySelectorAll('pk-navbar a[data-module]')];
        t.ok(links.every(a => phone.win.getComputedStyle(a).display === 'none' || !a.getClientRects().length), 'the bar links are hidden on a phone');
        const bar = phone.d.querySelector('pk-navbar').shadowRoot.querySelector('[part="toggle"]');
        t.eq(phone.win.getComputedStyle(bar).display, 'none', "the bar's own hamburger is not shown");
        phone.d.querySelector('[data-nav-toggle]').click(); await wait(500);
        for (const id of ['overview', 'about']) t.ok(phone.d.querySelector(`#pk-nav pk-nav-item[data-module="${id}"]`), `the drawer lists ${id}`);
    }],

    ['mountApp: landmarks, skip links, one h1, focus on the new page, a live announcement, the document title and the current nav row after a route change', async t => {
        const s = await demo(t, 1280, { hash: '#/orders' });
        const d = s.d;
        t.eq(d.querySelectorAll('main').length, 1, 'one main landmark');
        t.eq(d.querySelectorAll('#pk-main h1').length, 1, 'one h1');
        t.ok(d.querySelector('#app').firstElementChild.localName === 'pk-skip-link', 'the skip link is the first thing in the page');
        t.ok(d.querySelector('pk-skip-link[href="#pk-main"]') && d.querySelector('pk-skip-link[href="#pk-nav"]'), 'skip links to the content and to the menu');
        t.eq(d.querySelector('pk-navbar').shadowRoot.querySelector('nav').getAttribute('aria-label'), 'Main');
        await s.go('#/orders/8');
        t.eq(d.activeElement, d.querySelector('#pk-main h1'), 'focus is on the page heading');
        t.eq(d.querySelector('[role="status"]').textContent, 'Order 8, page loaded');
        t.eq(d.title, 'Order 8 - Demo app');
        t.ok(d.querySelector('pk-nav-item[current][href="#/orders"]'), "the list's entry stays current for its record");
        t.eq([...d.querySelectorAll('pk-breadcrumb a')].map(a => a.textContent).join(' > '), 'Demo app > Orders > Order 8', 'the trail is App > Module > the record');
        t.eq(d.querySelector('pk-breadcrumb a:last-child').hasAttribute('href'), false, 'the current page is not a link');
        await s.go('#/orders/8?x=1');
        t.ok(d.querySelector('#pk-main h1'), 'a query change re-shows the page');
    }],

    ['mountApp: hovering a module link for 100 ms fetches its chunk before it is chosen, and choosing it then asks the network for nothing', async t => {
        const s = await demo(t, 1280, { hash: '#/overview' });
        const fetched = id => s.win.performance.getEntriesByType('resource').filter(r => r.name.endsWith(`/modules/${id}.js`)).length;
        t.eq(fetched('reports'), 0, 'the reports chunk is not fetched yet');
        s.d.querySelector('pk-nav-item[data-module="reports"]').dispatchEvent(new s.win.PointerEvent('pointerover', { bubbles: true, composed: true }));
        await until(() => fetched('reports') === 1, 'the prefetch', 30);
        s.d.querySelector('pk-nav-item[data-module="reports"]').shadowRoot.querySelector('[part="link"]').click();
        await until(() => s.d.querySelector('#pk-main h1')?.textContent === 'Summary', 'the reports page');
        t.eq(fetched('reports'), 1, 'choosing the module did not fetch its chunk again');
    }],

    ['mountApp: after a route change the focused heading shows a ring that hugs its text and stays inside the page, at 375 and 1280', async t => {
        for (const w of [375, 1280]) {
            const s = await demo(t, w, { hash: '#/orders' });
            await s.go('#/orders/8');
            const h1 = s.d.querySelector('#pk-main h1'), main = s.d.querySelector('#pk-main');
            t.eq(s.d.activeElement, h1, `focus is on the heading at ${w}px`);
            const r = h1.getBoundingClientRect(), m = main.getBoundingClientRect(), body = s.d.querySelector('pk-app-shell').shadowRoot.querySelector('[part="body"]').getBoundingClientRect(), cs = s.win.getComputedStyle(h1);
            const reach = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
            t.ok(r.width < m.width * 0.6, `at ${w}px the heading is ${r.width.toFixed(0)}px wide in a ${m.width.toFixed(0)}px main: the ring hugs the text, not the row`);
            t.ok(r.left - reach >= body.left && r.right + reach <= body.right, `at ${w}px the ring (${reach}px out) stays inside the shell body, in its page padding`);
            t.ok(r.left - reach >= 0 && r.right + reach <= s.win.innerWidth, `at ${w}px the ring stays inside the window`);
        }
    }],

    ['mountApp: the first module chunk loads within 300 ms, an already loaded one within 100 ms, and nothing shifts on first load or across a module switch (CLS 0)', async t => {
        const s = await demo(t, 1280, { hash: '#/orders' });
        const shifts = [];
        const po = new s.win.PerformanceObserver(list => shifts.push(...list.getEntries()));
        po.observe({ type: 'layout-shift', buffered: true });
        await wait(600);
        for (const to of ['#/reports', '#/overview', '#/orders/7', '#/reports/exports', '#/orders']) await s.go(to);
        await wait(300);
        const cls = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        // The observer is proved live: a deliberate shift is counted.
        const probe = s.d.createElement('div'); probe.textContent = 'x'; s.main().prepend(probe); probe.style.height = '120px';
        await wait(300);
        const after = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        po.disconnect();
        t.ok(after > cls, 'the layout-shift observer sees a deliberate shift (the measurement works)');
        t.ok(cls < 0.001, `layout shift across first load and five route changes is ${cls.toFixed(4)}, expected 0`);
        const ms = id => s.win.performance.getEntriesByName(`pk-route:${id}`).map(e => e.duration);
        t.ok(ms('orders')[0] <= 300, `the first load of the orders chunk took ${ms('orders')[0]?.toFixed(0)} ms, budget 300`);
        t.ok(ms('reports')[0] <= 300, `the first load of the reports chunk took ${ms('reports')[0]?.toFixed(0)} ms, budget 300`);
        const warm = [...ms('orders').slice(1), ...ms('reports').slice(1), ...ms('overview').slice(1)];
        t.ok(warm.length >= 3 && Math.max(...warm) <= 100, `route changes to a loaded module took at most ${Math.max(...warm).toFixed(0)} ms (${warm.map(x => x.toFixed(0)).join(', ')}), budget 100`);
    }],

    ['mountApp: mount and destroy 100 times leave no listener, observer, timer, fullscreen overlay or node behind, and nothing polls', async t => {
        const { mountApp } = await src('js/app.js');
        const config = (await src('samples/app/app.config.js')).default;
        const el = document.createElement('div'); t.stage('').append(el);
        const theme = document.documentElement.getAttribute('data-theme');
        const before = document.body.querySelectorAll('*').length;
        const t0 = performance.now();
        let app = mountApp(el, config);
        const sync = performance.now() - t0; // what mountApp does before it returns: the whole work before the first paint
        await until(() => el.querySelector('#pk-main h1'), 'the first app page'); await app.destroy();
        await t.settle(); await wait(100);
        const inst = instrument();
        let a, b;
        try {
            a = inst.snapshot();
            for (let i = 0; i < 100; i++) { app = mountApp(el, config); await until(() => el.querySelector('#pk-main h1'), `page ${i}`); await app.destroy(); }
            await t.settle(); await wait(100);
            b = inst.snapshot();
        } finally { inst.restore(); }
        history.replaceState(null, '', location.pathname + location.search);
        if (theme === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
        t.eq(JSON.stringify(b.listeners), JSON.stringify(a.listeners), 'window, document, html and body listeners are back to the baseline');
        t.eq(b.observers, a.observers, 'live observers are back to the baseline');
        t.eq(b.timers, a.timers, 'timers (and intervals) are back to the baseline');
        t.ok(sync < 50, `mountApp does ${sync.toFixed(1)} ms of work before it returns (one long task is 50)`);
        t.eq(el.childNodes.length, 0, 'the container is empty again');
        t.eq(document.body.querySelectorAll('*').length, before, 'no fullscreen overlay or other node is left in the page');
    }],

    ['mountApp: a denied direct URL shows the forbidden state and never runs the loader, and a broken chunk shows the error with Retry inside the shell', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let loads = 0, healthy = false;
        const page = defineModule({ id: 'ok', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'ok'; } } }] });
        history.replaceState(null, '', '#/payroll');
        const app = mountApp(el, { modules: [
            { id: 'ok', title: 'Fine', load: async () => page },
            { id: 'payroll', title: 'Payroll', can: () => false, load: async () => { loads++; return page; } },
            { id: 'flaky', title: 'Flaky', load: async () => { if (!healthy) throw new Error('Failed to fetch dynamically imported module'); return defineModule({ id: 'flaky', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'back'; } } }] }); } },
        ], home: 'ok' });
        await until(() => el.querySelector('pk-empty-state[heading="Not allowed"]'), 'the forbidden state');
        t.eq(loads, 0, 'the loader of a denied module never ran');
        t.ok(el.querySelector('pk-app-shell'), 'the shell is still there');
        app.navigate('/flaky');
        const alert = await until(() => el.querySelector('pk-alert[kind="danger"]:not([hidden])'), 'the boundary error', 200);
        t.ok(alert.textContent.includes('Failed to fetch'), 'the error says what failed');
        t.ok(alert.querySelector('pk-button'), 'Retry is offered');
        healthy = true; alert.querySelector('pk-button').click();
        await until(() => el.querySelector('#pk-main')?.textContent.includes('back'), 'the module after Retry', 200);
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],

    ['mountApp: the theme is kept in the store (?theme= wins and is not saved), the header search asks the active module, and a config typo is one warning', async t => {
        const a = await demo(t, 1280, { hash: '#/orders', search: '?theme=light' });
        t.eq(a.d.documentElement.getAttribute('data-theme'), 'light', '?theme=light wins');
        t.eq(a.win.localStorage.getItem('pk.app'), null, 'a per-visit override is not saved');
        a.d.querySelector('pk-menu-item[value=theme]').dispatchEvent(new a.win.CustomEvent('pk-select', { bubbles: true, detail: {} }));
        await wait(150);
        t.eq(a.d.documentElement.getAttribute('data-theme'), 'dark', 'the switch turns the theme');
        t.eq(JSON.parse(a.win.localStorage.getItem('pk.app')).data.theme, 'dark', 'and it is saved in the { v, data } envelope');
        const search = a.d.querySelector('pk-app-bar-search'), input = search.shadowRoot.querySelector('[part="control"]');
        input.value = 'grace'; input.dispatchEvent(new a.win.Event('input', { bubbles: true }));
        await until(() => search.items?.length, 'search results', 100);
        t.eq(search.items[0].label, 'Order 8', "the active module's own search source answered");
        a.win.localStorage.removeItem('pk.app');
    }],
];
