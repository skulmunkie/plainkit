// The header search of the one-app site (#355): the real site config mounted at the Guides, a body word typed in the bar, the results drawn from the Guides module's own
// search, then a result picked. Nothing here is ours: the scenario only mounts the app like the page does.
import { mountApp } from '../../../js/app.js';
import config from '../../../site/app.config.js';

export default {
    name: 'app-header-search',
    issue: [355],
    elements: ['app-bar-search', 'app-shell', 'navbar'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/guides');
        globalThis.__app = mountApp(frame.querySelector('#app'), config);
    },
    steps: [
        { wait: 'settle' }, { wait: 600 },
        { click: 'pk-app-bar-search >>> [part=expand]', on: ['phone'] },
        { click: 'pk-app-bar-search >>> [part=control] >>> [part=control]' }, { type: 'logger' }, { wait: 600 }, { shot: 'results' },
        { key: 'ArrowDown' }, { key: 'Enter' }, { wait: 600 }, { shot: 'picked' },
    ],
    expect(t) {
        t.exists('main#pk-main');
        t.inViewport('pk-app-bar-search', 1);
        if (t.shot === 'results') t.exists('pk-app-bar-search >>> [role=option]');
        if (t.shot === 'picked') t.ok(/^#\/guides\/[a-z-]+$/.test(location.hash), `the address is ${location.hash}, expected a guide`);
    },
};
