// The demo app's config (js/app/config.js): the module list is the side nav's top-level sections and the only code the app may import. No CSS, no class, no chrome of its own.
export default {
    brand: { text: 'Demo app' },
    modules: [
        { id: 'overview', title: 'Overview', icon: 'document', load: () => import('./modules/overview.js') },
        { id: 'orders', title: 'Orders', icon: 'orders', load: () => import('./modules/orders.js') },
        { id: 'reports', title: 'Reports', icon: 'dashboard', load: () => import('./modules/reports.js') },
    ],
    search: { placeholder: 'Search orders and reports' },
    footer: { text: 'Plainkit demo app' },
};
