// Templates and Spacing are sections of the Gallery's own tree (#/samples/templates, #/foundations/spacing), not top-level pages.
// The SDK site shell: ONE primary navigation, the top navbar (pk-navbar: brand, page links, search that collapses to a button on a phone, settings
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

// The search field: a pk-input (type=search) shown inline on a desktop bar. Up to 640px it collapses to a pk-button (icon); the button turns the
// field into a full-width row over the bar (site.css, [data-open]) with a close button, and Escape or the close button puts it back.
// It dispatches "site-search" (detail: the text) on document as the reader types.
function searchField(placeholder) {
    const field = h('pk-input', { class: 'site-search-field', type: 'search', label: placeholder, placeholder });
    const toggle = h('pk-button', { class: 'site-search-toggle', variant: 'ghost', icon: true, label: 'Search' }, h('pk-icon', { name: 'search' }));
    const close = h('pk-button', { class: 'site-search-close', variant: 'ghost', icon: true, label: 'Close search' }, h('pk-icon', { name: 'x' }));
    const box = h('div', { class: 'site-search' }, toggle, field, close);
    const set = open => { box.toggleAttribute('data-open', open); (open ? field : toggle).focus(); };
    toggle.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    box.addEventListener('keydown', e => { if (e.key === 'Escape' && box.hasAttribute('data-open')) { e.preventDefault(); set(false); } });
    field.addEventListener('input', () => document.dispatchEvent(new CustomEvent('site-search', { detail: field.value })));
    return box;
}

// The theme switch lives in the settings (profile) menu at the end of the bar, next to a link to the Settings page.
// options: { page, title, search: { placeholder } | null }. Dispatches "site-search" (detail: string) and "site-theme" (detail: name) on document.
// Returns { root, destroy() }.
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
    // The label follows the theme attribute on <html>, whoever changes it (this item, the Settings page, the theme editor's own switch): one
    // MutationObserver, no polling. destroy() disconnects it for a host that unmounts the shell.
    const paintTheme = () => { const label = currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme'; if (themeItem.textContent !== label) themeItem.textContent = label; };
    const themeWatch = new MutationObserver(paintTheme);
    themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    themeItem.addEventListener('pk-select', () => {
        write(THEME_KEY, toggleTheme(root));
        document.dispatchEvent(new CustomEvent('site-theme', { detail: currentTheme(root) }));
    });
    initPlainkit(document);
    return { root, destroy: () => themeWatch.disconnect() };
}

export { read as readSetting, write as writeSetting };
