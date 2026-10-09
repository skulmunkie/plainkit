// mountApp (#350, step 4 of the app framework #346): the app shell that owns ALL the chrome, so a consumer writes a config and a few modules, never a bar.
//
//   import { mountApp } from './plainkit/js/app.js';
//   import config from './app.config.js';                      // default export: see js/app/config.js
//   const app = mountApp(document.getElementById('app'), config);
//   app.navigate('/orders/7'); app.page.busy(() => save(), 'Saving'); await app.destroy();
//
// It composes existing elements only (js/app/shell.js) and wires them to what steps 1 to 3 built: the router (js/router.js, hash mode by default: '#/<moduleId>/...'),
// the module host (js/app/host.js: lifecycle, boundaries, not-found and forbidden states, the guard at the router and again at mount), the store (js/store.js) and
// createPage (js/page.js: the page-level overlay lives in the host, the app-level one is `app.page`, fullscreen).
//
//   header         ONE menu control (the hamburger: the drawer on a phone or tablet, hide and show the column on a wide screen), the brand, the header search and the settings menu
//                  (the theme switch and the modules marked menu: 'settings'); the bar's own fold toggle is off (pk-navbar no-fold)
//   side nav       layout 'side' (the default): the modules are the top-level sections, the ACTIVE one open and holding its own nav (def.nav); on a narrow screen the same list is the drawer.
//                  layout 'top' (the exception, for a tiny app): the module links are in the bar and the nav holds only the active module's entries; narrow, the drawer starts with the
//                  module list. Both render ONE menu tree (js/app/nav.js menuTree)
//   breadcrumbs    App > Module > the nav entry the route belongs to > the route labels (a record route sits under its list in the route tree); the document title is the last crumb and the app title
//   search         pk-app-bar-search; results come from the active module's def.search(query, ctx), else from its nav; ctx.search = { query, subscribe(fn) }
//   theme          ?theme= wins over the stored choice, which wins over config.theme.default; kept in the store ('<prefix>.app'), whoever changes data-theme
//   route change   focus moves to the page's h1 (else the main region), a polite live region says "<title>, page loaded", the document title and scroll follow
//   prefetch       hovering or focusing a module link for 100 ms calls that module's own allow-listed loader once (the browser keeps the chunk), never on saveData
//   regions        an empty pk-toast-stack and dialog host are mounted for the toast and dialog services (#373); nothing shows until they are used
//
// What is in the entry and what loads later (#514, the pattern for an app that stays small): the entry holds only what the first paint of a route needs (the config check, the router,
// the module host and its boundaries, the shell, the nav, the page overlay, the store and the three theme calls of js/theme-core.js; the override and colour code of js/theme.js stays out). Everything that waits for a user or a module loads on first use through the ONE
// allowed import() (js/app/module.js): a page type when a route names it (js/app/pages/<type>.js), and the task, notification and dialog services when a module first calls
// ctx.tasks, ctx.notify or ctx.dialogs (js/app/lazy.js: same contract, the code arrives with the first call; the chunks are js/app/pages/svc-*.js). Each chunk file stays under the
// per-chunk budget, and tests/app-budgets.test.mjs holds the entry's size down (limits only ever come down).
//
// destroy() ends the router, the host (which unmounts the module), the store subscriptions, the theme observer and the prefetch timer, and removes what mountApp added:
// mount and destroy 100 times leave the listener, observer and timer counts where they were.
import { createLogger } from '../log.js';
import { createPage } from '../page.js';
import { createStore } from '../store.js';
import { withLegacy } from '../store-extras.js';
import { setTheme, currentTheme, toggleTheme } from '../theme-core.js';
import { loadElements } from '../loader.js';
import { mountRouter } from '../router.js';
import { mediaBelow } from '../breakpoints.js';
import { navRoutes } from '../route-tree.js';
import { MODULE_ID } from './module.js';
import { createModuleHost } from './host.js';
import { lazyServices } from './lazy.js';
import { readConfig, readFooter } from './config.js';
import { buildShell, footerNodes } from './shell.js';
import { navOf, absolute, menuTree, paintNav, paintLinks, pageContext, routeContext, markCurrent, searchNav } from './nav.js';

const log = createLogger('app');
// the last crumb of a page that is not a page
const LABELS = { 'not-found': 'Not found', forbidden: 'Not allowed', error: 'Something went wrong' };

export function mountApp(container, config) {
    const cfg = readConfig(config);
    const doc = container.ownerDocument, root = doc.documentElement, win = doc.defaultView;
    const entries = new Map(cfg.modules.map(m => [m.id, m]));
    let router, footerCustom = false, status = '', dead = false, first = true, seq = 0, sseq = 0, active = null, nav = [], routes = [], rows = null, found = new Map(), timer = 0;
    const hrefOf = path => router.href(path);
    const moduleHref = (id, path = '/') => hrefOf(`/${id}${path === '/' ? '' : path}`);

    // ---- state: the app namespace of the store holds the theme; ?theme= is a per-visit override that is not saved ----
    const store = createStore({ prefix: cfg.storage.prefix, version: cfg.storage.version });
    const spec = { defaults: { theme: cfg.theme.default }, schema: { theme: { enum: ['light', 'dark'] } }, persist: ['theme'], legacy: cfg.storage.legacy };
    const settings = store.module('app', Object.keys(spec.legacy).length ? withLegacy(spec) : spec);
    const asked = new URLSearchParams(win?.location?.search ?? '').get(cfg.theme.param);
    setTheme(root, asked === 'light' || asked === 'dark' ? asked : settings.get('theme'));

    // ---- the module host (in a detached box until the shell exists), the router that guards it, then the chrome ----
    const subs = new Set();
    let query = '';
    const search = { get query() { return query; }, subscribe: fn => (subs.add(fn), () => subs.delete(fn)) };
    const box = doc.createElement('div');
    // The three services load on first use (js/app/lazy.js, #514): toasts go to the shell's bottom-end pk-toast-stack (found when the first one shows), one dialog at a time for the whole app.
    const { tasks, notify, dialogs } = lazyServices({ container, log, load: loadElements });
    const host = createModuleHost(box, {
        modules: cfg.modules, auth: cfg.auth, can: cfg.can, store, settings, tasks, notify, dialogs, services: { search },
        router: { navigate: (...a) => router.navigate(...a), href: (...a) => router.href(...a) },
    });
    router = mountRouter(container, { mode: cfg.routing, base: cfg.base, guard: host.guard, aliases: { '/': `/${cfg.home}` }, notFound: 'Not found', intercept: cfg.routing === 'path' });
    const ui = buildShell(doc, cfg, hrefOf);
    ui.host.replaceWith(...box.childNodes);
    const page = createPage({ breadcrumb: ui.crumbs, fullscreen: true, scope: 'app' });
    container.replaceChildren(...ui.nodes);
    loadElements(container);

    // ---- theme: one observer, whoever changes data-theme (the switch, ctx.theme, a theme editor) ----
    const paintTheme = () => { ui.themeItem.textContent = currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme'; };
    const themeWatch = new (win?.MutationObserver ?? MutationObserver)(() => { settings.set('theme', currentTheme(root)); paintTheme(); });
    paintTheme();
    themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    ui.themeItem.addEventListener('pk-select', () => toggleTheme(root));

    // ---- what the reader sees for the module that is mounted ----
    // side (the default): the one nav is the module list, the active module a section holding its own entries. top: the bar holds the module links and the nav only the active
    // module's entries; below the bar's fold point the bar has no links and the drawer starts with the module list. Either way a narrow screen has ONE menu, the drawer.
    const side = cfg.layout === 'side', narrow = mediaBelow('tablet');
    function drawNav() {
        const a = host.current(), small = !side && narrow.matches;
        nav = a ? navOf(a.def, a.ctx) : [];
        routes = navRoutes(nav);
        rows = null;
        const shown = absolute(nav, path => moduleHref(a.id, path)), tree = menuTree(cfg.modules, hrefOf, a?.id, shown), title = nav.length ? entries.get(a.id).title : '';
        for (const link of ui.navbar.querySelectorAll('a[data-module]')) link.remove();
        if (!side) ui.actions.before(...paintLinks(doc, tree));
        if (!side && !nav.length && !small) { ui.sideNav.remove(); ui.toggle.remove(); ui.skipNav.remove(); return; }
        ui.sideNav.setAttribute('label', side || small ? 'Menu' : `${title} menu`);
        rows = paintNav(doc, ui.sideNav, side ? [{ items: tree }] : [...(small ? [{ heading: 'Modules', items: tree.map(({ children, ...it }) => it) }] : []), { heading: small && nav.length ? title : '', items: shown }]);
        ui.shell.append(ui.sideNav, ui.toggle);
        ui.skip.after(ui.skipNav);
        loadElements(container);
    }
    const here = a => pageContext(a.def, routes, a.route.path, routeContext(a.def, a.route));
    const mark = () => { const a = host.current(); if (rows && a && status === 'ok') markCurrent(rows, here(a).ids); };
    // A wide side layout has the side nav's own collapse chevron (icon rail): a second hamburger hiding the same nav would duplicate it (#448), so there the menu control only opens the drawer.
    const syncToggle = () => ui.toggle.toggleAttribute('hidden', side && !narrow.matches);
    const onNarrow = () => { if (!side) { drawNav(); mark(); } syncToggle(); };
    narrow.addEventListener('change', onNarrow);
    syncToggle();
    // the menu is in the page from the first paint: nothing moves when the first module arrives
    drawNav();

    function trail(a) {
        const inner = status === 'ok' && a.route.path !== '/' ? here(a).crumbs.filter(c => c.href !== '/').map(c => ({ label: c.label, href: c.href && moduleHref(a.id, c.href) })) : [];
        return [{ label: cfg.brand.text, href: hrefOf('/') }, ...(a ? [{ label: entries.get(a.id).title, href: moduleHref(a.id) }] : []), ...inner, ...(LABELS[status] ? [{ label: LABELS[status] }] : [])];
    }

    // A module's own `footer` ({ text, links }, or false for none) replaces the app's while it is active; a bad one is logged and the app footer stays.
    function drawFooter(a) {
        let footer = cfg.footer;
        if (a?.def.footer !== undefined) try { footer = a.def.footer === false ? null : readFooter(a.def.footer, `${a.id}.footer`); } catch (e) { log.error(`bad footer of "${a.id}"`, e); }
        for (const el of ui.shell.querySelectorAll(':scope > [slot="footer"]')) el.remove();
        ui.shell.append(...footerNodes(doc, footer));
    }

    function settle(result) {
        const a = host.current();
        // a page that failed leaves the module (and its trail) as it was; nothing mounted shows the error crumb
        status = result === 'error' && a ? 'ok' : result;
        if (a?.id !== active) { active = a?.id ?? null; drawNav(); if (a?.def.footer !== undefined || footerCustom) drawFooter(a); footerCustom = a?.def.footer !== undefined; }
        mark();
        const crumbs = trail(a).map((c, i, all) => (i === all.length - 1 ? { label: c.label } : c));
        const label = crumbs[crumbs.length - 1].label;
        page.setBreadcrumbs(crumbs);
        page.setTitle(crumbs.length > 1 ? `${label} - ${cfg.title}` : cfg.title);
        if (first) { first = false; return; }
        const target = ui.main.querySelector('h1,pk-heading[level="1"]') ?? ui.main, own = target.closest('pk-empty-state'), go = () => target.focus({ preventScroll: true });
        // The boundary's alert announces itself; only its own placeholder title takes focus.
        if (result === 'error' && !own) return;
        if (result !== 'error') ui.live.textContent = `${label}, page loaded`;
        target.tabIndex = -1;
        // A boundary title's elements may be undefined yet: focus given before they upgrade is lost.
        own ? loadElements(ui.main).then(go) : go();
        ui.main.scrollIntoView?.({ block: 'nearest' });
    }

    async function render() {
        const cur = router.current(), n = ++seq;
        // a chosen page closes the drawer at once, not after it has loaded
        if (ui.sideNav.open) ui.sideNav.hide();
        // ctx.search subscribers end with their module, before the next one mounts and subscribes
        if (cur.url.split('/')[1] !== active) subs.clear();
        const result = await host.open(cur.url, cur.query);
        if (n === seq && !dead && result !== 'superseded') settle(result);
    }
    const stopRoute = router.subscribe(() => render().catch(e => log.error('route change failed', e)));
    render().catch(e => log.error('first route failed', e));

    // ---- header search ----
    ui.search?.addEventListener('pk-query', async e => {
        query = e.detail.query;
        const a = host.current(), n = ++sseq;
        for (const fn of [...subs]) try { fn(query); } catch (err) { log.error('search subscriber threw', err); }
        let list = [];
        if (a && query.trim().length >= cfg.search.minLength) {
            try { list = await (a.def.search ? a.def.search(query, a.ctx) : searchNav(nav, query)); } catch (err) { log.error(`search of "${a.id}" threw`, err); }
        }
        if (n !== sseq || dead) return;
        list = Array.isArray(list) ? list : [];
        found = new Map(list.map(it => [String(it.id), it]));
        ui.search.items = list.map(({ id, label, sub, group, badge }) => ({ id: String(id), label: String(label), sub, group, badge }));
    });
    ui.search?.addEventListener('pk-select', e => {
        const item = found.get(String(e.detail.item.id));
        if (item?.route != null) host.current()?.ctx.navigate(item.route);
    });

    // ---- prefetch on intent ----
    const idOf = e => e.target?.closest?.('[data-module]')?.getAttribute('data-module');
    const warm = new Set();
    for (const el of [ui.navbar, ui.sideNav]) {
        for (const ev of ['pointerover', 'focusin']) el.addEventListener(ev, e => intent(idOf(e)));
        for (const ev of ['pointerout', 'focusout']) el.addEventListener(ev, () => clearTimeout(timer));
    }
    function intent(id) {
        clearTimeout(timer);
        const entry = id && MODULE_ID.test(id) && entries.get(id);
        if (!entry || warm.has(id) || globalThis.navigator?.connection?.saveData) return;
        // ms: the prefetch delay
        timer = setTimeout(() => { warm.add(id); Promise.resolve().then(entry.load).catch(e => log.warn(`prefetch failed: "${id}"`, e)); }, 100);
    }

    return {
        navigate: (path, options) => router.navigate(path, options),
        page, settings,
        async destroy() {
            if (dead) return;
            dead = true;
            clearTimeout(timer);
            stopRoute();
            router.destroy();
            themeWatch.disconnect();
            narrow.removeEventListener('change', onNarrow);
            await host.destroy();
            for (const svc of [tasks, notify, dialogs]) svc.destroy();
            page.destroy();
            store.destroy();
            container.replaceChildren();
        },
    };
}
