import { defineModule } from '../../../js/app.js';
import { note } from './page.js';

// A module with no nav: on a wide screen the page has the full width.
export default defineModule({
    id: 'overview', title: 'Overview',
    // Its share of the composed dashboard (reports.js has the route): a tab it introduces and a widget in it (#494).
    dashboardTabs: [{ id: 'overview', label: 'Overview' }],
    dashboard: () => [{ key: 'modules', tab: 'overview', label: 'Modules', kind: 'stat', load: async () => ({ value: '3', description: 'in this app' }) }],
    routes: [
        { path: '/', page: 'custom', config: { mount: note('Overview', 'Three small modules: this one has no menu, Orders has a list and a record page, Reports has two destinations.') } },
        { path: '*', page: 'not-found' },
    ],
});
