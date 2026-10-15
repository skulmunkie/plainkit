// The site's Overview (#1297): the real site config mounted at its home, the cards the Guides, Gallery, Scorecard and Theme editor modules contribute.
import { mountApp } from '../../../js/app.js';
import config from '../../../site/app.config.js';

export default {
    name: 'site-overview',
    issue: [1297],
    elements: ['dashboard-page', 'app-shell', 'card', 'stat'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/overview');
        globalThis.__app = mountApp(frame.querySelector('#app'), config);
    },
    steps: [{ wait: 'settle' }, { wait: 1200 }, { shot: 'overview' }],
    expect(t) {
        t.exists('main#pk-main');
        t.exists('pk-dashboard-page >>> pk-card[data-state=ready]');
    },
};
