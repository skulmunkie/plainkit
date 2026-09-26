// A pk-navbar with `no-fold` in the header of a pk-app-shell (#350), at the widths a header meets: 320, 375, 768, 1024 and 1280 (each `resize` sets the real viewport width, so the
// phone and tablet media queries answer). One menu control (the shell's hamburger), the bar's own hamburger and links hidden below 1024, the search and the settings menu pinned to
// the header's inner right edge on one row that never wraps, the brand shortening first, and 44px touch targets on a phone. The same numbers are measured by the browser cases in
// tests/browser/cases-navbar.js.
const HEADER = 'pk-app-shell >>> [part=header]';
const NAV = 'pk-navbar >>> [part=nav]';
const WIDTHS = [320, 375, 768, 1024, 1280];

export default {
    name: 'navbar-actions',
    issue: [350],
    elements: ['navbar', 'app-shell', 'app-bar-search'],
    viewports: ['desktop'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" label="Menu"><pk-nav-item href="#" current>Orders</pk-nav-item><pk-nav-item href="#">Reports</pk-nav-item></pk-side-nav>
<pk-button slot="header" variant="ghost" size="mini" icon data-nav-toggle label="Toggle the menu"><pk-icon name="menu"></pk-icon></pk-button>
<pk-navbar slot="header" label="Main" no-fold>
<a slot="brand" href="#">A rather long brand name for a narrow window</a><a href="#">Orders</a><a href="#">Reports</a>
<pk-app-bar-search slot="actions" label="Search" placeholder="Search"></pk-app-bar-search>
<pk-dropdown slot="actions" placement="bottom-end"><pk-button slot="trigger" variant="ghost" icon label="Settings menu"><pk-icon name="settings"></pk-icon></pk-button><pk-menu-item>Light theme</pk-menu-item></pk-dropdown>
</pk-navbar>
<main><h1>Page</h1><pk-card heading="Content">The bar above is one row at every width.</pk-card></main>
<span slot="footer">Footer</span>
</pk-app-shell>`,
    steps: WIDTHS.flatMap(w => [{ resize: w }, { wait: 500 }, { shot: `w${w}` }]),
    expect(t) {
        const w = window.innerWidth;
        t.ok(t.shot === `w${w}`, `the viewport is ${w}px wide, the shot is ${t.shot}`);
        // exactly one menu control: the shell's hamburger; the bar's own is never shown
        t.visible('[data-nav-toggle]', "the shell's menu control");
        t.hidden('pk-navbar >>> [part=toggle]', "the bar's own hamburger");
        if (w <= 1024) t.hidden('pk-navbar > a:not([slot])', 'the bar links (below 1024 the host owns the menu)');
        else t.visible('pk-navbar > a:not([slot])', 'the bar links');
        // the cluster ends at the header's inner right edge, on the bar's row, without wrapping
        const header = t.rect(HEADER), menu = t.rect('pk-dropdown'), search = t.rect('pk-app-bar-search'), nav = t.rect(NAV), brand = t.rect('a[slot=brand]');
        if (header && menu) {
            const edge = header.right - parseFloat(t.style(HEADER, 'padding-right'));
            t.ok(Math.abs(menu.right - edge) <= 1, `at ${w}px the settings menu ends at ${menu.right.toFixed(1)}, the header's inner edge is ${edge.toFixed(1)}`);
        }
        if (nav) t.ok(nav.height <= 57, `at ${w}px the bar is ${nav.height.toFixed(1)}px tall: it wrapped`);
        if (nav && brand && menu && search) {
            for (const [name, r] of [['brand', brand], ['search', search], ['settings menu', menu]]) t.ok(Math.abs(r.cy - nav.cy) <= 6, `at ${w}px the ${name} is off the bar's row`);
            t.ok(brand.right <= search.x + 1, `at ${w}px the brand runs into the search`);
            t.ok(search.right <= menu.x + 1, `at ${w}px the search runs into the settings menu`);
        }
        t.inViewport('pk-dropdown');
        if (w <= 640) {
            for (const [name, sel] of [['the menu control', '[data-nav-toggle]'], ['the search button', 'pk-app-bar-search >>> [part=expand]'], ['the settings button', 'pk-dropdown pk-button']]) {
                t.atLeast(sel, 'width', 44); t.atLeast(sel, 'height', 44);
            }
        }
    },
};
