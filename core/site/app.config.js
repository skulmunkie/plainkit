// The Plainkit site as ONE app (#346, #355): mountApp builds the bar, the theme and the routes; every page of the old site is a lazy module in site/modules/.

export default {
    brand: { text: 'Plainkit' },
    home: 'overview',
    search: { placeholder: 'Search this section' },
    storage: { legacy: { theme: 'pk-site-theme' } },
    modules: [
        { id: 'overview', title: 'Overview', icon: 'dashboard', load: () => import('./modules/overview.js') },
        { id: 'gallery', title: 'Gallery', load: () => import('./modules/gallery.js'), contributes: [{ key: 'elements', for: ['overview'], label: 'Elements in the Gallery', kind: 'stat', size: 'sm', order: 20 }] },
        { id: 'files', title: 'Files', load: () => import('./modules/files.js') },
        { id: 'scorecard', title: 'Scorecard', load: () => import('./modules/scorecard.js'), contributes: [{ key: 'budgets', for: ['overview'], label: 'Budgets enforced', kind: 'stat', size: 'sm', order: 30 }] },
        { id: 'theme', title: 'Theme editor', load: () => import('./modules/theme.js'), contributes: [{ key: 'scheme', for: ['overview'], label: 'Colour scheme', kind: 'stat', size: 'sm', order: 40 }] },
        { id: 'layout-builder', title: 'Layout builder', load: () => import('./modules/layout-builder.js') },
        { id: 'guides', title: 'Guides', load: () => import('./modules/guides.js'), contributes: [{ key: 'count', for: ['overview'], label: 'Guides', kind: 'stat', size: 'sm', order: 10 }] },
        { id: 'devtools', title: 'Dev tools', load: () => import('./modules/devtools.js') },
        { id: 'settings', title: 'Settings', menu: 'settings', load: () => import('./modules/settings.js') },
    ],
};
