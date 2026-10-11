// The Guides as a module of the site app (#355): the list, a guide opened by its address, a heading anchor in the address and a body-word search, inside the app's real chrome.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'app-guides',
    issue: [355, 1101],
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
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 600, on: ['phone'] }, { shot: 'drawer', on: ['phone'] },
        { click: 'pk-doc-page pk-card[href]', on: ['desktop'] }, { wait: 1200, on: ['desktop'] }, { shot: 'guide', on: ['desktop'] },
        { focus: 'pk-doc-page pk-input' }, { type: 'logger' }, { wait: 600 }, { shot: 'search' },
    ],
    expect(t) {
        t.noOverlap('pk-navbar', '#pk-main');
        if (t.shot === 'list') { t.exists('pk-doc-page'); t.hasText('pk-breadcrumb', 'Guides'); }
        if (t.shot === 'search') t.ok(document.querySelectorAll('#pk-nav pk-nav-item[hidden]').length > 0, 'the app side nav is filtered by the search');
        if (t.shot === 'guide') { t.exists('pk-doc-page .doc-page-title'); t.ok(/\/guides\/[a-z-]+/.test(location.hash), `the address is ${location.hash}`); }
    },
};
