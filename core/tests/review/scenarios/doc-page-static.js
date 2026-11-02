// pk-doc-page static slotted mode (#1829): the author's own nav, table of contents, article and pager in the slots, no config and no script wiring. Everything on screen is
// the author's markup; the element only lays it out. The current item is the one the author marked (aria-current).
export default {
    name: 'doc-page-static',
    elements: ['doc-page', 'side-nav', 'nav-item', 'toc', 'pager'],
    html: '<pk-doc-page id="doc">'
        + '<pk-side-nav slot="nav" label="Guides"><pk-nav-item href="#a">Getting started</pk-nav-item><pk-nav-item href="#b" current aria-current="page">Theming</pk-nav-item><pk-nav-item href="#c">Logging</pk-nav-item></pk-side-nav>'
        + '<pk-toc slot="aside" for="#doc-body" levels="h2" heading="On this page"></pk-toc>'
        + '<h2>Theming</h2><div class="prose" id="doc-body"><h2 id="tokens">Tokens</h2><p>Plain server-rendered markup, shown as written.</p><h2 id="dark">Dark mode</h2><p>No script sets any of this up.</p></div>'
        + '<pk-pager label="Page navigation"><a slot="prev" href="#a" rel="prev">&larr; Getting started</a><span>2 of 3</span><a slot="next" href="#c" rel="next">Logging &rarr;</a></pk-pager>'
        + '</pk-doc-page>',
    steps: [{ wait: 400 }, { shot: 'static' }, { click: '#doc >>> [part="menu"]', on: ['phone'] }, { wait: 500, on: ['phone'] }, { shot: 'menu-open', on: ['phone'] }],
    expect(t) {
        if (t.shot === 'menu-open') { t.inViewport('#doc pk-side-nav'); return; }
        if (t.viewport.name === 'phone') t.visible('#doc >>> [part="menu"]', 'the element\'s own Menu button');
        t.inViewport('#doc');
        t.hasText('#doc h2', 'Theming');
        t.visible('#doc pk-pager', 'the author\'s pager');
        t.visible('#doc pk-toc', 'the author\'s table of contents');
        t.exists('#doc pk-nav-item[aria-current="page"]');
        t.absent('#doc .doc-page-title');
        if (t.viewport.name !== 'phone') t.visible('#doc pk-side-nav', 'the author\'s nav beside the article');
    },
};
