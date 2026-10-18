// The measuring cases of scripts/blazor-browser.mjs (#1320) and the screenshot plan. Each case is { name, run(ctx) } and throws with a message that says what was measured;
// ctx is makeContext() of the harness. The expectations come from the design spec (docs/superpowers/specs/2026-10-13-blazor-app-framework-design.md, section 13).
// A failing case is a defect in the sample or the framework: file an issue (screenshot and steps), do not weaken the case.

import { LAB_CASES, LAB_SHOTS } from './blazor-browser-lab-cases.mjs';
import { INTEROP_CASES, INTEROP_SHOTS } from './blazor-browser-interop-cases.mjs';
import { ELEMENT_CASES, ELEMENT_SHOTS } from './blazor-browser-element-cases.mjs';

const MAIN_TEXT = `(document.querySelector('#pk-main') ? window.__deep.text(document.querySelector('#pk-main')) : '')`; // #pk-main is absent while a lazy module loads (the guard's spinner)
const MARK = `window.__pkMark = 'still the same document'`;
const SAME_DOCUMENT = `window.__pkMark === 'still the same document'`;
const IN_MAIN = `(() => { let a = window.__deep.active(); for (let n = a; n; n = n.parentNode ?? n.host) if (n.id === 'pk-main') return true; return false; })()`;
const ON_H1 = `(() => { const a = window.__deep.active(); return !!a && (a.matches('h1') || !!a.closest('h1, pk-heading[level="1"]')); })()`;
const BENIGN = [/favicon\.ico/]; // the sample ships no icon

/** The page with this heading text drawn: a record or list page shows data only after its load callback answered. */
const text = async (ctx, what) => ctx.eval(`${MAIN_TEXT}.includes(${JSON.stringify(what)})`);
const status = async (ctx, route) => (await fetch(ctx.host.base + route, { redirect: 'manual' })).status;

export const CASES = [
    { name: 'deep-link-record',
      async run(ctx) {
        await ctx.open('/orders/8');
        ctx.ok(await ctx.eval(`!!window.__deep.one('pk-app-frame') && !!document.querySelector('#pk-main pk-record-page')`), 'the record page is not drawn inside the app frame (pk-app-frame > #pk-main > pk-record-page)');
        await ctx.waitFor(`${MAIN_TEXT}.includes('Grace Hopper') || ${MAIN_TEXT}.includes('Something went wrong')`, 'the record to load or fail');
        ctx.ok(await text(ctx, 'Grace Hopper'), `the deep link /orders/8 does not show the record (customer Grace Hopper); the page says: ${(await ctx.eval(MAIN_TEXT)).trim().slice(0, 160)}`);
      } },
    { name: 'deep-link-has-a-title',
      async run(ctx) {
        await ctx.open('/orders/8');
        ctx.ok((await ctx.eval('document.title')).trim() !== '', 'a document loaded straight at /orders/8 has an empty <title> (a reader and the tab strip see no page name)');
      } },
    { name: 'refusal-401-in-frame',
      async run(ctx) {
        ctx.ok(await status(ctx, '/secure/audit') === 401, 'a first request for the [Authorize] page /secure/audit does not answer 401');
        await ctx.open('/secure/audit');
        ctx.ok(await ctx.eval(`!!window.__deep.one('pk-app-frame')`), 'the refusal page is drawn without the app frame');
        ctx.ok(await text(ctx, 'Not allowed'), 'the refusal page does not say "Not allowed"');
        ctx.ok(!(await text(ctx, 'Only signed-in users')), 'the protected content is in the page for an anonymous reader');
        await ctx.noErrors(ctx.openMark, [...BENIGN, /status of 401/]);
      } },
    { name: 'not-found-404-in-frame',
      async run(ctx) {
        ctx.ok(await status(ctx, '/nope') === 404, 'an unknown path does not answer 404');
        await ctx.open('/nope');
        ctx.ok(await ctx.eval(`!!window.__deep.one('pk-app-frame')`), 'the not-found page is drawn without the app frame');
        ctx.ok(await text(ctx, 'Page not found'), 'the page does not say "Page not found"');
        await ctx.noErrors(ctx.openMark, [...BENIGN, /status of 404/]);
      } },
    { name: 'nav-link-is-a-client-navigation',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.eval(MARK);
        await ctx.clickLink('/orders/open');
        ctx.ok(await ctx.eval(SAME_DOCUMENT), 'following a nav link reloaded the document; it should be a LocationChanged render');
        await ctx.waitFor(`document.title === 'Open - Demo app'`, 'the title to follow the route (routeChanged bridge)');
      } },
    { name: 'module-switch-is-a-client-navigation',
      async run(ctx) {
        await ctx.open('/overview');
        await ctx.eval(MARK);
        await ctx.clickLink('/orders');
        await ctx.waitFor(`location.pathname === '/orders'`, '/orders');
        await ctx.sleep(1500);
        ctx.ok(await ctx.eval(SAME_DOCUMENT), 'switching module from the picker reloaded the whole document (Server has no lazy chunk to load; the module switch should still be a client navigation)');
      } },
    { name: 'back-forward',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.eval(MARK);
        await ctx.clickLink('/orders/open');
        await ctx.eval('history.back()');
        await ctx.waitFor(`location.pathname === '/orders' && document.title === 'Orders - Demo app'`, 'Back to /orders with its title');
        await ctx.eval('history.forward()');
        await ctx.waitFor(`location.pathname === '/orders/open' && document.title === 'Open - Demo app'`, 'Forward to /orders/open with its title');
        ctx.ok(await ctx.eval(SAME_DOCUMENT), 'back and forward reloaded the document');
      } },
    { name: 'focus-moves-into-the-page',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.clickLink('/orders/open');
        await ctx.waitFor(IN_MAIN, 'focus to move into #pk-main after the route change');
      } },
    { name: 'focus-lands-on-the-h1',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.clickLink('/orders/open');
        await ctx.sleep(1000); // the page drew and the bridge ran
        const on = await ctx.eval(ON_H1);
        ctx.ok(on, `after a route change focus is on ${await ctx.eval(`(() => { const a = window.__deep.active(); return a ? a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') : 'nothing'; })()`)}, not on the page h1 (routeChanged, #1315); h1 in the page: ${await ctx.eval(`window.__deep.all('#pk-main h1, h1').length`)}`);
      } },
    { name: 'no-layout-shift-on-load',
      async run(ctx) {
        await ctx.open('/overview');
        await ctx.sleep(1000);
        const cls = await ctx.eval('window.__cls');
        // The spec asks for 0 on a module switch (the next case). A document load hands the prerendered page to the circuit and measured 0 to 0.04 between runs: the Web Vitals "good" bound is what is held here.
        ctx.ok(cls <= 0.1, `cumulative layout shift on loading /overview is ${cls.toFixed(4)}, expected at most 0.1${cls > 0.1 ? ' (shifts, ms since load, node, previous>current rect: ' + JSON.stringify(await ctx.eval('window.__clsLog')) + ')' : ''}`);
      } },
    { name: 'no-layout-shift-on-route-change',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.sleep(1000);
        const before = await ctx.eval('window.__cls');
        await ctx.clickLink('/orders/open');
        await ctx.sleep(1500);
        const shift = (await ctx.eval('window.__cls')) - before;
        ctx.ok(shift < 0.001, `a route change from /orders to /orders/open shifts the layout by ${shift.toFixed(4)}, expected 0${shift >= 0.001 ? ' (shifts, ms since load, previous>current rect: ' + JSON.stringify(await ctx.eval('window.__clsLog')) + ')' : ''}`);
      } },
    { name: 'overview-dashboard-from-modules',
      async run(ctx) {
        // #1296: Orders and Reports contribute widgets in their manifests; the Overview page names only the surface. The active tab (Sales) starts its widgets.
        await ctx.open('/overview');
        const SALES = `document.querySelector('#pk-main pk-dashboard-page')`;
        await ctx.waitFor(`${MAIN_TEXT}.includes('Open orders') && ${MAIN_TEXT}.includes('waiting to ship')`, 'the Open orders widget (contributed by the Orders module) to load on the Overview dashboard');
        ctx.ok(await ctx.eval(`!!${SALES}`), 'the Overview page does not draw a pk-dashboard-page');
        ctx.ok(await text(ctx, 'Revenue by month'), 'the Revenue by month widget (Orders module) is not on the Overview dashboard');
        ctx.ok(!(await text(ctx, 'Something went wrong')), 'a widget of the Overview dashboard is in its error state');
        await ctx.eval(`(() => { const t = window.__deep.all('pk-tab, [role="tab"]').find(x => /Operations/.test(x.textContent)); t?.click(); })()`);
        await ctx.waitFor(`${MAIN_TEXT}.includes('ready to download')`, 'the Exports ready widget (Reports module) to load on the Operations tab');
        await ctx.noErrors(ctx.openMark, [...BENIGN]);
      } },
    { name: 'no-console-errors',
      async run(ctx) {
        const bad = [];
        for (const route of ['/overview', '/orders', '/orders/8', '/reports', '/secure/audit', '/nope']) {
                await ctx.open(route);
            await ctx.sleep(3000); // the circuit connects and the page's load callbacks answer or fail
            await ctx.flushEvents();
            const errors = ctx.errorsSince(ctx.openMark, [...BENIGN, /status of (401|404)/]);
            if (errors.length) bad.push(`${route}: ${errors[0].split('\n')[0].slice(0, 200)}`);
        }
        ctx.ok(!bad.length, 'console errors or uncaught exceptions:\n    ' + bad.join('\n    '));
      } },
];

/** Screenshots, taken for every viewport and theme: the shot's name goes into blazor-app__<shot>__<viewport>__<theme>.png. */
export const SHOT_PLAN = [
    async (ctx, vp, theme) => { await ctx.open('/overview'); await ctx.shot('home', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/orders/8'); await ctx.sleep(800); await ctx.shot('record-deep-link', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/secure/audit'); await ctx.shot('refusal', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/nope'); await ctx.shot('not-found', vp, theme); },
    // The navigation with its modules: the drawer on a phone, the module picker on a desktop.
    async (ctx, vp, theme) => {
        await ctx.open('/orders');
        await ctx.sleep(800);
        const label = vp.name === 'phone' ? 'Toggle the menu' : 'Switch module';
        const clicked = await ctx.eval(`(() => { const b = window.__deep.all('button').find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)} && x.getBoundingClientRect().width > 0); if (!b) return false; b.click(); return true; })()`);
        if (!clicked) throw new Error(`no visible "${label}" button on ${vp.name}`);
        await ctx.sleep(600);
        await ctx.shot(vp.name === 'phone' ? 'drawer' : 'modules-menu', vp, theme);
    },
];

/** The cases of the standalone WebAssembly sample (blazor/samples/PlainKit.AppSample.Wasm, #1368), served as static files; ctx.host is that host. */
export const WASM_CASES = [
    { name: 'wasm-lazy-module-assembly',
      async run(ctx) {
        // The Insights module's pages are in PlainKit.AppSample.Insights.<hash>.wasm (BlazorWebAssemblyLazyLoad): not in the first download, fetched once by PkLazyModuleLoader on the first navigation into /insights.
        const requests = () => ctx.events.slice(ctx.openMark).filter(e => e.method === 'Network.requestWillBeSent' && /PlainKit\.AppSample\.Insights\.[^/]*\.wasm$/.test(e.params.request.url.split('?')[0])).length;
        const INSIGHTS = `${MAIN_TEXT}.includes("This module's assembly was downloaded")`, OVERVIEW = `${MAIN_TEXT}.includes('The home module is in the first download')`;
        await ctx.open('/overview');
        await ctx.waitFor(OVERVIEW, 'the home module of the WebAssembly sample to draw');
        await ctx.sleep(1500);
        await ctx.flushEvents(); // the Network events come over their own connection: count after they have all arrived
        ctx.ok(requests() === 0, `the lazy module assembly was requested at startup (${requests()} request/s), before any navigation into /insights`);
        await ctx.eval(MARK);
        await ctx.clickLink('/insights');
        await ctx.waitFor(`${INSIGHTS} || ${MAIN_TEXT}.includes('Something went wrong')`, 'the Insights page to draw or fail');
        ctx.ok(await ctx.eval(INSIGHTS), `the first navigation into /insights did not draw its lazily loaded page; the page says: ${(await ctx.eval(MAIN_TEXT)).trim().slice(0, 160)}`);
        await ctx.flushEvents(); // the Network events come over their own connection: count after they have all arrived
        ctx.ok(requests() === 1, `the first navigation into /insights requested the module assembly ${requests()} times, expected exactly once`);
        await ctx.clickLink('/overview');
        await ctx.waitFor(OVERVIEW, 'the Overview page again');
        await ctx.clickLink('/insights');
        await ctx.waitFor(INSIGHTS, 'the Insights page again');
        await ctx.flushEvents(); // the Network events come over their own connection: count after they have all arrived
        ctx.ok(requests() === 1, `the second navigation into /insights requested the module assembly again (${requests()} requests in all)`);
        ctx.ok(await ctx.eval(SAME_DOCUMENT), 'a module switch reloaded the whole document');
        await ctx.noErrors(ctx.openMark, [...BENIGN]);
      } },
    { name: 'wasm-lazy-module-deep-link',
      async run(ctx) {
        // A document load straight at /insights: the guard loads the assembly before the router renders, so the page is not "Page not found".
        await ctx.open('/insights');
        await ctx.waitFor(`${MAIN_TEXT}.includes("This module's assembly was downloaded") || ${MAIN_TEXT}.includes('Page not found') || ${MAIN_TEXT}.includes('Something went wrong')`, '/insights to draw');
        ctx.ok(await text(ctx, "This module's assembly was downloaded"), `a deep link to the lazy module did not draw its page; the page says: ${(await ctx.eval(MAIN_TEXT)).trim().slice(0, 160)}`);
        await ctx.noErrors(ctx.openMark, [...BENIGN]);
      } },
];

CASES.push(...LAB_CASES); // the JS-interop paths a bUnit test cannot cross (blazor-browser-lab-cases.mjs)
SHOT_PLAN.push(...LAB_SHOTS);
CASES.push(...INTEROP_CASES); // callbacks of the page types, JSON re-sync, parameter binding, file picking (#1381)
SHOT_PLAN.push(...INTEROP_SHOTS);
CASES.push(...ELEMENT_CASES); // properties and refs, canvas events, side-nav open/close, real pointer drags (#1411)
SHOT_PLAN.push(...ELEMENT_SHOTS);
