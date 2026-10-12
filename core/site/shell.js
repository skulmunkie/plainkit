// Templates and Spacing are sections of the Gallery's own tree (#/samples/templates, #/foundations/spacing), not top-level pages.
// The SDK site shell: ONE primary navigation, the top navbar (pk-navbar: brand, page links, pk-app-bar-search, a button on a phone, settings
// menu, hamburger). Each page owns its own content tree below it (the gallery's side nav is that tree). Built from the SDK's own
// elements, so the site is the showcase. Framework-free; ES module.

import { initPlainkit } from '../js/plainkit.js';
import { toggleTheme, setTheme, currentTheme } from '../js/theme.js';
import { readSetting as read, writeSetting as write } from './gallery/settings.js';
import { on, addressOf, h } from '../js/mount-support.js';

const PK_ROOT = new URL('../', import.meta.url).href;
export const PAGES = [
    { key: 'gallery', title: 'Gallery', href: '../gallery/index.html' },
    { key: 'files', title: 'Files', href: '../../app.html#/files' },
    { key: 'scorecard', title: 'Scorecard', href: '../../app.html#/scorecard' },
    { key: 'theme', title: 'Theme editor', href: '../../app.html#/theme' },
    { key: 'layout-builder', title: 'Layout builder', href: '../../app.html#/layout-builder' },
    { key: 'guides', title: 'Guides', href: '../../app.html#/guides' },
    { key: 'devtools', title: 'Dev tools', href: '../../app.html#/devtools' },
];

const THEME_KEY = 'pk-site-theme';


// The search field is the SDK's one reusable header search, pk-app-bar-search, (a pill on a desktop bar; on a phone an icon button that expands over
// the bar, Escape or its close button puts it back). It dispatches "site-search" (detail: the text) on document as the reader types. The site
// filters its own page, so the results panel is hidden (site.css).
function searchField(doc, placeholder) {
    const field = h(doc, 'pk-app-bar-search', { label: placeholder, placeholder, debounce: '0' });
    on(field, 'pk-query', e => doc.dispatchEvent(new CustomEvent('site-search', { detail: e.detail.query })));
    return field;
}
// The theme switch lives in the settings (profile) menu at the end of the bar, next to a link to the Settings page.
// options: { page, title, search: { placeholder } | null }. Dispatches "site-search" (detail: string) and "site-theme" (detail: name) on document.
// Returns { root, destroy() }.
export function mountShell({ page, title, search = null }, doc = document) {
    const root = doc.documentElement;
    setTheme(root, new URL(addressOf(doc.defaultView).href).searchParams.get('theme') ?? read(THEME_KEY) ?? 'dark');
    doc.body.classList.add('site');
    const themeItem = h(doc, 'pk-menu-item', { id: 'site-theme' }, currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme');
    const header = h(doc, 'pk-navbar', { label: 'Site' },
        h(doc, 'a', { slot: 'brand', href: `${PK_ROOT}index.html` }, 'Plainkit'),
        ...PAGES.map(p => h(doc, 'a', { href: p.href, 'aria-current': p.key === page ? 'page' : false }, p.title)),
        h(doc, 'div', { slot: 'actions', class: 'site-actions' },
            ...(search ? [searchField(doc, search.placeholder)] : []),
            h(doc, 'pk-dropdown', { placement: 'bottom-end' },
                h(doc, 'pk-button', { slot: 'trigger', variant: 'ghost', icon: true, label: 'Settings menu' }, h(doc, 'pk-icon', { name: 'settings' })),
                themeItem,
                h(doc, 'pk-menu-item', { href: '../../app.html#/settings', 'aria-current': page === 'settings' ? 'page' : false }, 'Settings'))));
    // A page that reserves the bar's space with a .site-boot-bar placeholder (site.css) gets it swapped in place, so the swap itself never
    // shifts anything (#135); a page without one falls back to the old prepend.
    const bootBar = doc.querySelector('.site-boot-bar');
    if (bootBar) bootBar.replaceWith(header); else doc.body.prepend(header);
    if (title) { const h1 = h(doc, 'h1', { class: 'u-sr-only' }, title); header.after(h1); }
    // The label follows the theme attribute on <html>, whoever changes it (this item, the Settings page, the theme editor's own switch): one
    // MutationObserver, no polling. destroy() disconnects it for a host that unmounts the shell.
    const paintTheme = () => { const label = currentTheme(root) === 'dark' ? 'Light theme' : 'Dark theme'; if (themeItem.textContent !== label) themeItem.textContent = label; };
    const themeWatch = new MutationObserver(paintTheme);
    themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    on(themeItem, 'pk-select', () => {
        write(THEME_KEY, toggleTheme(root));
        doc.dispatchEvent(new CustomEvent('site-theme', { detail: currentTheme(root) }));
    });
    initPlainkit(doc);
    return { root, destroy: () => themeWatch.disconnect() };
}

export { read as readSetting, write as writeSetting };
