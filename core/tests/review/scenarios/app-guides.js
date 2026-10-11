// The Guides as a module of the site app (#355): the list, a guide opened by its address, a heading anchor in the address and a body-word search, inside the app's real chrome.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'app-guides',
    issue: [355],
    elements: ['doc-page', 'app-shell', 'side-nav'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/guides');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Plainkit' }, home: 'guides', search: false,
            modules: [{ id: 'guides', title: 'Guides', load: () => import('../../../site/modules/guides.js') }],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 1200 }, { shot: 'list' },
        { click: 'pk-doc-page pk-card[href]', on: ['desktop'] }, { wait: 1200, on: ['desktop'] }, { shot: 'guide', on: ['desktop'] },
        { focus: 'pk-doc-page pk-side-nav pk-input', on: ['desktop'] }, { type: 'logger', on: ['desktop'] }, { wait: 600, on: ['desktop'] }, { shot: 'search', on: ['desktop'] },
    ],
    expect(t) {
        t.noOverlap('pk-navbar', '#pk-main');
        if (t.shot === 'list') { t.exists('pk-doc-page'); t.hasText('pk-breadcrumb', 'Guides'); }
        if (t.shot === 'guide') { t.exists('pk-doc-page .doc-page-title'); t.ok(/\/guides\/[a-z-]+/.test(location.hash), `the address is ${location.hash}`); }
    },
};
