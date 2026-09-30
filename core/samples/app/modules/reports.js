import { defineModule } from '../../../js/app.js';

// Two destinations, structure only; the breadcrumbs follow the nav (Demo app > Reports > Exports).
export default defineModule({
    id: 'reports', title: 'Reports',
    nav: () => [{ id: 'summary', title: 'Summary', route: '/', icon: 'dashboard' }, { id: 'exports', title: 'Exports', route: '/exports', badge: 3 }],
    routes: [
        { path: '/', page: 'note', config: { heading: 'Summary', body: 'Sales and audit figures at a glance.', cardHeading: 'About this page' } },
        { path: '/exports', page: 'note', config: { heading: 'Exports', body: 'Three exports are ready to download.', cardHeading: 'About this page' } },
        { path: '*', page: 'not-found' },
    ],
});
