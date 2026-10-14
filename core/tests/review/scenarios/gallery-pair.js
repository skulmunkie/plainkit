// A pattern drawn inline in the Gallery (#682): the desktop and phone samples sit side by side on pk-grid ratio 2:1; on a phone the desktop half is dropped.
export default {
    name: 'gallery-pair',
    issue: [682],
    elements: ['grid'],
    html: '<div id="host"></div>',
    async setup(frame) {
        history.replaceState(null, '', '#/samples/patterns/notifications');
        for (const css of ['../../../site/site.css', '../../../site/gallery/gallery.css']) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL(css, import.meta.url).href }));
        frame.toggleAttribute('data-site', true);
        frame.querySelector('#host').toggleAttribute('data-site-body', true);
        const { mountGallery } = await import('../../../site/gallery/gallery.js');
        await mountGallery(frame.querySelector('#host'), { chrome: 'none', init: false });
    },
    steps: [{ wait: 'settle' }, { wait: 3000 }, { shot: 'pair' }],
    expect(t) {
        t.visible('[data-pair]');
        const halves = [...document.querySelectorAll('[data-pair] > pk-stack')].filter(h => h.getClientRects().length);
        t.ok(halves.length === (t.viewport.name === 'desktop' ? 2 : 1), 'desktop shows both halves, a phone only the phone half');
    },
};
