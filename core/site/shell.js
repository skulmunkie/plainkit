// The SDK site shell: ONE primary navigation, the top navbar (.tnav: brand, page links, search that collapses on a phone, theme
// switch, hamburger). Each page owns its own content tree below it (the gallery's side nav is that tree). Built from the SDK's
// own nav classes, so the site is the showcase. Framework-free; ES module.

import { initPlainkit } from '../js/plainkit.js';
import { toggleTheme, setTheme, currentTheme } from '../js/theme.js';
import { readSetting as read, writeSetting as write } from './gallery/settings.js';

const PK_ROOT = new URL('../', import.meta.url).href;
export const PAGES = [
    { key: 'gallery', title: 'Gallery', href: '../gallery/index.html' },
    { key: 'templates', title: 'Templates', href: '../gallery/index.html#/samples/templates' },
    { key: 'spacing', title: 'Spacing', href: '../spacing/index.html' },
    { key: 'theme', title: 'Theme editor', href: '../theme/index.html' },
    { key: 'scorecard', title: 'Scorecard', href: '../scorecard/index.html' },
    { key: 'files', title: 'Files', href: '../files/index.html' },
    { key: 'guides', title: 'Guides', href: '../guides/index.html' },
];

const THEME_KEY = 'pk-site-theme';
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${PK_ROOT}icons.svg#${name}"/></svg>`;


// options: { page, title, search: { placeholder } | null }. Dispatches "site-search" (detail: string) and "site-theme" (detail: name) on document.
export function mountShell({ page, title, search = null }) {
    const root = document.documentElement;
    setTheme(root, new URLSearchParams(location.search).get('theme') ?? read(THEME_KEY) ?? 'dark');
    document.body.classList.add('site');
    const header = document.createElement('header');
    header.className = 'tnav';
    header.innerHTML = `
        <a class="tnav-brand" href="${PK_ROOT}index.html">Plainkit</a>
        <ul class="tnav-links">${PAGES.map(p => `<li><a class="tnav-link${p.key === page ? ' active' : ''}" href="${p.href}"${p.key === page ? ' aria-current="page"' : ''}>${p.title}</a></li>`).join('')}</ul>
        <span class="tnav-spacer"></span>
        <div class="tnav-actions">${search ? `
            <div class="app-search" data-pk-search>
                <button type="button" class="app-search-toggle" aria-label="Search" aria-expanded="false">${icon('search')}</button>
                <input class="app-search-input" type="search" aria-label="${search.placeholder}" placeholder="${search.placeholder}">
                <button type="button" class="app-search-close" aria-label="Close search">${icon('x')}</button>
            </div>` : ''}
            <button type="button" class="btn-mini btn-ghost" id="site-theme" aria-label="Switch theme">${currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme'}</button></div>
        <button type="button" class="mobile-nav-toggle" data-pk-nav-toggle aria-label="Site menu" aria-expanded="false"><span></span><span></span><span></span></button>`;
    document.body.prepend(header);
    if (title) { const h1 = document.createElement('h1'); h1.className = 'u-sr-only'; h1.textContent = title; header.after(h1); }
    header.querySelector('#site-theme').addEventListener('click', e => {
        write(THEME_KEY, toggleTheme(root));
        e.currentTarget.textContent = currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme';
        document.dispatchEvent(new CustomEvent('site-theme', { detail: currentTheme(root) }));
    });
    header.querySelector('.app-search-input')?.addEventListener('input', e => document.dispatchEvent(new CustomEvent('site-search', { detail: e.target.value })));
    initPlainkit(document);
    return { root };
}

export { read as readSetting, write as writeSetting };
