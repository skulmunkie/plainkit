// Browser cases for mountApp (js/app/app.js, #350): what needs real elements, real dynamic imports, a real drawer and real layout. The node test (tests/app-shell.test.mjs) proves the
// pure parts. Same contract as cases.js: [name, async (t) => void]. The demo app (samples/app/) is opened in an iframe of a chosen width, so the media queries answer to that width.
import { instrument } from './cases-app.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(30); } throw new Error(`timed out waiting for ${what}`); };
// Retries a real-timer, real-Chrome case a few times before failing for real: a case that measures wall-clock budgets (route-change ms,
// CLS across real navigations) can lose a race against a heavily loaded CI runner even when the code under test is correct - same
// reasoning as PageBaseTests' own retry (issue #427/#434). A genuine regression fails every attempt identically and still reports as a
// failure once retries are exhausted, so this never turns a real bug into a pass; each attempt gets a fresh iframe, never reused state.
const retryCase = async (attempt, tries = 3) => {
    for (let i = 1; i <= tries; i++) { try { return await attempt(); } catch (e) { if (i === tries) throw e; } }
};
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
    await until(() => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'the first page');
    await Promise.all(['pk-app-shell', 'pk-navbar', 'pk-app-bar-search'].map(tag => win.customElements.whenDefined(tag)));
    if (d.querySelector('pk-side-nav')) await win.customElements.whenDefined('pk-side-nav');
    await wait(200);
    const go = async to => { win.location.hash = to; await wait(50); await until(() => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])') && !d.querySelector('pk-loading-overlay[busy]'), `the page at ${to}`); await wait(120); };
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
        await until(() => s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])')?.textContent === 'Summary', 'the reports page');
       
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
        t.eq(d.querySelectorAll('#pk-main :is(h1, pk-heading[level="1"])').length, 1, 'one h1');
        t.ok(d.querySelector('#app').firstElementChild.localName === 'pk-skip-link', 'the skip link is the first thing in the page');
        t.ok(d.querySelector('pk-skip-link[href="#pk-main"]') && d.querySelector('pk-skip-link[href="#pk-nav"]'), 'skip links to the content and to the menu');
        t.eq(d.querySelector('pk-navbar').shadowRoot.querySelector('nav').getAttribute('aria-label'), 'Main');
        await s.go('#/orders/8');
        t.eq(d.activeElement, d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'focus is on the page heading');
        t.eq(d.querySelector('[role="status"]').textContent, 'Order 8, page loaded');
        t.eq(d.title, 'Order 8 - Demo app');
        t.ok(d.querySelector('pk-nav-item[current][href="#/orders"]'), "the list's entry stays current for its record");
        t.eq([...d.querySelectorAll('pk-breadcrumb a')].map(a => a.textContent).join(' > '), 'Demo app > Orders > Order 8', 'the trail is App > Module > the record');
        t.eq(d.querySelector('pk-breadcrumb a:last-child').hasAttribute('href'), false, 'the current page is not a link');
        await s.go('#/orders/8?x=1');
        t.ok(d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'a query change re-shows the page');
    }],

    ['mountApp: hovering a module link for 100 ms fetches its chunk before it is chosen, and choosing it then asks the network for nothing', async t => {
        const s = await demo(t, 1280, { hash: '#/overview' });
        const fetched = id => s.win.performance.getEntriesByType('resource').filter(r => r.name.endsWith(`/modules/${id}.js`)).length;
        t.eq(fetched('reports'), 0, 'the reports chunk is not fetched yet');
        s.d.querySelector('pk-nav-item[data-module="reports"]').dispatchEvent(new s.win.PointerEvent('pointerover', { bubbles: true, composed: true }));
        await until(() => fetched('reports') === 1, 'the prefetch', 30);
        s.d.querySelector('pk-nav-item[data-module="reports"]').shadowRoot.querySelector('[part="link"]').click();
        await until(() => s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])')?.textContent === 'Summary', 'the reports page');
        t.eq(fetched('reports'), 1, 'choosing the module did not fetch its chunk again');
    }],

    ['mountApp: a built-in page title is one light-DOM pk-heading level 1 on the page element (slotted into its pk-page-header), a real h1 in its shadow tree, focused after a route change and drawn in the title size', async t => {
        const s = await demo(t, 1280, { hash: '#/orders' });
        await s.go('#/orders/8');
        const title = s.d.querySelectorAll('#pk-main pk-heading[level="1"]');
        t.eq(title.length, 1, 'one level-1 title');
        t.eq(s.d.querySelectorAll('#pk-main h1').length, 0, 'no raw h1 beside it');
        const h = title[0], page = h.parentElement, header = page.shadowRoot.querySelector('pk-page-header'), inner = h.shadowRoot.querySelector('h1');
        t.ok(inner, 'its shadow tree holds a real h1');
        t.ok(header && h.assignedSlot, 'the page element forwards it into its pk-page-header');
        t.eq(h.getAttribute('slot'), 'title', 'in the title slot');
        t.eq(h.getAttribute('tabindex'), '-1', 'focusable by script only');
        t.eq(s.d.activeElement, h, 'focus is on the title');
        t.ok(header.shadowRoot.querySelector('[role="heading"]')?.hidden !== false, 'the header shows no second heading of its own');
        const fs = parseFloat(s.win.getComputedStyle(inner).fontSize), root = parseFloat(s.win.getComputedStyle(s.d.documentElement).fontSize);
        t.ok(Math.abs(fs - 1.17 * root) < 1, `the title is in the h3 title size (${fs}px)`);
        const r = h.getBoundingClientRect(), hr = header.getBoundingClientRect();
        t.ok(r.top >= hr.top && r.bottom <= hr.bottom && r.height > 0, 'the title sits inside the header');
    }],

    ['mountApp: after a route change the focused heading shows a ring that hugs its text and stays inside the page, at 375 and 1280', async t => {
        for (const w of [375, 1280]) {
            const s = await demo(t, w, { hash: '#/orders' });
            await s.go('#/orders/8');
            const h1 = s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), main = s.d.querySelector('#pk-main');
            t.eq(s.d.activeElement, h1, `focus is on the heading at ${w}px`);
            const r = h1.getBoundingClientRect(), m = main.getBoundingClientRect(), body = s.d.querySelector('pk-app-shell').shadowRoot.querySelector('[part="body"]').getBoundingClientRect(), cs = s.win.getComputedStyle(h1);
            const reach = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
            t.ok(r.width < m.width * 0.6, `at ${w}px the heading is ${r.width.toFixed(0)}px wide in a ${m.width.toFixed(0)}px main: the ring hugs the text, not the row`);
            t.ok(r.left - reach >= body.left && r.right + reach <= body.right, `at ${w}px the ring (${reach}px out) stays inside the shell body, in its page padding`);
            t.ok(r.left - reach >= 0 && r.right + reach <= s.win.innerWidth, `at ${w}px the ring stays inside the window`);
        }
    }],

    ['mountApp: the first module chunk loads within 300 ms, an already loaded one within 100 ms, and nothing shifts on first load or across a module switch (CLS 0)', async t => retryCase(async () => {
        const s = await demo(t, 1280, { hash: '#/orders' });
        const shifts = [];
        const po = new s.win.PerformanceObserver(list => shifts.push(...list.getEntries()));
        po.observe({ type: 'layout-shift', buffered: true });
        await wait(600);
        for (const to of ['#/reports', '#/overview', '#/orders/7', '#/reports/exports', '#/orders']) await s.go(to);
       
        const cls = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        // The observer is proved live: a deliberate shift is counted.
        const probe = s.d.createElement('div'); probe.textContent = 'x'; s.main().prepend(probe); probe.style.height = '120px';
        // The entry arrives after the next frame: wait for it (a busy machine is late), not a fixed 300 ms.
        await until(() => shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0) > cls, 'the layout-shift observer to report the deliberate shift', 200);
        const after = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        po.disconnect();
        t.ok(after > cls, 'the layout-shift observer sees a deliberate shift (the measurement works)');
        t.ok(cls < 0.001, `layout shift across first load and five route changes is ${cls.toFixed(4)}, expected 0`);
        const ms = id => s.win.performance.getEntriesByName(`pk-route:${id}`).map(e => e.duration);
        t.ok(ms('orders')[0] <= 300, `the first load of the orders chunk took ${ms('orders')[0]?.toFixed(0)} ms, budget 300`);
        t.ok(ms('reports')[0] <= 300, `the first load of the reports chunk took ${ms('reports')[0]?.toFixed(0)} ms, budget 300`);
        const warm = [...ms('orders').slice(1), ...ms('reports').slice(1), ...ms('overview').slice(1)];
        t.ok(warm.length >= 3 && Math.max(...warm) <= 100, `route changes to a loaded module took at most ${Math.max(...warm).toFixed(0)} ms (${warm.map(x => x.toFixed(0)).join(', ')}), budget 100`);
    })],

    ['mountApp: mount and destroy 100 times leave no listener, observer, timer, fullscreen overlay or node behind, and nothing polls', async t => {
        const { mountApp } = await src('js/app.js');
        const config = (await src('samples/app/app.config.js')).default;
        const el = document.createElement('div'); t.stage('').append(el);
        const theme = document.documentElement.getAttribute('data-theme');
        const before = document.body.querySelectorAll('*').length;
        const t0 = performance.now();
        let app = mountApp(el, config);
        const sync = performance.now() - t0; // what mountApp does before it returns: the whole work before the first paint
        await until(() => el.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'the first app page'); await app.destroy();
        await t.settle(); await wait(100);
        const inst = instrument();
        let a, b;
        try {
            a = inst.snapshot();
            for (let i = 0; i < 100; i++) { app = mountApp(el, config); await until(() => el.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), `page ${i}`); await app.destroy(); }
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
        const { BOUNDARY_FAILED_TEXT } = await src('js/app/boundary.js');
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
        t.ok(alert.textContent.includes(BOUNDARY_FAILED_TEXT), 'a raw import error is not userFacing (#378): the generic text shows, not the fetch detail');
        t.ok(alert.querySelector('pk-button'), 'Retry is offered');
        healthy = true; alert.querySelector('pk-button').click();
        await until(() => el.querySelector('#pk-main')?.textContent.includes('back'), 'the module after Retry', 200);
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],

    // #859: the boundary's own states (not found, forbidden, a module that fails to start) are a page the reader lands on, so focus after navigation must land on a heading, not <main>.
    ['mountApp: the boundary states not found, forbidden and error each give exactly one focusable level 1 heading, focused after navigation and drawn once', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const page = defineModule({ id: 'ok', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'ok'; } } }] });
        history.replaceState(null, '', '#/ok');
        const app = mountApp(el, { modules: [
            { id: 'ok', title: 'Fine', load: async () => page },
            { id: 'payroll', title: 'Payroll', can: () => false, load: async () => page },
            { id: 'throws', title: 'Throws', load: async () => defineModule({ id: 'throws', mount() { throw new Error('boom'); } }) },
        ], home: 'ok' });
        const main = () => el.querySelector('#pk-main');
        await until(() => main()?.textContent.includes('ok'), 'the first page', 200);
        const check = async (what, path, heading, ready) => {
            app.navigate(path);
            await until(ready, `the ${what} state`, 200);
            await wait(150);
            const found = main().querySelectorAll('h1,pk-heading[level="1"]');
            t.eq(found.length, 1, `${what}: exactly one level 1 heading under main`);
            const h = found[0], state = h.closest('pk-empty-state');
            t.ok(state, `${what}: it is the state's own heading`); t.eq(h.textContent.trim(), heading, `${what}: the heading text`);
            t.eq(h.getAttribute('tabindex'), '-1', `${what}: focusable by script`);
            t.eq(document.activeElement, h, `${what}: focus is on the heading, not <main>`);
            t.eq(h.getAttribute('slot'), 'heading', `${what}: it fills the state's heading slot, so the heading is drawn once`);
            const mine = state.shadowRoot.querySelector('slot[name="heading"]').assignedElements({ flatten: true });
            t.ok(mine.includes(h) && state.shadowRoot.querySelector('[part="heading"]').getBoundingClientRect().height > 0, `${what}: drawn in the heading position of the state`);
        };
        await check('forbidden', '/payroll', 'Not allowed', () => main()?.querySelector('pk-empty-state'));
        await check('not found', '/ok/nothing-here', 'Not found', () => main()?.querySelector('pk-empty-state[heading="Not found"]'));
        app.navigate('/ok'); await until(() => main()?.textContent.includes('ok') && !main().querySelector('pk-empty-state'), 'the module again', 200);
        await check('error', '/throws', 'Nothing to show', () => main()?.querySelector('pk-empty-state[heading="Nothing to show"]'));
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

    ['mountApp: ctx.search reaches the active module, and its subscribers end with the module (nothing is called after a switch)', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const got = { a: [], b: [] };
        const mod = id => defineModule({ id, routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = id; } } }], mount: ctx => { ctx.search.subscribe(q => got[id].push(q)); } });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => mod('a') }, { id: 'b', title: 'B', load: async () => mod('b') }], search: { placeholder: 'Find' } });
        await until(() => el.querySelector('#pk-main')?.textContent.includes('a'), 'module a');
        const search = el.querySelector('pk-app-bar-search'), input = search.shadowRoot.querySelector('[part="control"]');
        const type = async text => { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(400); };
        await type('one');
        t.eq(JSON.stringify(got.a), '["one"]', 'module a heard the query');
        t.eq(app.navigate('/b'), true);
        await until(() => el.querySelector('#pk-main')?.textContent.includes('b'), 'module b');
        await type('two');
        t.eq(JSON.stringify(got.a), '["one"]', 'module a is not called after it was left');
        t.eq(JSON.stringify(got.b), '["two"]', 'module b hears the query');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    ['mountApp: ctx.tasks shows a running task as a toast in the bottom-end stack of the shell, and leaving the module cancels a cancellable one', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let ctxA, aborted = false;
        const a = defineModule({ id: 'a', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'a'; } } }], mount: ctx => { ctxA = ctx; } });
        const b = defineModule({ id: 'b', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'b'; } } }] });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => a }, { id: 'b', title: 'B', load: async () => b }] });
        await until(() => el.querySelector('#pk-main')?.textContent.includes('a'), 'module a');
        const handle = ctxA.tasks.run({ title: 'Importing', cancellable: true, run: ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); })) });
        const stack = el.querySelector('pk-toast-stack[position="bottom-end"]');
        await until(() => stack.querySelector('pk-toast'), 'the task toast');
        t.ok(stack.querySelector('pk-toast').getAttribute('heading') === 'Importing', 'the toast carries the title, in the shell stack');
        app.navigate('/b');
        await until(() => el.querySelector('#pk-main')?.textContent.includes('b'), 'module b');
        await handle.promise;
        t.ok(aborted && handle.state === 'cancelled', 'leaving the module cancelled its cancellable task');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    // #699: the routed list-page + record-page template. Two routes, a row click navigates, Save navigates back, and focus follows to the new page's h1 each time.
    ['routed-pair template (#699): list -> record -> save -> list is route changes only, focus lands on each page\'s h1, unsaved edits mark the record dirty and the saved change shows in the list', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'routed pair template'; f.style.cssText = 'width:1280px;height:800px;border:0;display:block';
        f.src = new URL('../../samples/templates/routed-pair/routed-pair.html#/things', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const win = f.contentWindow, d = win.document;
        const h1 = () => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])');
        const settle = async what => { await until(() => h1() && !d.querySelector('pk-loading-overlay[busy]'), what); await wait(150); };
        const deep = (root, sel) => { const hit = root.querySelector?.(sel); if (hit) return hit; for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) { const h = deep(el.shadowRoot, sel); if (h) return h; } return null; };
        const bodyRows = () => deep(d, 'pk-table')?.shadowRoot?.querySelectorAll('tbody tr[data-pk-context]') ?? [];
        await settle('the list page'); await until(() => bodyRows().length > 1, 'the list rows');
        t.eq(h1().textContent.trim(), 'Things', 'the list page has its h1'); t.eq(bodyRows().length, 10, 'the first page of ten rows');
        // A row click is a route change to the record page: its own page, its own h1, focus on it.
        bodyRows()[2].click();
        await until(() => win.location.hash === '#/things/3', 'the record route'); await settle('the record page');
        t.eq(d.activeElement, h1(), 'focus is on the record heading'); t.ok(!deep(d, 'pk-list-page'), 'the list page is not on screen beside the record');
        const rec = await until(() => deep(d, 'pk-record-page'), 'the record page'); await until(() => rec.part('edit') && !rec.part('edit').hidden, 'the Edit button');
        rec.part('edit').click(); await until(() => rec.controls().length, 'the form'); await wait(400);
        const input = rec.controls()[0];
        t.ok(!rec.dirty, 'nothing edited: not dirty'); input.value = 'Renamed thing'; input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
        await until(() => rec.dirty, 'the dirty flag');
        await wait(150); t.ok(rec.controls()[0] === input && input.value === 'Renamed thing', 'the first edit does not rebuild the form under the reader');
        rec.part('save').click();
        await until(() => win.location.hash === '#/things', 'Save to navigate back to the list'); await settle('the list after Save');
        t.eq(d.activeElement, h1(), 'focus is on the list heading again'); await until(() => bodyRows().length > 1, 'the list rows again');
        t.ok([...bodyRows()].some(r => r.textContent.includes('Renamed thing')), 'the saved name shows in the list');
    }],
    // #872: the record page asks before an in-app leave with unsaved edits. A link and back are asked; Stay keeps the edits, the address and the page; Leave goes; Save then navigating is not asked.
    ['routed-pair template (#872): unsaved edits ask before an in-app link or back; Stay keeps the edits and the address, Leave goes, Save does not ask', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'routed pair leave guard'; f.style.cssText = 'width:1280px;height:800px;border:0;display:block';
        f.src = new URL('../../samples/templates/routed-pair/routed-pair.html#/things', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const win = f.contentWindow, d = win.document;
        const h1 = () => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])');
        const deep = (root, sel) => { const hit = root.querySelector?.(sel); if (hit) return hit; for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) { const h = deep(el.shadowRoot, sel); if (h) return h; } return null; };
        const dialog = () => [...d.querySelectorAll('pk-dialog')].find(x => x.open);
        const button = label => [...(dialog()?.querySelectorAll('pk-button') ?? [])].find(b => b.textContent.trim() === label);
        const edit = async () => {
            const rec = await until(() => deep(d, 'pk-record-page'), 'the record page'); await until(() => rec.part('edit') && !rec.part('edit').hidden, 'the Edit button');
            rec.part('edit').click(); await until(() => rec.controls().length, 'the form'); await wait(400);
            const input = rec.controls()[0]; input.value = 'Unsaved name'; input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
            await until(() => rec.dirty, 'the dirty flag'); return { rec, input };
        };
        await until(() => h1() && !d.querySelector('pk-loading-overlay[busy]'), 'the list');
        win.location.hash = '#/things/3'; await until(() => deep(d, 'pk-record-page') && h1()?.textContent.includes('3'), 'the record page');
        let { rec, input } = await edit();
        const link = () => deep(d, 'a[href="#/things"]');
        t.ok(link(), 'the list is linked from the page');
        const answer = async (trigger, label, what) => {
            trigger(); await until(dialog, `the leave dialog (${what})`);
            (await until(() => button(label), `the ${label} button`)).click(); await until(() => !d.querySelector('pk-dialog'), `the dialog to close (${what})`); await wait(0); // one task: the answer's promise chain (the guard's) settles
        };
        await answer(() => link().click(), 'Stay', 'link');
        t.eq(win.location.hash, '#/things/3', 'Stay keeps the address'); t.ok(deep(d, 'pk-record-page') === rec && rec.controls()[0] === input && input.value === 'Unsaved name', 'Stay keeps the page and the edits'); t.ok(rec.dirty);
        t.ok(d.activeElement && d.activeElement !== d.body, 'focus went back into the page after Stay');
        // Back/forward: a script cannot traverse history without a user gesture (Chrome skips entries made without one), so the browser's own two events are replayed after moving the address.
        await answer(() => { win.history.replaceState(null, '', '#/things'); for (const type of ['popstate', 'hashchange']) win.dispatchEvent(new win.Event(type)); t.eq(win.location.hash, '#/things/3', 'the address is restored while asking'); }, 'Stay', 'back');
        t.ok(deep(d, 'pk-record-page') === rec && input.value === 'Unsaved name', 'Stay after back keeps the edits'); t.eq(win.location.hash, '#/things/3');
        await answer(() => link().click(), 'Leave', 'leave');
        await until(() => win.location.hash === '#/things' && !deep(d, 'pk-record-page'), 'Leave to go to the list'); await until(() => h1()?.textContent.trim() === 'Things', 'the list heading');
        await wait(300); t.eq(d.activeElement, h1(), 'focus is on the list heading after leaving');
        win.location.hash = '#/things/4'; await until(() => deep(d, 'pk-record-page') && h1()?.textContent.includes('4'), 'record 4');
        ({ rec } = await edit()); rec.part('save').click();
        await until(() => win.location.hash === '#/things' && !deep(d, 'pk-record-page'), 'Save to navigate back'); t.ok(!dialog(), 'no question after Save');
    }],
    // #873: selection on a routed list page: the pk-select detail reaches the page, a bulk action gets the selection, and the list reloads with the result.
    ['routed-pair template (#873): selecting rows on the routed list raises pk-select on the page, the Archive bulk action runs with the ids and the list reloads with them archived and the selection cleared', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'routed pair template'; f.style.cssText = 'width:1280px;height:800px;border:0;display:block';
        f.src = new URL('../../samples/templates/routed-pair/routed-pair.html#/things', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const d = f.contentWindow.document;
        const deep = (root, sel) => { const hit = root.querySelector?.(sel); if (hit) return hit; for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) { const h = deep(el.shadowRoot, sel); if (h) return h; } return null; };
        const page = await until(() => deep(d, 'pk-list-page'), 'the list page'), events = [];
        page.addEventListener('pk-select', e => events.push(e.detail));
        const table = () => deep(d, 'pk-table'), bar = () => table().shadowRoot.querySelector('[part="bulk"]');
        await until(() => table()?.shadowRoot?.querySelector('[data-select="1"]'), 'the selectable rows');
        t.ok(bar().hidden, 'no bulk bar before a selection');
        table().shadowRoot.querySelector('[data-select="1"]').click(); await t.settle();
        table().shadowRoot.querySelector('[data-select="2"]').click(); await t.settle();
        t.eq(events.at(-1).selected.join(), '1,2', 'the page hears the selected ids'); t.eq(events.at(-1).scope, 'page'); t.eq(events.at(-1).query.pageSize, 10, 'with the query');
        t.ok(!bar().hidden, 'the bulk bar shows');
        const archive = page.part('bulk').querySelector('pk-button'); t.eq(archive.textContent, 'Archive');
        archive.click();
        await until(() => [...table().shadowRoot.querySelectorAll('tbody tr')].slice(0, 2).every(r => r.textContent.includes('Archived')) && bar().hidden, 'the reloaded list: rows 1 and 2 archived, selection cleared');
    }],
];
