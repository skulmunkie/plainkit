// layout: 'top' is the exception: the modules are links in the header bar. Use it for an app with a few modules and no module nav; on a narrow screen the links move into the
// same single drawer as everything else. Most apps keep the default, 'side'.
export default {
    brand: { text: 'Tiny app' },
    layout: 'top',
    modules: [
        { id: 'overview', title: 'Overview', load: () => import('./modules/overview.js') },
        { id: 'about', title: 'About', load: () => import('./modules/about.js') },
    ],
    footer: { text: 'Plainkit demo app, top layout' },
};
