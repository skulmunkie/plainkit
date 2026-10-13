import { defineModule } from '../../../js/app.js';

// A module with no nav: on a wide screen the page has the full width.
export default defineModule({
    id: 'overview', title: 'Overview',
    routes: [
        // A dashboard with no widget of its own: Orders and Reports contribute theirs (their config entries name this `surface`), so adding a widget never edits this route.
        { path: '/', page: 'dashboard', config: { surface: 'overview', heading: 'Overview', tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }] } },
        { path: '*', page: 'not-found' },
    ],
});
