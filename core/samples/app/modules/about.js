import { defineModule } from '../../../js/app.js';
import { note } from './page.js';

export default defineModule({
    id: 'about', title: 'About',
    routes: [{ path: '/', page: 'custom', config: { mount: note('About', 'A second module with no menu of its own.') } }, { path: '*', page: 'not-found' }],
});
