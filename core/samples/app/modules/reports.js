import { defineModule } from '../../../js/app.js';
import { note } from './page.js';

// Two destinations, structure only; the breadcrumbs follow the nav (Demo app > Reports > Exports).
export default defineModule({
    id: 'reports', title: 'Reports',
    dashboardTabs: [{ id: 'reports', label: 'Reports' }],
    dashboard: () => [
        { key: 'exports', tab: 'reports', label: 'Exports ready', kind: 'stat', load: async () => ({ value: '3' }) },
        { key: 'modules-note', tab: 'overview', label: 'Reports module', kind: 'stat', load: async () => ({ value: 'on' }) },   // a second module adding to the first one's tab
    ],
    nav: () => [{ id: 'summary', title: 'Summary', route: '/', icon: 'dashboard' }, { id: 'exports', title: 'Exports', route: '/exports', badge: 3 }],
    routes: [
        { path: '/', page: 'custom', config: { mount: note('Summary', 'Sales and audit figures at a glance.') } },
        { path: '/dashboard', page: 'dashboard' },   // no config: composed from every module's dashboardTabs/dashboard (#494)
        { path: '/exports', page: 'custom', config: { mount: note('Exports', 'Three exports are ready to download.') } },
        { path: '*', page: 'not-found' },
    ],
});
