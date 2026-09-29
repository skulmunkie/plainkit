// pk-nav-item as a navbar child (#381 step 1): placement detection (this.closest('pk-navbar') sets [horizontal] in connected()), the
// bottom-bar current-page indicator instead of the side-nav's left bar, and the fold-and-close-on-click interaction folded navbar links
// already have for a plain <a> — a pk-nav-item's link lives inside its own shadow root, so the navbar's click listener has to see through
// that (event.composedPath(), not e.target.closest()) for the open menu to close when a nav-item row is chosen.
const LINKS = 'pk-navbar >>> [part=links]';
const TOGGLE = 'pk-navbar >>> [part=toggle]';

export default {
    name: 'navbar-nav-item',
    issue: [381],
    elements: ['navbar', 'nav-item'],
    viewports: ['phone'],
    html: `<pk-navbar label="Main">
<a slot="brand" href="#">Brand</a>
<pk-nav-item href="#" current>Orders</pk-nav-item>
<pk-nav-item href="#">Reports</pk-nav-item>
<a href="#">Plain link</a>
</pk-navbar>`,
    steps: [
        { click: TOGGLE },
        { wait: 'settle' },
        { shot: 'open' },
        { click: 'pk-nav-item[current] >>> [part=link]' },
        { wait: 'settle' },
        { shot: 'closed-by-nav-item' },
    ],
    expect(t) {
        if (t.shot === 'open') {
            t.visible(LINKS, 'the folded links column');
            t.visible('pk-nav-item[current] >>> [part=link]', "the current pk-nav-item's row");
            // horizontal mode only applies at the navbar's own (--tablet) breakpoint and up; folded, the row is a full-width block like a plain <a>.
            const row = t.rect('pk-nav-item[current] >>> [part=link]'), a = t.rect('pk-navbar > a:not([slot])');
            if (row && a) t.ok(Math.abs(row.width - a.width) <= 2, `folded, the nav-item row is ${row?.width}px wide, the plain link is ${a?.width}px: they should match`);
        } else {
            // The composedPath() fix: clicking a pk-nav-item's inner (shadow) link must still close the open navbar, exactly like clicking a plain slotted <a> does.
            t.hidden(LINKS, "the navbar's links column, after choosing a pk-nav-item row");
        }
    },
};
