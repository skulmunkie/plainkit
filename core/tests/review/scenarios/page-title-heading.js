// A built-in page's title is a light-DOM pk-heading level 1 slotted into pk-page-header (#773): after a route change the page has exactly one title,
// it is a real h1 in the heading element's shadow tree, focus lands on it, and it looks like the title it replaced.
import { mountApp, defineModule } from '../../../js/app.js';

const note = (id, title) => defineModule({ id, title, routes: [{ path: '/', page: 'note', config: { heading: title, body: `The ${title.toLowerCase()} page.`, cardHeading: 'About this page' } }] });

export default {
    name: 'page-title-heading',
    issue: [773],
    elements: ['page-header', 'heading', 'app-shell'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/overview');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Tiny app' }, layout: 'top',
            modules: [{ id: 'overview', title: 'Overview', load: async () => note('overview', 'Overview') }, { id: 'about', title: 'About', load: async () => note('about', 'About') }],
        });
    },
    steps: [
        { wait: 'settle' }, { shot: 'idle' },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] },
        { click: 'pk-nav-item[data-module=about]', on: ['phone'] }, { click: 'pk-navbar a[data-module=about]', on: ['desktop'] },
        { wait: 'settle' }, { shot: 'navigated' },
    ],
    expect(t) {
        const titles = document.querySelectorAll('#pk-main pk-heading[level="1"]');
        t.ok(titles.length === 1, `${titles.length} level-1 titles in the page, expected exactly 1`);
        t.ok(document.querySelectorAll('#pk-main h1').length === 0, 'the page has no second, raw h1 beside the pk-heading');
        const h = titles[0];
        t.ok(h?.shadowRoot?.querySelector('h1') !== null, 'the title element renders a real h1 in its shadow tree');
        t.ok(h?.getAttribute('slot') === 'title' && h.parentElement?.localName === 'pk-page-header', 'the title is slotted into pk-page-header');
        t.visible('#pk-main pk-heading[level="1"]');
        t.inViewport('#pk-main pk-heading[level="1"]');
        if (t.shot === 'idle') t.hasText('#pk-main pk-heading[level="1"]', 'Overview');
        if (t.shot === 'navigated') {
            t.hasText('#pk-main pk-heading[level="1"]', 'About');
            t.ok(document.activeElement === h, `focus is on ${document.activeElement?.localName ?? 'nothing'}, expected the page title`);
        }
    },
};
