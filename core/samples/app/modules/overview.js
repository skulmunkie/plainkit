import { defineModule } from '../../../js/app.js';

// A module with no nav: on a wide screen the page has the full width.
export default defineModule({
    id: 'overview', title: 'Overview',
    routes: [
        { path: '/', page: 'note', config: { heading: 'Overview', body: 'Three small modules: this one has no menu, Orders has a list and a record page, Reports has two destinations.', cardHeading: 'About this page' } },
        { path: '*', page: 'not-found' },
    ],
});
