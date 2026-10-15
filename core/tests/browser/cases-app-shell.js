// Browser cases for mountApp (js/app/app.js, #350): what needs real elements, real dynamic imports, a real drawer and real layout. The node test (tests/app-shell.test.mjs) proves the
// pure parts. Same contract as cases.js: [name, async (t) => void]. The demo app (samples/app/) is opened in an iframe of a chosen width, so the media queries answer to that width.
import { instrument } from './cases-app.js';

import { wait, until as poll } from './wait.js';
const until = (fn, what, tries = 100) => poll(fn, what, { tries });
import { cpuScale } from './cpu-scale.js';
// Retries a real-timer, real-Chrome case a few times before failing for real: a case that measures wall-clock budgets (route-change ms,
// CLS across real navigations) can lose a race against a heavily loaded CI runner even when the code under test is correct - same
// reasoning as PageBaseTests' own retry (issue #427/#434). A genuine regression fails every attempt identically and still reports as a
// failure once retries are exhausted, so this never turns a real bug into a pass; each attempt gets a fresh iframe, never reused state.
const retryCase = async (attempt, tries = 3) => {
    for (let i = 1; i <= tries; i++) { try { return await attempt(); } catch (e) { if (i === tries) throw e; } }
};
// The waterfall of the module requests (#1247), counted from the graph and not from the clock. A file named in a <link rel=modulepreload> is fetched at once (level 1); any other file
// is found only when an importer (static or dynamic) has arrived, so it is one level deeper than its shallowest importer among the files loaded before the page drew. The result is the
// number of sequential round trips the first page needs, the same on a fast and a starved machine.
const requestDepth = async (win, until = Infinity) => {
    const rs = win.performance.getEntriesByType('resource').filter(e => /\.js(\?|$)/.test(e.name) && e.initiatorType !== 'fetch' && e.startTime <= until), urls = new Set(rs.map(r => r.name)), hinted = new Set([...win.document.querySelectorAll('link[rel=modulepreload]')].map(l => l.href)), level = new Map(), parents = new Map();
    for (const r of rs) {
        if (hinted.has(r.name)) level.set(r.name, 1);
        const text = await (await win.fetch(r.name)).text();
        for (const m of text.matchAll(/(?:\bfrom|\bimport\s*\(?|^\s*import)\s*['"](\.[^'"]+)['"]/gm)) {
            const to = new URL(m[1], r.name).href;
            if (urls.has(to) && to !== r.name) parents.set(to, [...(parents.get(to) ?? []), r.name]);
        }
    }
    for (let changed = true; changed;) {
        changed = false;
        for (const u of urls) {
            const via = (parents.get(u) ?? []).filter(p => level.has(p)).map(p => level.get(p) + 1), best = via.length ? Math.min(...via) : (parents.has(u) ? Infinity : 1);
            if (best < (level.get(u) ?? Infinity)) { level.set(u, best); changed = true; }
        }
    }
    const deep = [...level].sort((a, b) => b[1] - a[1]);
    return { depth: Math.max(0, ...level.values()), count: rs.length, preloaded: rs.filter(r => hinted.has(r.name)).length, deepest: deep.slice(0, 3).map(([u, l]) => `${l}:${u.split('/').slice(-2).join('/')}`) };
};
const src = path => import(new URL(`../../${path}`, import.meta.url).href);
const MAX_FIRST_PAGE_DEPTH = 3;
const MODULES = ['overview', 'orders', 'reports'];

// What the page looked like when a wait gave up: tells a missing route from a missing import from a slow machine (#1359).
const dump = (win, d) => ({ hash: win.location.hash, ready: d.readyState, alert: d.querySelector('pk-alert[kind="danger"]:not([hidden])')?.textContent.slice(0, 200), busy: !!d.querySelector('pk-loading-overlay[busy]'), shell: !!d.querySelector('pk-app-shell'), navItems: d.querySelectorAll('pk-nav-item').length, main: (d.querySelector('#pk-main')?.innerHTML ?? 'no #pk-main').slice(0, 300), text: (d.body?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200) });

// The demo app in an iframe `width` wide, at `hash`; resolves when its first module is shown.
async function demo(t, width, { hash = '#/orders', app = 'index.html', search = '' } = {}) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = `demo app at ${width}px`;
    f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
    f.src = new URL(`../../samples/app/${app}${search}${hash}`, import.meta.url).href;
    await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
    const win = f.contentWindow, d = win.document;
    // The wait outlasts the app's own load budget (host.js: a 10 s import, one retry after 300 ms, a second 10 s), so a module that cannot load shows as the app's own boundary error
    // ("Could not load ...") with its message, not as this wait giving up first on a starved machine; and the boundary's heading is not mistaken for a page.
    try {
        await until(() => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'the first page', 700);
        if (d.querySelector('pk-alert[kind="danger"]:not([hidden])')) throw new Error('the first page is the boundary error');
    } catch (e) { throw new Error(`${e.message} ${JSON.stringify(dump(win, d))}`); }
    const drawnAt = win.performance.now();
    await Promise.all(['pk-app-shell', 'pk-navbar', 'pk-app-bar-search'].map(tag => win.customElements.whenDefined(tag)));
    if (d.querySelector('pk-side-nav')) await win.customElements.whenDefined('pk-side-nav');
    await wait(200);
    const go = async to => { win.location.hash = to; await wait(50); await until(() => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])') && !d.querySelector('pk-loading-overlay[busy]'), `the page at ${to}`); await wait(120); };
    return { win, d, go, drawnAt, main: () => d.querySelector('#pk-main'), nav: () => d.querySelector('#pk-nav') };
}

export const appShellCases = [
    ['mountApp on a phone: the one hamburger opens the drawer, every module of the config is in it, and choosing one navigates and closes it', async t => {
        const s = await demo(t, 375, { hash: '#/overview' });
        const toggle = s.d.querySelector('[data-nav-toggle]');
        t.ok(toggle && s.win.getComputedStyle(toggle).display !== 'none', 'the shell hamburger is there');
        t.ok(s.d.querySelector('pk-navbar pk-dropdown').hidden, 'no picker in the bar on a phone: it is in the drawer');
        t.ok(!s.nav().open, 'the drawer starts closed');
        toggle.click(); await until(() => s.nav().open, 'the drawer to open');
        t.ok(s.nav().open, 'the hamburger opens the drawer');
        const picker = s.nav().firstElementChild;
        t.ok(picker.querySelector(':scope > pk-nav-item[data-module="reports"]'), 'the first row of the drawer is the picker, holding the modules');
        picker.shadowRoot.querySelector('[part="link"]').click(); await until(() => picker.expanded, 'the picker to expand');
        t.ok(picker.expanded, 'tapping the picker opens the module list in place');
        for (const id of MODULES) t.ok(s.d.querySelector(`pk-nav-item[data-module="${id}"]`), `the drawer lists ${id}`);
        s.d.querySelector('pk-nav-item[data-module="reports"]').shadowRoot.querySelector('[part="link"]').click();
        await until(() => s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])')?.textContent === 'Summary', 'the reports page');
       
        t.ok(!s.nav().open, 'choosing a module closes the drawer');
        t.ok(s.win.location.hash.startsWith('#/reports'), 'the address changed');
        t.eq(s.d.title, 'Reports - Demo app', 'the document title follows');
    }],

    ['mountApp module picker (#388) on a desktop: one picker showing the active title, it lists the modules, choosing one repaints the side nav to that module\'s own tree and the route, a deep link restores it, and the keyboard operates it', async t => {
        const s = await demo(t, 1280, { hash: '#/orders' });
        const pickers = s.d.querySelectorAll('pk-navbar pk-dropdown[placement="bottom-start"]');
        t.eq(pickers.length, 1, 'exactly one picker');
        const trigger = pickers[0].querySelector('[slot="trigger"]');
        t.eq(trigger.textContent.trim(), 'Orders', 'it shows the active module');
        t.eq([...pickers[0].querySelectorAll('pk-menu-item')].map(i => i.textContent).join(','), 'Overview,Orders,Reports', 'it lists the modules');
        t.eq(s.d.querySelectorAll('#pk-nav > pk-nav-item[data-module]').length, 0, 'the side nav has no module rows');
        t.ok(s.d.querySelector('#pk-nav > pk-nav-item[href="#/orders"]'), "the side nav holds the module's own first entry, with no wrapper row");
        const tg = s.d.querySelector('[data-nav-toggle]');
        t.ok(!tg || tg.hidden, 'no second hamburger on a wide screen');
        // keyboard: ArrowDown on the trigger opens the list, Enter on an item chooses it
        trigger.focus();
        trigger.dispatchEvent(new s.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })); await wait(200);
        t.ok(pickers[0].open, 'ArrowDown opens the list');
        s.d.querySelector('pk-navbar pk-menu-item[data-module="reports"]').click();
        await until(() => s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])')?.textContent === 'Summary', 'the reports page');
        t.ok(s.win.location.hash.startsWith('#/reports'), 'the route changed');
        t.eq(trigger.textContent.trim(), 'Reports', 'the picker shows the new module');
        t.eq(s.d.title, 'Reports - Demo app', 'the document title reads the same module title');
        t.eq([...s.d.querySelectorAll('pk-breadcrumb a')].map(a => a.textContent)[1], 'Reports', 'the breadcrumb too');
        t.eq(s.d.querySelector('#pk-nav').getAttribute('label'), 'Reports menu', 'and the menu label');
        t.ok(!s.d.querySelector('#pk-nav pk-nav-item[href="#/orders"]'), "the nav swapped to the new module's tree");
        const deep = await demo(t, 1280, { hash: '#/reports' });
        t.eq(deep.d.querySelector('pk-navbar pk-dropdown [slot="trigger"]').textContent.trim(), 'Reports', 'a deep link restores the picker');
        const none = await demo(t, 1280, { hash: '#/overview' });
        t.ok(none.d.querySelector('#pk-nav') && !none.d.querySelector('#pk-nav pk-nav-item'), 'a module with no nav keeps an empty side-nav column (no reflow) with no items');
        t.ok(!none.d.querySelector('pk-navbar pk-dropdown').hidden, 'and the picker still shows');
    }],

    ['mountApp module picker (#388) on a phone: the picker is the drawer\'s first item, the module nav follows it, choosing a module swaps the nav below and closes the drawer, and there is still one hamburger', async t => {
        const s = await demo(t, 375, { hash: '#/orders' });
        t.eq(s.d.querySelectorAll('[data-nav-toggle]').length, 1, 'one hamburger');
        s.d.querySelector('[data-nav-toggle]').click(); await wait(500);
        const first = s.nav().firstElementChild;
        t.ok(first.querySelector(':scope > pk-nav-item[data-module]'), 'the first row holds the modules');
        t.ok(s.nav().children[1]?.getAttribute('href') === '#/orders', "the module's own nav follows the picker");
        first.shadowRoot.querySelector('[part="link"]').click(); await wait(200);
        first.querySelector('pk-nav-item[data-module="reports"]').shadowRoot.querySelector('[part="link"]').click();
        await until(() => s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])')?.textContent === 'Summary', 'the reports page');
        t.ok(!s.nav().open, 'the drawer closed');
        t.eq([...s.nav().firstElementChild.childNodes].find(n => n.nodeType === 3).textContent, 'Reports', 'the picker row shows the new module');
    }],

    ['mountApp module picker (#388): one module has no picker on any width, and 100 module switches leave no node behind', async t => {
        for (const w of [375, 1280]) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.style.cssText = `width:${w}px;height:600px;border:0;display:block`;
            f.srcdoc = '<!doctype html><link rel="stylesheet" href="' + new URL('../../plainkit.css', import.meta.url).href + '"><div id="app"></div>';
            await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
            const { mountApp, defineModule } = await src('js/app.js'), one = defineModule({ id: 'orders', title: 'Orders', routes: [{ path: '/', page: 'custom', config: { mount: host => { const h1 = host.ownerDocument.createElement('h1'); h1.textContent = 'Orders'; host.append(h1); } } }] });
            const app = mountApp(f.contentDocument.getElementById('app'), { brand: { text: 'One' }, modules: [{ id: 'orders', title: 'Orders', load: async () => one }] });
            const d = f.contentDocument;
            await until(() => d.querySelector('#pk-main :is(h1, pk-heading[level="1"])'), 'the page');
            t.ok(d.querySelector('pk-navbar pk-dropdown[placement="bottom-start"]').hidden, `no picker in the bar at ${w}`);
            t.ok(!d.querySelector('#pk-nav > pk-nav-item > pk-nav-item[data-module]'), `and none in the drawer at ${w}`);
            await app.destroy();
        }
        const s = await demo(t, 1280, { hash: '#/orders' });
        const count = () => s.d.getElementsByTagName('*').length;
        await s.go('#/reports'); await s.go('#/orders'); await wait(100);
        const before = count();
        for (let i = 0; i < 100; i++) await s.go(i % 2 ? '#/orders' : '#/reports');
        await s.go('#/orders'); await wait(100);
        t.ok(count() <= before + 2, `100 switches left ${count() - before} extra nodes`);
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
        s.d.querySelector('pk-navbar pk-menu-item[data-module="reports"]').dispatchEvent(new s.win.PointerEvent('pointerover', { bubbles: true, composed: true }));
        await until(() => fetched('reports') === 1, 'the prefetch', 30);
        s.d.querySelector('pk-navbar pk-menu-item[data-module="reports"]').click();
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

    ['mountApp: the first page needs at most 3 sequential module requests, a loaded module none, chunks stay inside the CPU-scaled 300 ms / 100 ms ceilings, and nothing shifts on first load or across a module switch (CLS 0)', async t => retryCase(async () => {
        // The request depth above is the deterministic protection; the 300 ms and 100 ms budgets are a sanity ceiling that an idle machine must meet and a loaded one gets them stretched by how much slower a fixed workload runs right now (cpu-scale.js, #1247).
        const scale = cpuScale(), first = 300 * scale, warmMs = 100 * scale;
        const s = await demo(t, 1280, { hash: '#/orders' });
        const firstLoad = await requestDepth(s.win, s.drawnAt);
        // Measured at #1247: 5 levels with the 8 hints the sample had, 3 with the entry's static graph hinted. Hinting the shell's elements too gave 1 to 2 but made the elements upgrade early enough to expose a 0.014 layout shift (a table block 79->219px tall) that is filed, not hidden.
        t.ok(firstLoad.depth <= MAX_FIRST_PAGE_DEPTH, `the first page needs ${firstLoad.depth} sequential module round trips (${firstLoad.count} files, ${firstLoad.preloaded} hinted), expected at most ${MAX_FIRST_PAGE_DEPTH}; deepest: ${firstLoad.deepest.join(' ')}. FIX: add the file to the modulepreload list of samples/app/index.html`);
        const shifts = [];
        const po = new s.win.PerformanceObserver(list => shifts.push(...list.getEntries()));
        po.observe({ type: 'layout-shift', buffered: true });
        await wait(600);
        const jsCount = () => s.win.performance.getEntriesByType('resource').filter(e => e.initiatorType !== 'fetch' && /\.js(\?|$)/.test(e.name)).length;
        for (const to of ['#/reports', '#/overview', '#/orders/7', '#/reports/exports', '#/orders']) await s.go(to);
        const loaded = jsCount();
       
        const cls = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        // The observer is proved live: a deliberate shift is counted.
        const probe = s.d.createElement('div'); probe.textContent = 'x'; s.main().prepend(probe); probe.style.height = '120px';
        // The entry arrives after the next frame: wait for it (a busy machine is late), not a fixed 300 ms.
        await until(() => shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0) > cls, 'the layout-shift observer to report the deliberate shift', 200);
        const after = shifts.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        po.disconnect();
        t.ok(after > cls, 'the layout-shift observer sees a deliberate shift (the measurement works)');
        // Which rects moved (shadow-tree nodes are not exposed, so rects and heights name them), so a failure says where to reserve space.
        const who = shifts.filter(e => !e.hadRecentInput && e.value > 0).map(e => `${e.value.toFixed(4)} ${(e.sources || []).map(x => `@${Math.round(x.previousRect.left)},${Math.round(x.previousRect.top)}->${Math.round(x.currentRect.top)} h${Math.round(x.previousRect.height)}->${Math.round(x.currentRect.height)}`).join(',')}`).join('; ');
        t.ok(cls < 0.001, `layout shift across first load and five route changes is ${cls.toFixed(4)}, expected 0 (${who})`);
        // After the CLS reading, so these extra route changes cannot add to it: a module that is already loaded must not be requested again.
        for (const to of ['#/reports', '#/overview', '#/orders']) await s.go(to);
        t.eq(jsCount(), loaded, 'a module that is already loaded needs 0 new module requests');
        const ms = id => s.win.performance.getEntriesByName(`pk-route:${id}`).map(e => e.duration);
        t.ok(ms('orders')[0] <= first, `the first load of the orders chunk took ${ms('orders')[0]?.toFixed(0)} ms, budget ${first.toFixed(0)}`);
        t.ok(ms('reports')[0] <= first, `the first load of the reports chunk took ${ms('reports')[0]?.toFixed(0)} ms, budget ${first.toFixed(0)}`);
        const warm = [...ms('orders').slice(1), ...ms('reports').slice(1), ...ms('overview').slice(1)];
        t.ok(warm.length >= 3 && Math.max(...warm) <= warmMs, `route changes to a loaded module took at most ${Math.max(...warm).toFixed(0)} ms (${warm.map(x => x.toFixed(0)).join(', ')}), budget ${warmMs.toFixed(0)}`);
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
        await until(() => el.querySelector('pk-app-bar-search'), 'the search'); await customElements.whenDefined('pk-app-bar-search'); // loaded on demand: wait, so the case also passes on its own (--elements)
        const search = el.querySelector('pk-app-bar-search'), input = await until(() => search.shadowRoot?.querySelector('[part="control"]'), 'the search input');
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
        await until(() => stack.querySelector('pk-toast'), 'the task toast'); await t.load(stack); // loaded on demand: wait, so the case also passes on its own (--elements)
        t.ok(stack.querySelector('pk-toast').getAttribute('heading') === 'Importing', 'the toast carries the title, in the shell stack');
        app.navigate('/b');
        await until(() => el.querySelector('#pk-main')?.textContent.includes('b'), 'module b');
        await handle.promise;
        t.ok(aborted && handle.state === 'cancelled', 'leaving the module cancelled its cancellable task');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    // #358: the site's real scorecard module, started and then left mid-run: ctx.signal aborts the run, so no measuring frame survives and none is opened afterwards.
    ['mountApp: leaving the site scorecard module mid-run aborts it (ctx.signal): the card and every measuring frame are gone and no new frame opens (#358)', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const b = defineModule({ id: 'b', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'b page'; } } }] });
        history.replaceState(null, '', '#/scorecard?concurrency=1');
        const app = mountApp(el, { modules: [{ id: 'scorecard', title: 'Scorecard', load: () => src('site/modules/scorecard.js').then(m => m.default) }, { id: 'b', title: 'B', load: async () => b }] });
        const main = () => el.querySelector('#pk-main');
        const deep = (root, sel) => root.querySelector(sel) ?? [...root.querySelectorAll('*')].map(n => n.shadowRoot && deep(n.shadowRoot, sel)).find(Boolean) ?? null;
        const frames = () => document.querySelectorAll('[data-sc-frames] iframe').length;
        const run = await until(() => deep(main(), '[data-sc-run]'), 'the Run scorecard button', 300);
        await t.load(main());
        (run.click(), run);
        await until(() => frames() > 0, 'a measuring frame to open', 300);
        app.navigate('/b');
        await until(() => main()?.textContent.includes('b page'), 'module b');
        await until(() => frames() === 0, 'the measuring frames to be removed', 100);
        const seen = []; const obs = new MutationObserver(() => seen.push(frames())); obs.observe(document.body, { childList: true, subtree: true });
        await wait(600); obs.disconnect();
        t.ok(seen.every(n => n === 0), 'no frame opened after leaving');
        t.eq(el.querySelectorAll('[data-sc-run]').length, 0, 'the card is gone');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    // #346: a route with persist: true keeps its page element while another route shows, and the same element is shown again on return.
    ['mountApp: a persist route keeps its page element across navigation (hidden while away, same element on return) and leaving the module frees it', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let built = 0, freed = 0;
        const a = defineModule({ id: 'a', routes: [
            { path: '/', page: 'custom', persist: true, config: { mount: h => { built++; h.textContent = 'kept page'; return () => { freed++; }; } } },
            { path: '/other', page: 'custom', config: { mount: h => { h.textContent = 'other page'; } } },
        ] });
        const b = defineModule({ id: 'b', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'b'; } } }] });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => a }, { id: 'b', title: 'B', load: async () => b }] });
        const main = () => el.querySelector('#pk-main');
        await until(() => main()?.textContent.includes('kept page'), 'the kept page');
        const kept = main().querySelector('[data-pk-page]');
        app.navigate('/a/other');
        await until(() => main()?.textContent.includes('other page'), 'the other page');
        t.ok(kept.isConnected && kept.hidden && freed === 0, 'the kept page stays in the page, hidden, and is not cleaned up');
        app.navigate('/a');
        await until(() => !kept.hidden && !main().textContent.includes('other page'), 'the kept page again');
        t.ok(main().querySelector('[data-pk-page]') === kept && built === 1, 'the same element is shown again and was built once');
        app.navigate('/b');
        await until(() => main()?.textContent.includes('b') && !main().textContent.includes('kept'), 'module b');
        t.ok(freed === 1 && !kept.isConnected, 'leaving the module cleans the kept page up and removes it');
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
    // #354, #363: the app shell template. The overview is a dashboard; the inbox is a master-detail route whose deep link opens a message beside the list (wide) and fits 1280 and 375.
    ['app template (#354, #363): the overview dashboard renders, an inbox deep link shows the list and the open message, and neither overflows at 1280 or 375', async t => {
        const host = t.stage('');
        for (const width of [1280, 375]) {
            const f = document.createElement('iframe');
            f.title = 'app template'; f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
            f.src = new URL('../../samples/templates/app/app.html#/overview', import.meta.url).href;
            await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
            const win = f.contentWindow, d = win.document;
            const deep = (root, sel) => { const hit = root.querySelector?.(sel); if (hit) return hit; for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) { const h = deep(el.shadowRoot, sel); if (h) return h; } return null; };
            await until(() => deep(d, 'pk-dashboard-page'), 'the overview dashboard'); await wait(200);
            t.ok(d.documentElement.scrollWidth <= width, `the overview fits ${width}px`);
            win.location.hash = '#/inbox/3';
            const page = await until(() => deep(d, 'pk-master-detail-page'), 'the master-detail page'); await until(() => page.part('record')?.textContent.includes('Message 3'), 'the open message'); await wait(200);
            t.ok(d.documentElement.scrollWidth <= width, `the inbox fits ${width}px`);
            f.remove();
        }
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

    // #855: the record and list page types raise default toasts through ctx.notify (saved, failed, deleted, done), overridable and switchable off with config.toasts.
    ['page toasts (#855): record Save toasts "Saved" (success, a status), a failing Save toasts "Could not save" (danger, an alert, sticky) with the error text, and a field error toasts nothing', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const saved = [];
        const mod = defineModule({ id: 'a', routes: [{ path: '/', page: 'record', config: { id: '1', mode: 'edit', title: 'Thing', fields: [{ name: 'name', label: 'Name' }], load: async () => ({ name: 'A' }), save: async v => { saved.push(v.name); if (v.name === 'bad') throw new Error('Server said no'); if (v.name === 'field') throw { errors: { name: 'Taken' } }; } } }] });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => mod }] });
        const rec = await until(() => el.querySelector('pk-record-page'), 'the record page');
        const stack = () => el.querySelector('pk-toast-stack[position="bottom-end"]');
        const toasts = () => [...(stack()?.querySelectorAll('pk-toast') ?? [])];
        const submit = async name => { rec.mode = 'edit'; await wait(100); await until(() => rec.controls().length, 'the form'); const c = rec.controls()[0]; c.value = name; c.dispatchEvent(new Event('input', { bubbles: true, composed: true })); rec.part('save').click(); };
        await submit('good');
        await until(() => toasts().some(x => x.heading === 'Saved'), 'the Saved toast');
        const ok = toasts().find(x => x.heading === 'Saved');
        const { roleFor } = await src('elements/toast/toast.js');
        t.eq(ok.kind, 'success'); t.eq(roleFor(ok.kind), 'status', 'a success is polite');
        await submit('bad');
        await until(() => toasts().some(x => x.heading === 'Could not save'), 'the failure toast');
        const bad = toasts().find(x => x.heading === 'Could not save');
        t.eq(bad.kind, 'danger'); t.eq(bad.message, 'Server said no'); t.eq(roleFor(bad.kind), 'alert', 'an error interrupts'); t.eq(bad.getAttribute('duration') ?? '0', '0', 'and stays until dismissed');
        const before = toasts().length;
        await submit('field'); await wait(500);
        t.eq(toasts().length, before, 'a field error is on the field, not a toast');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    ['page toasts (#855): config.toasts false switches them off, a string or a function words one outcome, false in the object drops one, and a page without a notify service just works', async t => {
        const { mountApp, defineModule, mountPage } = await src('js/app.js');
        const run = async toasts => {
            const el = document.createElement('div'); t.stage('').append(el);
            const mod = defineModule({ id: 'a', routes: [{ path: '/', page: 'record', config: { id: '1', mode: 'edit', fields: [{ name: 'name', label: 'Name' }], load: async () => ({ name: 'A' }), save: async v => { if (v.name === 'bad') throw new Error('no'); }, toasts } }] });
            history.replaceState(null, '', '#/a');
            const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => mod }] });
            const rec = await until(() => el.querySelector('pk-record-page'), 'the record page');
            await until(() => rec.controls().length, 'the form');
            const go = async name => { rec.mode = 'edit'; await wait(100); await until(() => rec.controls().length, 'the form'); const c = rec.controls()[0]; c.value = name; c.dispatchEvent(new Event('input', { bubbles: true, composed: true })); rec.part('save').click(); await wait(500); };
            const heads = () => [...el.querySelectorAll('pk-toast-stack pk-toast')].map(x => x.heading);
            return { go, heads, done: async () => { await app.destroy(); history.replaceState(null, '', location.pathname + location.search); } };
        };
        let r = await run(false); await r.go('ok'); await r.go('bad'); t.eq(r.heads().join(), '', 'toasts: false'); await r.done();
        r = await run({ saved: 'Order saved', failed: false }); await r.go('ok'); await r.go('bad'); t.eq(r.heads().join(), 'Order saved', 'a string words saved; failed: false drops it'); await r.done();
        r = await run({ saved: (detail) => `Saved ${detail.name}`, failed: err => ({ title: 'Nope', details: err.message.toUpperCase() }) }); await r.go('ok'); await r.go('bad');
        t.eq(r.heads().join(), 'Saved ok,Nope', 'functions get the values and the error'); await r.done();
        const box = document.createElement('div'); t.stage('').append(box);
        const page = await mountPage(box, { type: 'record', config: { id: '1', mode: 'edit', fields: [{ name: 'name', label: 'Name' }], load: async () => ({ name: 'A' }), save: async () => {} } });
        const rec = await until(() => box.querySelector('pk-record-page'), 'the record page without a notify service'); await until(() => rec.controls().length, 'the form');
        rec.part('save').click(); await wait(400); t.ok(rec.isConnected, 'saving with no notify service neither throws nor toasts'); page.destroy();
    }],
    ['page toasts (#855): a record page with delete(id, ctx) has a Delete button, asks first, calls delete with the id and toasts "Deleted"; a failing delete toasts "Could not delete"; Cancel calls nothing', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const calls = []; let fail = false;
        const mod = defineModule({ id: 'a', routes: [{ path: '/', page: 'record', config: { id: '7', title: 'Thing', fields: [{ name: 'name', label: 'Name' }], load: async () => ({ name: 'A' }), delete: async (id) => { calls.push(id); if (fail) throw new Error('In use'); } } }] });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => mod }] });
        const rec = await until(() => el.querySelector('pk-record-page'), 'the record page');
        const del = await until(() => rec.part('delete') && !rec.part('delete').hidden && rec.part('delete'), 'the Delete button');
        const dialog = () => [...el.ownerDocument.querySelectorAll('pk-dialog')].find(d => d.open);
        const press = async label => (await until(() => [...dialog().querySelectorAll('pk-button')].find(b => b.textContent.trim() === label), `the ${label} button`)).click();
        const heads = () => [...el.querySelectorAll('pk-toast-stack pk-toast')].map(x => `${x.heading}|${x.kind}`);
        del.click(); await until(dialog, 'the confirm dialog'); await wait(300); await press('Cancel'); await wait(300);
        t.eq(calls.length, 0, 'Cancel calls nothing'); t.eq(heads().length, 0);
        del.click(); await until(dialog, 'the confirm dialog'); await wait(300); await press('Delete');
        await until(() => heads().includes('Deleted|success'), 'the Deleted toast'); t.eq(calls.join(), '7', 'delete got the id');
        fail = true; del.click(); await until(dialog, 'the confirm dialog'); await wait(300); await press('Delete');
        await until(() => heads().includes('Could not delete|danger'), 'the failure toast');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    ['page toasts (#855): the list page toasts "Done" after a bulk action settles and "Could not complete" when it rejects', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let reject = false;
        const mod = defineModule({ id: 'a', routes: [{ path: '/', page: 'list', config: { heading: 'Things', columns: [{ key: 'name', label: 'Name' }], selectable: true, bulkActions: [{ id: 'x', label: 'X' }], load: async () => ({ rows: [{ id: '1', name: 'A' }], total: 1 }), onBulk: async () => { if (reject) throw new Error('Nope'); } } }] });
        history.replaceState(null, '', '#/a');
        const app = mountApp(el, { modules: [{ id: 'a', title: 'A', load: async () => mod }] });
        const list = await until(() => el.querySelector('pk-list-page'), 'the list page');
        const heads = () => [...el.querySelectorAll('pk-toast-stack pk-toast')].map(x => `${x.heading}|${x.kind}`);
        const bulk = () => list.dispatchEvent(new CustomEvent('pk-bulk', { detail: { action: 'x', selected: ['1'], scope: 'page', query: {} }, bubbles: true, composed: true }));
        bulk(); await until(() => heads().includes('Done|success'), 'the Done toast');
        reject = true; bulk(); await until(() => heads().includes('Could not complete|danger'), 'the failure toast');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],
    ['pk-skip-link: clipped to 1px until it takes focus (the sweeps ignore it then), full size with a touch-target-high hit area once focused (issue 1161)', async t => {
        const host = t.stage('<pk-skip-link href="#x">Skip to content</pk-skip-link>'); await t.load(host); await t.settle();
        const link = host.querySelector('pk-skip-link').part('link');
        const before = link.getBoundingClientRect();
        t.ok(before.width <= 1.5 && before.height <= 1.5, `hidden before focus: ${before.width}x${before.height}`);
        link.focus(); await t.settle();
        const after = link.getBoundingClientRect();
        const target = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-target')) || 44;
        t.ok(after.height >= target - 0.5, `focused height ${after.height}px is at least the touch target ${target}px`);
        t.ok(after.width >= target - 0.5 && after.width > 40, `focused width ${after.width}px is a visible button`);
        const vp = host.querySelector('pk-skip-link').getBoundingClientRect();
        t.ok(after.right > 0 && after.bottom > 0 && after.left < innerWidth && after.top < innerHeight, 'focused, it is on screen ' + JSON.stringify([after.left, after.top, vp.width]));
    }],
    // #494, step 3: a dashboard route with a `surface` composes its widgets from what modules contribute.
    ['dashboard from modules (#494): only the visible tab loads module code, a failing widget shows its own error card with Retry beside a working one, and a denied contribution is never offered or imported', async t => {
        const { mountApp, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const loads = { alpha: 0, beta: 0, secret: 0 };
        let healthy = false;
        const home = defineModule({ id: 'home', routes: [{ path: '/', page: 'dashboard', config: { surface: 'ov', heading: 'Overview', tabs: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }] } }] });
        const mod = (id, widgets) => async () => { loads[id]++; return defineModule({ id, widgets }); };
        const c = (key, tab, extra = {}) => ({ key, for: ['ov'], tab, label: key, kind: 'stat', ...extra });
        history.replaceState(null, '', '#/home');
        const app = mountApp(el, { modules: [
            { id: 'home', title: 'Home', load: async () => home },
            { id: 'alpha', title: 'Alpha', contributes: [c('good', 'a'), c('bad', 'a')], load: mod('alpha', { good: { load: async () => ({ value: '7' }) }, bad: { load: async () => { if (!healthy) throw new Error('backend down'); return { value: '8' }; } } }) },
            { id: 'beta', title: 'Beta', contributes: [c('late', 'b')], load: mod('beta', { late: { load: async () => ({ value: '9' }) } }) },
            { id: 'secret', title: 'Secret', can: () => false, contributes: [c('hidden', 'a')], load: mod('secret', { hidden: { load: async () => ({ value: '1' }) } }) },
        ], home: 'home' });
        const page = await until(() => el.querySelector('pk-dashboard-page'), 'the dashboard page');
        const cards = () => [...page.shadowRoot.querySelectorAll('pk-card')];
        const card = key => cards().find(x => x.dataset.key === key);
        await until(() => card('alpha:good')?.dataset.state === 'ready' && card('alpha:bad')?.dataset.state === 'error', 'one ready card and one error card', 200);
        t.eq(cards().map(x => x.dataset.key).sort().join(), 'alpha:bad,alpha:good,beta:late', 'the denied contribution has no card');
        t.eq(loads.alpha, 1, 'two widgets of one module share one import');
        t.eq(loads.beta, 0, 'a tab never shown loads no module');
        t.eq(loads.secret, 0, 'a denied module is never imported');
        t.ok(card('alpha:good').querySelector('pk-stat'), 'the working widget is a pk-stat');
        const retry = await until(() => card('alpha:bad').querySelector('pk-button'), 'Retry in the error card');
        healthy = true; retry.click();
        await until(() => card('alpha:bad').dataset.state === 'ready', 'the card after Retry', 200);
        page.shadowRoot.querySelectorAll('pk-tab')[1].click();
        await until(() => card('beta:late').dataset.state === 'ready', 'the second tab widget', 200);
        t.eq(loads.beta, 1, 'the second tab loaded its module when it was shown');
        await app.destroy();
        history.replaceState(null, '', location.pathname + location.search);
    }],

    ['dashboard from modules (#494): reserved card heights give CLS 0 while widgets resolve, and 100 mounts and unmounts leave no node behind and abort every widget signal', async t => {
        const { createModuleHost, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const signals = [];
        const done = new WeakSet();
        const slow = ms => ({ load: ({ signal }) => { signals.push(signal); return new Promise(r => setTimeout(() => { done.add(signal); r({ value: '5' }); }, ms)); } });
        const home = defineModule({ id: 'home', routes: [{ path: '/', page: 'dashboard', config: { surface: 'ov', heading: 'Overview' } }] });
        const other = defineModule({ id: 'other', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'other'; } } }] });
        const c = key => ({ key, for: ['ov'], label: key, kind: key === 'chart' ? 'chart' : 'stat' });
        const host = createModuleHost(el, { modules: [
            { id: 'home', title: 'Home', load: async () => home },
            { id: 'other', title: 'Other', load: async () => other },
            { id: 'w', title: 'W', contributes: [c('s1'), c('s2'), c('chart')], load: async () => defineModule({ id: 'w', widgets: { s1: slow(120), s2: slow(200), chart: { load: () => new Promise(r => setTimeout(() => r({ kind: 'bar', data: { labels: ['a'], series: [{ name: 'n', values: [1] }] } }), 160)) } } }) },
        ] });
        await host.show('other');
        let shift = 0;
        const po = new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) shift += e.value; });
        po.observe({ type: 'layout-shift' });
        host.show('home');
        const page = await until(() => el.querySelector('pk-dashboard-page'), 'the dashboard');
        await until(() => [...page.shadowRoot.querySelectorAll('pk-card')].length === 3 && [...page.shadowRoot.querySelectorAll('pk-card')].every(x => x.dataset.state === 'ready'), 'three ready cards', 200);
        await wait(100); po.disconnect();
        t.ok(shift < 0.001, `widgets resolving shifted the layout by ${shift.toFixed(4)} (CLS must be 0)`);
        const count = () => el.querySelectorAll('*').length;
        await host.show('other'); await wait(100);
        const before = count(), made = signals.length;
        for (let i = 0; i < 100; i++) {
            await host.show('home'); await wait(30);   // widgets start on the next frame (#1295): leaving sooner would start none
            await host.show('other');
        }
        await wait(100);
        t.ok(count() <= before + 2, `100 mounts left ${count() - before} extra nodes`);
        t.ok(signals.length > made, 'widgets ran');
        t.ok(signals.every(s => s.aborted || done.has(s)), 'every widget run still in flight was aborted when its page was left');
        t.ok(signals.slice(made).filter(s => s.aborted).length >= 99, 'the runs cut short by leaving were aborted');
        await host.destroy();
    }],
    // #494, step 5: the active tab in the address, filters in the module state, size spans, a module that withdraws its widget.
    ['dashboard from modules (#494): ?tab= opens that tab first and loads only its module, a tab change rewrites the address without a history entry, and size hints span columns', async t => {
        const { createModuleHost, defineModule } = await src('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const loads = { a: 0, b: 0 };
        const home = defineModule({ id: 'home', routes: [{ path: '/', page: 'dashboard', config: { surface: 'ov', heading: 'Overview', tabs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] } }] });
        const c = (key, tab, size) => ({ key, for: ['ov'], tab, label: key, kind: 'stat', size });
        const mod = (id, keys) => async () => { loads[id]++; return defineModule({ id, widgets: Object.fromEntries(keys.map(k => [k, { load: async () => ({ value: k }) }])) }); };
        const before = location.href, historyLength = history.length;
        const host = createModuleHost(el, { modules: [
            { id: 'home', title: 'Home', load: async () => home },
            { id: 'a', title: 'A', contributes: [c('sm1', 'one', 'sm'), c('md1', 'one', 'md'), c('lg1', 'one', 'lg'), c('sm2', 'one', 'sm')], load: mod('a', ['sm1', 'md1', 'lg1', 'sm2']) },
            { id: 'b', title: 'B', contributes: [c('only', 'two')], load: mod('b', ['only']) },
        ] });
        await host.show('home', { path: '/', query: { tab: 'two' } });
        const page = await until(() => el.querySelector('pk-dashboard-page'), 'the dashboard');
        const card = key => [...page.shadowRoot.querySelectorAll('pk-card')].find(x => x.dataset.key === key);
        await until(() => card('b:only')?.dataset.state === 'ready', 'the widget of the tab in the address', 200);
        t.eq(loads.a, 0, 'the other tab loaded no module');
        t.eq(loads.b, 1);
        t.eq(page.shadowRoot.querySelector('pk-tabs').value, 'two', 'the tab named in the address is the open one');
        page.shadowRoot.querySelectorAll('pk-tab')[0].click();
        await until(() => card('a:sm1')?.dataset.state === 'ready', 'the first tab widgets', 200);
        t.eq(new URL(location.href).searchParams.get('tab'), 'one', 'the tab change was written to the address');
        t.eq(history.length, historyLength, 'no history entry was added');
        const w = k => card(k).getBoundingClientRect().width, grid = card('a:sm1').parentElement.getBoundingClientRect().width;
        t.ok(w('a:md1') > w('a:sm1') * 1.8, `md spans two columns (${w('a:md1').toFixed(0)}px against ${w('a:sm1').toFixed(0)}px)`);
        t.ok(Math.abs(w('a:lg1') - grid) < 2, 'lg takes the whole row');
        t.ok(Math.abs(w('a:sm1') - w('a:sm2')) < 2, 'sm cards stay one column');
        await host.destroy();
        history.replaceState(null, '', before);
    }],

    ['dashboard from modules (#494): a filter selection is saved in the owning module state and restored on the next visit, and a module whose own can denies has its card withdrawn', async t => {
        const { createModuleHost, defineModule } = await src('js/app.js');
        const { createStore } = await src('js/store.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const seen = [];
        const home = defineModule({ id: 'home', state: { version: 1, defaults: { range: '' }, persist: ['range'] }, routes: [{ path: '/', page: 'dashboard', config: { surface: 'ov', heading: 'Overview', filters: [{ key: 'range', type: 'select', label: 'Range', options: ['7d', '30d'] }] } }] });
        const other = defineModule({ id: 'other', routes: [{ path: '/', page: 'custom', config: { mount: h => { h.textContent = 'other'; } } }] });
        const c = key => ({ key, for: ['ov'], label: key, kind: 'stat' });
        const host = createModuleHost(el, { store: createStore({ prefix: `dash${Date.now()}` }), modules: [
            { id: 'home', title: 'Home', load: async () => home },
            { id: 'other', title: 'Other', load: async () => other },
            { id: 'ok', title: 'Ok', contributes: [c('shown')], load: async () => defineModule({ id: 'ok', widgets: { shown: { load: async ({ context }) => (seen.push(context.range), { value: '1' }) } } }) },
            { id: 'gone', title: 'Gone', contributes: [c('withdrawn')], load: async () => defineModule({ id: 'gone', can: () => false, widgets: { withdrawn: { load: async () => ({ value: '2' }) } } }) },
        ] });
        await host.show('home');
        let page = await until(() => el.querySelector('pk-dashboard-page'), 'the dashboard');
        const card = key => [...page.shadowRoot.querySelectorAll('pk-card')].find(x => x.dataset.key === key);
        await until(() => card('ok:shown')?.dataset.state === 'ready' && card('gone:withdrawn')?.dataset.state === 'hidden', 'one ready card and one withdrawn card', 200);
        t.ok(card('gone:withdrawn').hidden && card('gone:withdrawn').getBoundingClientRect().height === 0, 'the withdrawn card takes no space');
        const select = await until(() => page.shadowRoot.querySelector('[data-key="range"]'), 'the range filter');
        await until(() => select.shadowRoot, 'the select upgrade');
        select.value = '30d'; select.dispatchEvent(new CustomEvent('pk-value-change', { bubbles: true, composed: true, detail: { value: '30d' } }));
        await until(() => seen.at(-1) === '30d', 'the widget reloaded with the selection', 200);
        await host.show('other'); await host.show('home');
        page = await until(() => el.querySelector('pk-dashboard-page'), 'the dashboard again');
        await until(() => seen.length >= 3 && seen.at(-1) === '30d', 'the first load of the next visit to see the saved range', 200);
        t.eq(page.shadowRoot.querySelector('[data-key="range"]').value, '30d', 'the filter bar starts on the saved selection');
        await host.destroy();
    }],
    // #494, step 4: the demo app composes two dashboard surfaces, Overview (tabs, contributions from Orders and Reports) and Orders > Summary (a surface of its own, one module).
    ['dashboard from modules (#494): the demo app has a second dashboard route whose cards are the widgets naming its surface (one tab, against two on the overview), and fit at 1280 and 375', async t => {
        for (const width of [1280, 375]) {
            const s = await demo(t, width, { hash: '#/orders/summary' });
            const deep = (root, sel) => { const hit = root.querySelector?.(sel); if (hit) return hit; for (const el of root.querySelectorAll?.('*') ?? []) if (el.shadowRoot) { const h = deep(el.shadowRoot, sel); if (h) return h; } return null; };
            const page = await until(() => deep(s.d, 'pk-dashboard-page'), 'the orders summary dashboard');
            const cards = () => [...page.shadowRoot.querySelectorAll('pk-card')];
            await until(() => cards().length === 2 && cards().every(c => c.dataset.state === 'ready'), 'both cards ready', 200);
            t.eq(cards().map(c => c.dataset.key).join(), 'orders:revenue,orders:open', `only the widgets naming the orders surface are drawn, in the route's curated order (#1294), at ${width}px`);
            t.eq(s.d.querySelector('#pk-main :is(h1, pk-heading[level="1"])').textContent, 'Orders summary', 'the route heading');
            t.eq(page.shadowRoot.querySelectorAll('pk-tab').length, 1, 'the one declared tab');
            const [a, b] = cards().map(c => c.getBoundingClientRect());
            t.ok(b.top >= a.bottom - 1 || b.left >= a.right - 1, 'the two cards do not overlap');
            t.ok(a.left >= 0 && a.right <= width && b.right <= width, 'both cards sit inside the viewport');
            t.ok(s.d.documentElement.scrollWidth <= width, `no horizontal scroll at ${width}px`);
            await s.go('#/overview');
            const ov = await until(() => deep(s.d, 'pk-dashboard-page'), 'the overview dashboard');
            await until(() => ov.shadowRoot.querySelectorAll('pk-card').length >= 2, 'the overview cards', 200);
            t.eq(ov.shadowRoot.querySelectorAll('pk-tab').length, 2, 'the overview surface keeps its own two tabs, Sales and Operations');
        }
    }],
];
