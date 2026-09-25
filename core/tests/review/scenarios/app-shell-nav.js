// pk-app-shell nav toggle (issue 298): above the drawer breakpoint the toggle hides and shows the nav and the body takes the freed width; on a phone the
// same control opens a drawer. The body is taller than the viewport, so the header and footer must stay put while it scrolls.
const paragraphs = n => Array.from({ length: n }, (_, i) => `<p>Line ${i + 1}. The body of the shell is the only scroller; the header and the footer stay where they are.</p>`).join('');
const BODY = 'pk-app-shell >>> [part=body]';
const HEADER = 'pk-app-shell >>> [part=header]';
const FOOTER = 'pk-app-shell >>> [part=footer]';

export default {
    name: 'app-shell-nav',
    issue: [298],
    elements: ['app-shell', 'side-nav'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" id="nav" label="Main"><a slot="brand" href="#">Acme</a>
<pk-nav-item href="#" current>Dashboard</pk-nav-item><pk-nav-item href="#">Orders</pk-nav-item><pk-nav-item href="#">Products</pk-nav-item><pk-nav-item href="#">Customers</pk-nav-item>
</pk-side-nav>
<h2 slot="title">Dashboard</h2>
<pk-button slot="header" id="menu" data-nav-toggle variant="ghost" aria-label="Toggle the menu">Menu</pk-button>
<div id="content"><pk-stack>${paragraphs(40)}</pk-stack></div>
<span slot="footer">Acme Inc.</span>
</pk-app-shell>`,
    steps: [
        { shot: 'nav-shown' },
        { click: '#menu' }, { wait: 400 }, { shot: 'toggled' },
        { scroll: BODY, to: 500, on: ['desktop'] }, { shot: 'scrolled', on: ['desktop'] },
        { scroll: BODY, to: 0, on: ['desktop'] },
        { click: '#menu', on: ['desktop'] }, { wait: 400, on: ['desktop'] }, { shot: 'nav-back', on: ['desktop'] },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        const vw = t.viewport.width;
        // The header and the footer are pinned to the top and bottom of the shell in every state; the body is what scrolls.
        t.scrolls(BODY);
        const h = t.rect(HEADER), f = t.rect(FOOTER);
        if (h) t.ok(Math.abs(h.y) <= 1, `the header starts at y=${Math.round(h.y)}, expected the top of the window`);
        if (f) t.ok(Math.abs(f.bottom - t.viewport.height) <= 1, `the footer ends at y=${Math.round(f.bottom)}, expected the bottom of the ${t.viewport.height}px window`);
        if (t.shot === 'nav-shown') {
            if (desktop) { t.visible('#nav'); t.atLeast('#nav', 'width', 150); t.visible('#nav >>> [part=collapse]'); }
            else t.hidden('#nav', 'the nav (a drawer, closed)');
        }
        if (t.shot === 'toggled') {
            if (desktop) {
                t.hidden('#nav', 'the nav (hidden by the toggle)');
                const body = t.rect(BODY);
                if (body) t.ok(body.x <= 1 && body.width >= vw - 1, `the body is ${Math.round(body.width)}px wide at x=${Math.round(body.x)} after hiding the nav; it should take the full ${vw}px`);
                t.visible('#menu'); t.inViewport('#menu');
            } else {
                t.visible('#nav', 'the drawer');
                const nav = t.rect('#nav');
                if (nav) t.ok(nav.x >= -1 && nav.width <= vw * 0.88 + 1 && nav.bottom <= t.viewport.height + 1, `the drawer is ${Math.round(nav.width)}px wide at x=${Math.round(nav.x)} in a ${vw}px window (at most 88vw)`);
            }
        }
        if (t.shot === 'scrolled') t.ok(t.metric(BODY, 'scrollTop') >= 400, `the body did not scroll (scrollTop ${t.metric(BODY, 'scrollTop')})`);
        if (t.shot === 'nav-back') { t.visible('#nav', 'the nav (shown again)'); t.atLeast('#nav', 'width', 150); }
    },
};
