// The Plainkit site as ONE app (#346, #355): mountApp builds the bar, the theme and the routes. Settings and Dev tools are real modules; every other
// page of the old site is a THROWAWAY redirect entry (modules/redirect.js) that is deleted, entry by entry, as that page becomes a module.
import { mountApp } from '../js/app.js';

const redirect = (id, title, href) => ({ id, title, load: () => import('./modules/redirect.js').then(m => m.redirectTo(id, title, href)) });
mountApp(document.getElementById('app'), {
    brand: { text: 'Plainkit' },
    layout: 'top',
    home: 'devtools',
    search: false,
    storage: { legacy: { theme: 'pk-site-theme' } },
    modules: [
        redirect('gallery', 'Gallery', 'site/gallery/index.html'),
        redirect('files', 'Files', 'site/files/index.html'),
        redirect('scorecard', 'Scorecard', 'site/scorecard/index.html'),
        redirect('theme', 'Theme editor', 'site/theme/index.html'),
        redirect('layout-builder', 'Layout builder', 'site/layout-builder/index.html'),
        redirect('guides', 'Guides', 'site/guides/index.html'),
        { id: 'devtools', title: 'Dev tools', load: () => import('./modules/devtools.js') },
        { id: 'settings', title: 'Settings', menu: 'settings', load: () => import('./modules/settings.js') },
    ],
});
