// Templates and Spacing are sections of the Gallery's own tree (#/samples/templates, #/foundations/spacing), not top-level pages.
// The SDK site shell: ONE primary navigation, the top navbar (pk-navbar: brand, page links, search that collapses on a phone, settings
// menu, hamburger). Each page owns its own content tree below it (the gallery's side nav is that tree). Built from the SDK's own
// elements, so the site is the showcase. Framework-free; ES module.

import { initPlainkit } from '../js/plainkit.js';
import { toggleTheme, setTheme, currentTheme } from '../js/theme.js';
import { readSetting as read, writeSetting as write } from './gallery/settings.js';

const PK_ROOT = new URL('../', import.meta.url).href;
export const PAGES = [
    { key: 'gallery', title: 'Gallery', href: '../gallery/index.html' },
    { key: 'files', title: 'Files', href: '../files/index.html' },
    { key: 'scorecard', title: 'Scorecard', href: '../scorecard/index.html' },
    { key: 'theme', title: 'Theme editor', href: '../theme/index.html' },
    { key: 'guides', title: 'Guides', href: '../guides/index.html' },
    { key: 'devtools', title: 'Dev tools', href: '../devtools/index.html' },
];

const THEME_KEY = 'pk-site-theme';

function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children);
    return el;
}

// The search field that collapses to a button on a phone. No element covers this yet, so it keeps the old app-search classes (wired by
// initPlainkit); everything around it is elements.
function searchField(placeholder) {
    return h('div', { class: 'app-search', 'data-pk-search': true },
        h('button', { type: 'button', class: 'app-search-toggle', 'aria-label': 'Search', 'aria-expanded': 'false' }, h('pk-icon', { name: 'search' })),
        h('input', { class: 'app-search-input', type: 'search', 'aria-label': placeholder, placeholder }),
        h('button', { type: 'button', class: 'app-search-close', 'aria-label': 'Close search' }, h('pk-icon', { name: 'x' })));
}

// The theme switch lives in the settings (profile) menu at the end of the bar, next to a link to the Settings page.
// options: { page, title, search: { placeholder } | null }. Dispatches "site-search" (detail: string) and "site-theme" (detail: name) on document.
export function mountShell({ page, title, search = null }) {
    const root = document.documentElement;
    setTheme(root, new URLSearchParams(location.search).get('theme') ?? read(THEME_KEY) ?? 'dark');
    document.body.classList.add('site');
    const themeItem = h('pk-menu-item', { id: 'site-theme' }, currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme');
    const header = h('pk-navbar', { label: 'Site' },
        h('a', { slot: 'brand', href: `${PK_ROOT}index.html` }, 'Plainkit'),
        ...PAGES.map(p => h('a', { href: p.href, 'aria-current': p.key === page ? 'page' : false }, p.title)),
        h('div', { slot: 'actions', class: 'site-actions' },
            ...(search ? [searchField(search.placeholder)] : []),
            h('pk-dropdown', { placement: 'bottom-end' },
                h('pk-button', { slot: 'trigger', variant: 'ghost', icon: true, label: 'Settings menu' }, h('pk-icon', { name: 'settings' })),
                themeItem,
                h('pk-menu-item', { href: '../settings/index.html', 'aria-current': page === 'settings' ? 'page' : false }, 'Settings'))));
    document.body.prepend(header);
    if (title) { const h1 = h('h1', { class: 'u-sr-only' }, title); header.after(h1); }
    themeItem.addEventListener('pk-select', () => {
        write(THEME_KEY, toggleTheme(root));
        themeItem.textContent = currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme';
        document.dispatchEvent(new CustomEvent('site-theme', { detail: currentTheme(root) }));
    });
    header.querySelector('.app-search-input')?.addEventListener('input', e => document.dispatchEvent(new CustomEvent('site-search', { detail: e.target.value })));
    initPlainkit(document);
    return { root };
}

export { read as readSetting, write as writeSetting };
