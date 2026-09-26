import { defineModule } from '../../../js/app.js';
import { note } from './page.js';

// A module with no nav: on a wide screen the page has the full width.
export default defineModule({
    id: 'overview', title: 'Overview',
    routes: [
        { path: '/', page: 'custom', config: { mount: note('Overview', 'Three small modules: this one has no menu, Orders has a list and a record page, Reports has two destinations.') } },
        { path: '*', page: 'not-found' },
    ],
});
