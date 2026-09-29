// The chrome of an app (#350), built once by mountApp from existing elements only: no style attribute, no class of its own, no stylesheet. Attributes and textContent
// only, so nothing here depends on which elements are defined yet (a pk-* tag renders hidden until defined, and mountApp loads what it created afterwards).
//
//   <pk-skip-link href="#pk-main">, <pk-skip-link href="#pk-nav">                    first focusable; the second only while there is a menu
//   <pk-app-shell>                                                                   landmarks: header (banner), footer, the one <main>
//     <pk-side-nav slot="nav" id="pk-nav">                                           the menu (js/app/nav.js): the modules as sections (side layout) or the active module's own entries (top)
//     <pk-button slot="header" data-nav-toggle>                                      the ONE menu control: opens the drawer (hidden on a wide side layout, where the side nav has its own rail chevron, #448)
//     <pk-navbar slot="header" label="Main" no-fold>                                 the brand, the module links (top layout only), pk-app-bar-search and the settings menu
//     <main id="pk-main" tabindex="-1"><pk-stack><pk-breadcrumb/><div>the module host</div></pk-stack></main>
//     <span slot="footer">...</span>                                                 only with config.footer
//   <div role="status" aria-live="polite">                                           the route announcement (the framework's u-sr-only utility keeps it off the screen)
//   <pk-toast-stack/>, <div data-pk-dialogs/>                                        regions reserved for the toasts and the dialog host (#373 fills them)
const h = (doc, tag, attrs = {}, text) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    if (text != null) el.textContent = text;
    return el;
};

// The footer's slotted nodes (text as a span, links as anchors); the app footer and a module's own one are drawn by the same code. Text only, hrefs already checked by readFooter.
export const footerNodes = (doc, footer) => (footer ? [footer.text && h(doc, 'span', { slot: 'footer' }, footer.text), ...footer.links.map(l => h(doc, 'a', { slot: 'footer', href: l.href }, l.label))].filter(Boolean) : []);

export function buildShell(doc, cfg, hrefOf) {
    const settings = cfg.modules.filter(m => m.menu === 'settings');
    const skip = h(doc, 'pk-skip-link', { href: '#pk-main' }, 'Skip to content');
    const skipNav = h(doc, 'pk-skip-link', { href: '#pk-nav' }, 'Skip to the menu');
    const themeItem = h(doc, 'pk-menu-item', { value: 'theme' });
    const gear = h(doc, 'pk-dropdown', { slot: 'actions', placement: 'bottom-end' });
    gear.append(
        h(doc, 'pk-button', { slot: 'trigger', variant: 'ghost', icon: true, label: 'Settings menu' }),
        themeItem,
        ...settings.map(m => h(doc, 'pk-menu-item', { href: hrefOf(`/${m.id}`), 'data-module': m.id }, m.title)),
    );
    gear.firstChild.append(h(doc, 'pk-icon', { name: 'settings' }));
    const search = cfg.search && h(doc, 'pk-app-bar-search', { slot: 'actions', label: cfg.search.placeholder, placeholder: cfg.search.placeholder });
    const navbar = h(doc, 'pk-navbar', { slot: 'header', label: 'Main', 'no-fold': true });
    navbar.append(h(doc, 'a', { slot: 'brand', href: hrefOf('/') }, cfg.brand.text), ...(search ? [search] : []), gear);

    const toggle = h(doc, 'pk-button', { slot: 'header', variant: 'ghost', size: 'mini', icon: true, 'data-nav-toggle': true, label: 'Toggle the menu' });
    toggle.append(h(doc, 'pk-icon', { name: 'menu' }));
    const sideNav = h(doc, 'pk-side-nav', { slot: 'nav', id: 'pk-nav' });
    const crumbs = h(doc, 'pk-breadcrumb', { label: 'Breadcrumb' });
    const host = h(doc, 'div');
    const body = h(doc, 'pk-stack', { gap: 'md' });
    body.append(crumbs, host);
    const main = h(doc, 'main', { id: 'pk-main', tabindex: '-1' });
    main.append(body);
    const shell = h(doc, 'pk-app-shell');
    shell.append(navbar, main);
    shell.append(...footerNodes(doc, cfg.footer));
    const live = h(doc, 'div', { role: 'status', 'aria-live': 'polite', class: 'u-sr-only' });
    const toasts = h(doc, 'pk-toast-stack', { position: 'bottom-end' });
    const dialogs = h(doc, 'div', { 'data-pk-dialogs': true });
    return { nodes: [skip, shell, live, toasts, dialogs], skip, skipNav, shell, navbar, actions: search ?? gear, themeItem, search, toggle, sideNav, crumbs, host, main, live, toasts, dialogs };
}
