import { defineModule } from '../../../js/app.js';
import { note } from './page.js';

// Two destinations, structure only; the breadcrumbs follow the nav (Demo app > Reports > Exports).
export default defineModule({
    id: 'reports', title: 'Reports',
    nav: () => [{ id: 'summary', title: 'Summary', route: '/', icon: 'dashboard' }, { id: 'exports', title: 'Exports', route: '/exports', badge: 3 }],
    routes: [
        { path: '/', page: 'custom', config: { mount: note('Summary', 'Sales and audit figures at a glance.') } },
        { path: '/exports', page: 'custom', config: { mount: note('Exports', 'Three exports are ready to download.') } },
        { path: '*', page: 'not-found' },
    ],
});
