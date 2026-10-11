// The Plainkit site as ONE app (#346, #355): mountApp builds the bar, the theme and the routes; every page of the old site is a lazy module in site/modules/.

export default {
    brand: { text: 'Plainkit' },
    home: 'devtools',
    search: { placeholder: 'Search this section' },
    storage: { legacy: { theme: 'pk-site-theme' } },
    modules: [
        { id: 'gallery', title: 'Gallery', load: () => import('./modules/gallery.js') },
        { id: 'files', title: 'Files', load: () => import('./modules/files.js') },
        { id: 'scorecard', title: 'Scorecard', load: () => import('./modules/scorecard.js') },
        { id: 'theme', title: 'Theme editor', load: () => import('./modules/theme.js') },
        { id: 'layout-builder', title: 'Layout builder', load: () => import('./modules/layout-builder.js') },
        { id: 'guides', title: 'Guides', load: () => import('./modules/guides.js') },
        { id: 'devtools', title: 'Dev tools', load: () => import('./modules/devtools.js') },
        { id: 'settings', title: 'Settings', menu: 'settings', load: () => import('./modules/settings.js') },
    ],
};
