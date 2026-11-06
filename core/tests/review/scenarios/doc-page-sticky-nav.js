// #1878: a static slotted nav in pk-doc-page (40 items, long article) stays in view while the page scrolls 800px and scrolls itself instead of growing to its items. Measured in a pk-app-shell body.
const BODY = 'pk-app-shell >>> [part=body]';
const NAV = '#doc pk-side-nav';
const items = Array.from({ length: 40 }, (_, i) => `<pk-nav-item href="#n${i}">Guide number ${i + 1}</pk-nav-item>`).join('');
const paras = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i + 1} of a long article that keeps the page scrolling well past the first screen.</p>`).join('');

export default {
    name: 'doc-page-sticky-nav',
    issue: [1878],
    elements: ['doc-page', 'side-nav', 'app-shell'],
    html: `<pk-app-shell flush><span slot="header">Docs</span><pk-doc-page id="doc"><pk-side-nav slot="nav" label="Guides">${items}</pk-side-nav><h2>Article</h2><div class="prose">${paras}</div></pk-doc-page><span slot="footer">Footer</span></pk-app-shell>`,
    setup(frame) { frame.querySelector('#doc').style.setProperty('--pk-doc-page-nav-max', 'calc(100dvh - 8rem)'); },
    steps: [{ wait: 400 }, { shot: 'top' }, { scroll: BODY, to: 800 }, { wait: 300 }, { shot: 'scrolled' }],
    expect(t) {
        const vw = t.viewport.width, vh = t.viewport.height;
        const body = t.rect(BODY), nav = t.rect(NAV);
        if (!body || !nav) return t.ok(false, 'the body and the nav render');
        t.ok(nav.x + nav.width <= vw + 1, 'nothing is wider than the viewport');
        if (t.viewport.name === 'phone') return;
        t.ok(nav.height <= vh, `the nav is ${Math.round(nav.height)}px tall in a ${vh}px viewport: it is height-capped (#1878)`);
        if (t.shot === 'scrolled') {
            t.ok(nav.y + nav.height <= body.y + body.height + 1, 'the whole nav box, its end included, is inside the visible body (the cap hook fits it to the shell) (#1878)');
            t.ok(nav.y >= body.y - 1 && nav.y <= body.y + 40, `after scrolling 800px the nav is still at the top of the body (y ${Math.round(nav.y)}, body y ${Math.round(body.y)}) (#1878)`);
            t.ok(t.metric('#doc pk-side-nav >>> [part=scroll]', 'scrollHeight') > t.metric('#doc pk-side-nav >>> [part=scroll]', 'clientHeight') + 1, 'the nav scrolls itself (#1878)');
        }
    },
};
