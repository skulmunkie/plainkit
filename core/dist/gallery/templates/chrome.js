// Chrome for the example pages: wraps a page's <main id="content"> in the SDK app shell (pk-app-shell with a pk-side-nav or a pk-navbar), in a
// side-nav or top-nav variant (?nav=side|top) and a theme (?theme=dark|light, ?density=compact). Everything here is SDK markup; a real app
// would emit the same. The elements bring their own behaviour (drawer, dropdown, collapse): this only loads them. Framework-free; ES module.

import { loadElements, observeElements } from '../../js/loader.js';
import { setTheme } from '../../js/theme.js';
import { initInvokers } from '../../js/invokers.js';

const params = new URLSearchParams(location.search);
// ?width=phone on a page of its own: hand over to the preview host, which shows the page in a real 375px frame (media queries answer to the
// frame's width, so it is a phone layout and not a narrow desktop one). The gallery's own frames never pass it, so there is no loop.
if (params.get('width') === 'phone' && window.top === window && innerWidth > 480) {
    const id = location.pathname.split('/').at(-2);
    const host = new URL("../preview.html", import.meta.url);
    host.search = new URLSearchParams({ kind: 'templates', id, width: 'phone', theme: params.get('theme') === 'light' ? 'light' : 'dark', nav: params.get('nav') === 'top' ? 'top' : 'side' }).toString();
    location.replace(host.href);
}
// The example forms are not submitted anywhere.
document.addEventListener('submit', e => e.preventDefault());
const variant = params.get('nav') === 'top' ? 'top' : 'side';
const q = variant === 'top' ? '?nav=top' : '?nav=side';

// Each template lives in its own folder: crud.html is at ../crud/crud.html from a sibling template.
const href = file => `../${file.replace('.html', '')}/${file}`;

const NAV = [['document', 'Page', 'page.html'], ['tools', 'Workspace', 'workspace.html'], ['products', 'List and detail', 'crud.html'], ['dashboard', 'Dashboard', 'dashboard.html'], ['settings', 'Form and settings', 'form.html'], ['plus', 'Wizard', 'wizard.html'], ['orders', 'Master and detail', 'master-detail.html'], ['audit', 'States', 'states.html'], ['customers', 'Auth', 'auth.html']];

// `actions` is markup for the page header's action slot (pk-button elements); every top-level element in it is slotted there.
export function mountChrome({ title, page, crumbs = [], actions = '', fill = false }) {
    setTheme(document.documentElement, params.get('theme') === 'light' ? 'light' : 'dark');
    if (params.get('density') === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    const content = document.getElementById('content');
    // A page that fills the shell body (a workspace) is slotted as it is; any other page sits in a centred, stacked container.
    const body = fill ? content : document.createElement('pk-stack');
    if (!fill) body.className = 'container';
    const crumbHtml = crumbs.length ? `<pk-breadcrumb slot="breadcrumb" label="Breadcrumb">${crumbs.map(c => `<a href="${href(c[1])}${q}">${c[0]}</a>`).join('')}<span aria-current="page">${title}</span></pk-breadcrumb>` : '';
    if (fill) { /* the content is the body */ } else if (crumbHtml || actions || variant === 'top') {
        const head = document.createElement('div');
        head.innerHTML = `<pk-page-header${variant === 'top' ? ` heading="${title}" level="1"` : ''}>${crumbHtml}${actions}</pk-page-header>`;
        const header = head.firstElementChild;
        for (const el of header.children) if (!el.hasAttribute('slot')) el.setAttribute('slot', 'actions');
        body.append(header, content);
    } else { body.append(content); }
    const user = `<pk-dropdown slot="${variant === 'top' ? 'actions' : 'header'}" placement="bottom-end"><pk-button slot="trigger" variant="ghost" size="mini">User</pk-button><pk-menu-item href="${href('form.html')}${q}">Settings</pk-menu-item><pk-menu-item href="${href('auth.html')}${q}">Sign out</pk-menu-item></pk-dropdown>`;
    // Search is the command palette (Ctrl+K), opened by an icon button: it works at every width, unlike a text field in a phone-width header.
    const search = slot => `<pk-button slot="${slot}" variant="ghost" size="mini" icon data-open="#palette" label="Search"><pk-icon name="search"></pk-icon></pk-button>`;
    const footer = '<span slot="footer">Plainkit example</span><span slot="footer" class="u-ml-auto">v1.0</span>';
    document.body.replaceChildren();
    const shell = document.createElement('pk-app-shell');
    const items = NAV.map(([i, l, h]) => `<pk-nav-item href="${href(h)}${q}"${h === page + '.html' ? ' current' : ''}><pk-icon slot="icon" name="${i}"></pk-icon>${l}</pk-nav-item>`).join('');
    if (variant === 'top') {
        const links = NAV.map(([, l, h]) => `<a href="${href(h)}${q}"${h === page + '.html' ? ' aria-current="page"' : ''}>${l}</a>`).join('');
        shell.innerHTML = `<pk-navbar slot="header" label="Main"><a slot="brand" href="${href('page.html')}${q}">Template app</a>${fill ? `<h1 slot="brand" class="u-m-0 u-fs-1p05r u-fw-600">${title}</h1>` : ''}${links}${search('actions')}${user}</pk-navbar>${footer}`;
    } else {
        shell.innerHTML = `<pk-side-nav slot="nav" label="Main" persist="pk-example-nav"><a slot="brand" href="${href('page.html')}${q}">Template app</a>${items}<pk-nav-item slot="footer" href="${href('form.html')}${q}"><pk-icon slot="icon" name="settings"></pk-icon>Settings</pk-nav-item></pk-side-nav><pk-button slot="header" variant="ghost" size="mini" icon data-nav-toggle label="Open menu"><pk-icon name="menu"></pk-icon></pk-button><h1 slot="header" class="u-m-0 u-fs-1p05r u-fw-600 u-flex-1">${title}</h1>${search('header')}${user}${footer}`;
    }
    shell.append(body);
    const palette = document.createElement('pk-command-palette');
    palette.id = 'palette';
    // `items` is a property: set it once the element is defined, or the upgrade would leave it shadowed.
    customElements.whenDefined('pk-command-palette').then(() => { palette.items = NAV.map(([, l, h]) => ({ id: h, label: l, group: 'Templates', href: `${href(h)}${q}` })); });
    document.body.append(shell, palette);
    wireOpeners();
    loadElements(document);
    observeElements(document);
}

// Opens and closes the page's dialogs and drawers with data-open="#id" and data-close: the SDK's shared invokers (js/invokers.js).
export const wireOpeners = (root = document) => initInvokers(root);
