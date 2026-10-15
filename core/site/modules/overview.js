// The site's Overview (#1297): a dashboard that holds no widget of its own. Guides, Gallery, Scorecard and Theme editor contribute theirs (their entries in app.config.js name this surface).
import { defineModule } from '../../js/app.js';

export default defineModule({ id: 'overview', title: 'Overview', icon: 'dashboard', routes: [{ path: '/', page: 'dashboard', config: { surface: 'overview', heading: 'Overview' } }, { path: '*', page: 'not-found' }] });
