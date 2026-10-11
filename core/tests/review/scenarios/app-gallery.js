// The Gallery as a module of the site app (#355, step 4): the overview, an element page reached from the Elements overview, and the phone drawer, inside the app's real chrome.
// The gallery keeps its toolbar, views and Details drawer; the app owns the bar, the theme and the nav.
import { mountApp } from '../../../js/app.js';

export default {
    name: 'app-gallery',
    issue: [355],
    elements: ['side-nav', 'app-shell'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/gallery');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Plainkit' }, home: 'gallery', search: false,
            modules: [{ id: 'gallery', title: 'Gallery', load: () => import('../../../site/modules/gallery.js') }],
        });
    },
    steps: [
        { wait: 'settle' }, { wait: 1500 }, { shot: 'overview' },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 600, on: ['phone'] }, { shot: 'drawer', on: ['phone'] },
        { key: 'Escape', on: ['phone'] }, 
        { click: '#gx-view [href="#/gallery/elements"]' }, { wait: 1200 },
        { click: '#gx-view [href="#/gallery/elements/pk-button"]' }, { wait: 2000 }, { shot: 'element' },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { wait: 600, on: ['phone'] }, { shot: 'element-drawer', on: ['phone'] },
    ],
    expect(t) {
        t.noOverlap('pk-navbar', '#pk-main');
        t.exists('#gx-view');
        if (t.shot === 'overview') t.ok(/^#\/gallery(\/|$)/.test(location.hash), `the address is ${location.hash}`);
        if (t.shot === 'element') t.ok(location.hash === '#/gallery/elements/pk-button', `the address is ${location.hash}`);
        if (t.shot === 'element') t.ok(document.querySelector('#pk-nav pk-nav-item[current][href="#/gallery/elements/pk-button"]'), 'the Button row is the current row of the nav tree');
    },
};
