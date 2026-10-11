// The Gallery's page frame on pk-app-shell (#682): the nav column, the header bar, the one scrolling view and the docked Details drawer on an element page, and on a
// phone the Contents drawer. The gallery is mounted on its own here (the app-hosted frame is covered by app-gallery).
export default {
    name: 'gallery-frame',
    issue: [682],
    elements: ['app-shell', 'side-nav'],
    html: '<div id="host"></div>',
    async setup(frame) {
        history.replaceState(null, '', '#/elements/pk-button');
        for (const css of ['../../../site/site.css', '../../../site/gallery/gallery.css']) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL(css, import.meta.url).href }));
        frame.classList.add('site'); // the standalone page's own box: the page fills the window, the host fills the page
        frame.querySelector('#host').className = 'site-body';
        const { mountGallery } = await import('../../../site/gallery/gallery.js');
        await mountGallery(frame.querySelector('#host'), { chrome: 'full', init: false });
    },
    steps: [
        { wait: 'settle' }, { wait: 2500 }, { shot: 'rest' },
        { click: '#gx-inspect' }, { wait: 800 }, { shot: 'toggled' },
        { click: '[data-nav-toggle]', on: ['phone'] }, { wait: 600, on: ['phone'] }, { shot: 'contents', on: ['phone'] },
    ],
    expect(t) {
        t.visible('#gx-bar'); t.visible('#gx-view'); t.inViewport('#gx-view');
        t.noOverlap('#gx-bar', '#gx-view');
        if (t.viewport.name === 'desktop') { t.visible('#gx-nav'); t.noOverlap('#gx-nav', '#gx-view'); }
        // Details opens by itself beside an element page on a wide screen (docked over the end edge), not on a phone; the button flips it.
        const open = document.querySelector('#gx-inspector')?.hasAttribute('open'), wide = t.viewport.name === 'desktop';
        if (t.shot === 'rest') t.ok(open === wide, 'the Details drawer is ' + (wide ? 'docked open' : 'closed') + ' on an element page');
        if (t.shot === 'toggled') t.ok(open === !wide, 'the Details button flips the drawer');
    },
};
