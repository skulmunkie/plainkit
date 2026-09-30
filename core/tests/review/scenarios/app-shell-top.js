// The opt-in top layout of mountApp (#350, layout: 'top'): the modules are links in the header bar, for a tiny app with no module nav. On a phone the bar shows no links and no
// second hamburger: the shell's one menu control opens the drawer, which holds the same module list; choosing a module closes it.
import { mountApp, defineModule } from '../../../js/app.js';

const page = (heading, text) => host => {
    const h1 = host.ownerDocument.createElement('h1'), p = host.ownerDocument.createElement('pk-card');
    h1.textContent = heading;
    p.setAttribute('heading', 'About this page');
    p.textContent = text;
    host.append(h1, p);
};
const tiny = (id, title) => defineModule({ id, title, routes: [{ path: '/', page: 'custom', config: { mount: page(title, `The ${title.toLowerCase()} page.`) } }] });

export default {
    name: 'app-shell-top',
    issue: [350],
    elements: ['app-shell', 'navbar', 'side-nav'],
    html: '<div id="app"></div>',
    setup(frame) {
        history.replaceState(null, '', '#/overview');
        globalThis.__app = mountApp(frame.querySelector('#app'), {
            brand: { text: 'Tiny app' }, layout: 'top',
            modules: [{ id: 'overview', title: 'Overview', load: async () => tiny('overview', 'Overview') }, { id: 'about', title: 'About', load: async () => tiny('about', 'About') }],
        });
    },
    steps: [
        { wait: 'settle' }, { shot: 'idle' },
        { click: 'pk-button[data-nav-toggle]', on: ['phone'] }, { shot: 'drawer', on: ['phone'] },
        { click: 'pk-nav-item[data-module=about]', on: ['phone'] }, { click: 'pk-navbar a[data-module=about]', on: ['desktop'] }, { shot: 'switched' },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        t.exists('main#pk-main');
        t.inViewport('pk-app-bar-search', 1);
        t.hidden('pk-navbar >>> [part=toggle]', "the bar's own hamburger");
        t.noOverlap('pk-navbar', '#pk-main');
        if (t.shot === 'idle') {
            t.hasText('#pk-main h1', 'Overview');
            if (desktop) {
                t.visible('pk-navbar a[data-module=about]');
                t.exists('pk-navbar a[data-module=overview][aria-current="page"]');
                t.absent('#pk-nav'); // no module nav: the page has the full width
                t.atLeast('#pk-main', 'width', t.viewport.width - 80);
                t.hidden('pk-button[data-nav-toggle]');
            } else {
                t.hidden('pk-navbar a[data-module=about]', 'the bar links (the drawer holds them)');
                t.visible('pk-button[data-nav-toggle]');
                t.hidden('#pk-nav', 'the drawer (closed)');
            }
        }
        if (t.shot === 'drawer') { t.visible('#pk-nav', 'the drawer'); t.inViewport('#pk-nav'); t.hasText('#pk-nav', 'Overview'); t.hasText('#pk-nav', 'About'); t.exists('#pk-nav pk-nav-item[current][data-module=overview]'); }
        if (t.shot === 'switched') {
            t.hasText('#pk-main h1', 'About');
            t.ok(document.title === 'About - Tiny app', `the document title is "${document.title}"`);
            if (desktop) t.exists('pk-navbar a[data-module=about][aria-current="page"]'); else t.hidden('#pk-nav', 'the drawer (closed after choosing a module)');
        }
    },
};
