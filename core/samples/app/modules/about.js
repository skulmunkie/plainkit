import { defineModule } from '../../../js/app.js';

export default defineModule({
    id: 'about', title: 'About',
    routes: [
        { path: '/', page: 'note', config: { heading: 'About', body: 'A second module with no menu of its own.', cardHeading: 'About this page' } },
        { path: '*', page: 'not-found' },
    ],
});
