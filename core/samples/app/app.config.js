// The demo app's config (js/app/config.js): the module list is the side nav's top-level sections and the only code the app may import. No CSS, no class, no chrome of its own.
export default {
    brand: { text: 'Demo app' },
    modules: [
        { id: 'overview', title: 'Overview', icon: 'document', load: () => import('./modules/overview.js') },
        { id: 'orders', title: 'Orders', icon: 'orders', load: () => import('./modules/orders.js'),
          // Widgets this module offers to the Overview dashboard: static data here, the code in the module's `widgets` (loaded only when the tab is shown).
          contributes: [
              { key: 'open', for: ['overview', 'orders'], tab: 'sales', label: 'Open orders', kind: 'stat', order: 10 },
              { key: 'revenue', for: ['overview', 'orders'], tab: 'sales', label: 'Revenue by month', kind: 'chart', order: 20 },
          ] },
        { id: 'reports', title: 'Reports', icon: 'dashboard', load: () => import('./modules/reports.js'),
          contributes: [{ key: 'exports', for: ['overview'], tab: 'ops', label: 'Exports ready', kind: 'stat' }] },
    ],
    search: { placeholder: 'Search orders and reports' },
    footer: { text: 'Plainkit demo app' },
};
