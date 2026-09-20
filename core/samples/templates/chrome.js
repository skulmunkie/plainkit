// Chrome for the example pages: wraps a page's <main id="content"> in the SDK app shell, in a side-nav or top-nav variant
// (?nav=side|top) and a theme (?theme=dark|light, ?density=compact). Everything here is SDK markup; a real app would emit the same.
// Framework-free; ES module.

import { initPlainkit } from '../../js/plainkit.js';
import { setTheme } from '../../js/theme.js';

const params = new URLSearchParams(location.search);
// The example forms are not submitted anywhere.
document.addEventListener('submit', e => e.preventDefault());
const variant = params.get('nav') === 'top' ? 'top' : 'side';
const q = variant === 'top' ? '?nav=top' : '?nav=side';
const ICONS = new URL("../../icons.svg", import.meta.url).href;
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${ICONS}#${n}"/></svg>`;

// Each template lives in its own folder: crud.html is at ../crud/crud.html from a sibling template.
const href = file => `../${file.replace('.html', '')}/${file}`;

const NAV = [
    ['Templates', [['document', 'Page', 'page.html'], ['tools', 'Workspace', 'workspace.html'], ['products', 'List and detail', 'crud.html'], ['dashboard', 'Dashboard', 'dashboard.html'], ['settings', 'Form and settings', 'form.html'], ['plus', 'Wizard', 'wizard.html'], ['orders', 'Master and detail', 'master-detail.html'], ['audit', 'States', 'states.html'], ['customers', 'Auth', 'auth.html']]],
];

export function mountChrome({ title, page, crumbs = [], actions = '', fill = false }) {
    setTheme(document.documentElement, params.get('theme') === 'light' ? 'light' : 'dark');
    if (params.get('density') === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    const content = document.getElementById('content');
    const body = document.createElement('div');
    body.className = fill ? 'shell-body shell-body--fill' : 'shell-body';
    const crumbHtml = crumbs.length ? `<nav class="page-crumbs" aria-label="Breadcrumb">${crumbs.map(c => `<a href="${href(c[1])}${q}">${c[0]}</a><span class="page-crumbs-sep" aria-hidden="true">&rsaquo;</span>`).join('')}<span class="page-crumbs-current">${title}</span></nav>` : '';
    const head = `<header class="page-header">${crumbHtml}<div class="page-header-titlebar">${variant === 'top' ? `<h1>${title}</h1>` : ''}<div class="page-header-actions">${actions}</div></div></header>`;
    if (fill) { body.append(content); } else { const c = document.createElement('div'); c.className = 'container stack'; c.innerHTML = head; c.append(content); body.append(c); }
    const footer = '<footer class="shell-footer"><span>Plainkit example</span><span class="shell-footer-end">v1.0</span></footer>';
    const search = `<div class="app-search" data-pk-search><button type="button" class="app-search-toggle" aria-label="Search" aria-expanded="false">${icon('search')}</button><input class="app-search-input" type="search" aria-label="Search" placeholder="Search"><button type="button" class="app-search-close" aria-label="Close search">${icon('x')}</button></div>`;
    const user = '<div class="dropdown dropdown--end" data-pk-dropdown><button type="button" class="btn-mini btn-ghost" aria-expanded="false" aria-haspopup="true">User</button><div class="dropdown-menu" hidden><a class="dropdown-item" href="' + href('form.html') + q + '">Settings</a><a class="dropdown-item" href="' + href('auth.html') + q + '">Sign out</a></div></div>';
    document.body.replaceChildren();
    const shell = document.createElement('div');
    if (variant === 'top') {
        shell.className = 'shell shell--top';
        shell.innerHTML = `<header class="tnav"><a class="tnav-brand" href="${href('page.html')}${q}">Template app</a>${fill ? `<h1 class="topbar-title">${title}</h1>` : ''}<ul class="tnav-links">${NAV.flatMap(g => g[1]).map(([, l, h]) => `<li><a class="tnav-link${h === page + ".html" ? ' active' : ''}" href="${href(h)}${q}"${h === page + ".html" ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}</ul><span class="tnav-spacer"></span><div class="tnav-actions">${search}${user}</div><button type="button" class="mobile-nav-toggle" data-pk-nav-toggle aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button></header><div class="shell-main"></div>`;
    } else {
        shell.className = 'shell';
        shell.innerHTML = `<aside class="snav" data-pk-nav-persist="pk-example-nav"><a class="snav-brand" href="${href('page.html')}${q}"><span class="snav-brand-text">Template app</span><button type="button" class="btn-mini btn-ghost" data-pk-nav-collapse aria-label="Collapse the menu">&laquo;</button></a><nav class="snav-scroll" aria-label="Main">${NAV.map(([g, items]) => `<ul class="snav-group"><li class="snav-group-title">${g}</li>${items.map(([i, l, h]) => `<li><a class="snav-link" href="${href(h)}${q}"${h === page + ".html" ? ' aria-current="page"' : ''}>${icon(i)}<span class="snav-label">${l}</span></a></li>`).join('')}</ul>`).join('')}</nav><div class="snav-foot"><a class="snav-link" href="form.html${q}">${icon('settings')}<span class="snav-label">Settings</span></a></div></aside><div class="shell-backdrop" data-pk-nav-close></div><div class="shell-main"><header class="top-row"><button type="button" class="mobile-nav-toggle" data-pk-nav-toggle aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button><div class="app-header-title"><h1 class="topbar-title">${title}</h1></div><div class="app-header-search">${search}</div>${user}</header></div>`;
    }
    const main = shell.querySelector('.shell-main');
    main.append(body, ...(variant === 'top' ? [] : []));
    main.insertAdjacentHTML('beforeend', footer);
    document.body.append(shell);
    initPlainkit(document);
}
