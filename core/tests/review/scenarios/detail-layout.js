// pk-detail-layout (issues 281, 272): at desktop width a sidebar taller than the viewport docks by its bottom edge while the body scrolls, so every card
// can be reached; on a phone the sections become a tab strip and choosing the second tab swaps the cards (and the sidebar cards of that section).
// t.known(n, ...) marks a defect that is already filed (a warning, never an error); when it is fixed the scenario turns it into t.ok.
const lines = (n, what) => Array.from({ length: n }, (_, i) => `<p>${what} line ${i + 1}: some text so that the card has a height worth scrolling past.</p>`).join('');
const BODY = 'pk-app-shell >>> [part=body]';
const SIDEBAR = '#dl >>> [part=sidebar]';
const MAIN = '#dl >>> [part=main]';
const GAP_ISSUE = 0, DOCK_ISSUE = 0, TABS_PR = 316;

export default {
    name: 'detail-layout',
    issue: [281, 272],
    elements: ['detail-layout', 'tabs', 'app-shell'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" label="Main" collapsed><span slot="brand" class="u-contents"><a href="#">Acme</a></span><pk-nav-item href="#" current><pk-icon slot="icon" name="orders"></pk-icon>Orders</pk-nav-item></pk-side-nav>
<h2 slot="title">Order 1042</h2>
<pk-detail-layout id="dl">
<pk-card id="details" heading="Details" data-pk-section="details"><div>${lines(45, 'Details')}</div></pk-card>
<pk-card id="pricing" heading="Pricing" data-pk-section="pricing"><div>${lines(45, 'Pricing')}</div></pk-card>
<div slot="sidebar">
<pk-card id="status" heading="Status" data-pk-section="details"><div>${lines(7, 'Status')}</div></pk-card>
<pk-card id="customer" heading="Customer" data-pk-section="details"><div>${lines(7, 'Customer')}</div></pk-card>
<pk-card id="channels" heading="Channels" data-pk-section="pricing"><div>${lines(7, 'Channels')}</div></pk-card>
<pk-card id="taxes" heading="Taxes" data-pk-section="pricing"><div>${lines(7, 'Taxes')}</div></pk-card>
<pk-card id="last" heading="Last card" data-pk-section="pricing"><div>${lines(7, 'Last')}</div></pk-card>
</div>
</pk-detail-layout>
</pk-app-shell>`,
    steps: [
        { shot: 'top' },
        // The sidebar is about 1800px tall in a 900px window: it starts to dock once its bottom edge would come into view, well past the first screen.
        { scroll: BODY, to: 1300, on: ['desktop'] }, { shot: 'docked', on: ['desktop'] },
        { scroll: BODY, to: 100000, on: ['desktop'] }, { shot: 'end', on: ['desktop'] },
        { click: '#dl >>> pk-tab:nth-of-type(2)', on: ['phone'] }, { wait: 300, on: ['phone'] }, { shot: 'second-tab', on: ['phone'] },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        const body = t.rect(BODY);
        const side = t.rect(SIDEBAR), main = t.rect(MAIN);
        if (desktop) {
            t.visible('#status'); t.visible('#last');
            if (side && main) t.ok(side.x >= main.right, `the sidebar (x=${Math.round(side.x)}) is not in its own column right of the main content (ends x=${Math.round(main.right)})`);
            if (t.shot === 'top' && side) t.ok(side.height > t.viewport.height, `the sidebar is ${Math.round(side.height)}px tall: it must be taller than the ${t.viewport.height}px window for this scenario to mean anything`);
            if (t.shot === 'top' && side && main) t.ok(Math.abs(side.y - main.y) <= 2, `the sidebar starts at y=${Math.round(side.y)}, the main content at y=${Math.round(main.y)}`);
            if (t.shot === 'top') {
                const a = t.rect('#status'), b = t.rect('#customer');
                if (a && b) t.known(GAP_ISSUE, b.y - a.bottom >= 8, `the sidebar cards are ${Math.round(b.y - a.bottom)}px apart (the documented div slot=sidebar wrapper leaves them flush); the layout's own gap is 16px`);
            }
            if (t.shot === 'docked' && side && body) {
                // Taller than the window: it docks by its bottom edge, so it moved up and stays put while the main column scrolls.
                t.ok(side.y < body.y, `the sidebar starts at y=${Math.round(side.y)} while scrolled; it should have moved up (docked by its bottom edge)`);
                t.ok(side.bottom >= body.bottom - 1, `the sidebar ends at y=${Math.round(side.bottom)}; docked by its bottom edge it should reach the foot of the body (y=${Math.round(body.bottom)})`);
                t.known(DOCK_ISSUE, side.bottom <= body.bottom + 1, `docked, the sidebar ends at y=${Math.round(side.bottom)}, ${Math.round(side.bottom - body.bottom)}px below the foot of the shell body (y=${Math.round(body.bottom)}): the dock uses the window height, so the last card's foot is out of reach until the page end`);
            }
            if (t.shot === 'end') t.within('#last', BODY, 1);
        } else {
            if (side && main) t.ok(side.y >= main.bottom - 1, `on a phone the sidebar (y=${Math.round(side.y)}) should come after the main content (ends y=${Math.round(main.bottom)})`);
            // The strip's tabs are defined in the layout's shadow tree; until pull request 316 lands they are plain text and do nothing.
            t.known(TABS_PR, (t.rect('#dl >>> pk-tab:nth-of-type(1)')?.height ?? 0) >= 30, 'the phone tab strip is not styled: the tabs are plain text (pk-tab is not defined)');
            if (t.shot === 'top') { t.visible('#details'); t.visible('#status'); t.known(TABS_PR, !t.shown('#pricing'), 'the second section shows while the first tab is selected'); }
            if (t.shot === 'second-tab') {
                t.known(TABS_PR, t.shown('#pricing') && !t.shown('#details'), 'choosing the second tab does not swap the sections (Pricing shown, Details hidden)');
                t.known(TABS_PR, t.shown('#channels') && !t.shown('#status'), 'choosing the second tab does not swap the sidebar cards');
            }
        }
    },
};
