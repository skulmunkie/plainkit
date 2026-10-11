// Files as a module of the site app (#355, step 6a): the code explorer on a deep-linked file, inside the app's real chrome.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'app-tools',
    issue: [355],
    elements: ['app-shell'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/files?path=tokens/tokens.css&line=3');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Plainkit' }, home: 'files', search: false,
            modules: [
                { id: 'files', title: 'Files', load: () => import('../../../site/modules/files.js') },
            ],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 2500 }, { shot: 'files' },
    ],
    expect(t) {
        t.noOverlap('pk-navbar', '#pk-main');
        if (t.shot === 'files') t.exists('pk-code-explorer');
    },
};
