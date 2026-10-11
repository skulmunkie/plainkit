// The Scorecard as a module of the site app (#355, step 6a) before a run, inside the app's real chrome.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'app-scorecard',
    issue: [355],
    elements: ['app-shell'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/scorecard');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Plainkit' }, home: 'scorecard', search: false,
            modules: [
                { id: 'scorecard', title: 'Scorecard', load: () => import('../../../site/modules/scorecard.js') },
            ],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 5000 }, { shot: 'scorecard' },
    ],
    expect(t) {
        t.noOverlap('pk-navbar', '#pk-main');
        if (t.shot === 'scorecard') t.exists('[data-sc-run]');
    },
};
