// The settings page: theme, gallery text size and sample width, and logging; the page is site/gallery/settings.js.
import { defineModule } from '../../js/app.js';
import { mountSettings } from '../gallery/settings.js';

export default defineModule({ id: 'settings', title: 'Settings', routes: [{ path: '*', page: 'custom', config: { mount: mountSettings } }] });
