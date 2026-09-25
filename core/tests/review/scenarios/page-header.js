// pk-page-header inside a pk-app-shell body (issues 285, 300): the record layout (crumbs above the title, the chips on the title's row or under it on a
// phone, actions on the first row, docked tabs at the foot), a pk-badge-popover opened from its chips (anchored under the pill, or spanning the gutters
// on a phone), and the sticky header staying flush under the app bar after the body is scrolled 800px.
const paragraphs = n => Array.from({ length: n }, (_, i) => `<p>Row ${i + 1} of the record below the header.</p>`).join('');
const BAR = 'pk-app-shell >>> [part=header]';
const BODY = 'pk-app-shell >>> [part=body]';
const PH = '#ph';
const TITLE = '#ph >>> [part=title]';
const ACTIONS = '#ph >>> [part=actions]';
const CHIP = '#ph > pk-badge:first-of-type'; // the chips part has no box of its own at desktop width (display: contents)
const CRUMBS = '#ph >>> [part=crumbs]';
const TABS = '#ph >>> [part=tabs]';
const PANEL = '#bp >>> [part=panel]';
const TRIGGER = '#bp >>> [part=trigger]';

export default {
    name: 'page-header',
    issue: [285, 300],
    elements: ['page-header', 'badge-popover', 'breadcrumb', 'tabs', 'app-shell'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" label="Main" collapsed><span slot="brand" class="u-contents"><a href="#">Acme</a></span><pk-nav-item href="#" current><pk-icon slot="icon" name="products"></pk-icon>Products</pk-nav-item></pk-side-nav>
<h2 slot="title">Products</h2>
<pk-page-header id="ph" variant="record" heading="Blue mug" sticky>
<pk-breadcrumb slot="breadcrumb"><a href="#" aria-label="Dashboard"><pk-icon name="dashboard"></pk-icon></a><a href="#">Products</a><span aria-current="page">Blue mug</span></pk-breadcrumb>
<pk-badge variant="ok">Active</pk-badge>
<pk-badge-popover id="bp" variant="warn" heading="5 failing checks">5 failing
<div slot="details">Price, weight and 3 image checks need attention before this product can be published.</div>
<pk-button slot="actions" size="mini" data-close>Dismiss</pk-button>
</pk-badge-popover>
<pk-badge variant="muted">On hand 1</pk-badge>
<pk-button slot="actions" id="save" size="mini">Save</pk-button>
<pk-button slot="actions" size="mini" variant="ghost">Print</pk-button>
<pk-tabs slot="tabs"><pk-tab value="details">Details</pk-tab><pk-tab value="history">History</pk-tab></pk-tabs>
</pk-page-header>
<div id="rows">${paragraphs(70)}</div>
</pk-app-shell>`,
    steps: [
        { shot: 'record' },
        { click: TRIGGER }, { wait: 300 }, { shot: 'popover-open' },
        { key: 'Escape' }, { wait: 200 },
        { scroll: BODY, to: 800 }, { wait: 200 }, { shot: 'scrolled' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        const vw = t.viewport.width;
        t.visible(PH);
        if (t.shot === 'record') {
            // Only what holds however the rows are arranged (the arrangement itself is being reworked): everything inside the header, nothing on top of
            // anything else, the actions kept in view, and the tabs docked at the foot under all of it.
            t.within('#ph > pk-breadcrumb', PH); t.within(TITLE, PH); t.within(ACTIONS, PH); t.within(CHIP, PH); t.within(TABS, PH);
            t.noOverlap(TITLE, ACTIONS); t.noOverlap(CHIP, ACTIONS); t.noOverlap(TITLE, CHIP); t.noOverlap('#ph > pk-breadcrumb', TITLE); t.noOverlap('#ph > pk-breadcrumb', ACTIONS);
            t.inViewport('#save'); t.inViewport('#bp');
            const actions = t.rect(ACTIONS), tabs = t.rect(TABS), chips = t.rect(CHIP), title = t.rect(TITLE);
            if (actions && title) t.ok(actions.cx > title.cx, 'the actions are not on the far side of the title');
            if (tabs && chips && actions) t.ok(tabs.y >= Math.max(chips.bottom, actions.bottom) - 1, `the tabs (from y=${Math.round(tabs.y)}) start above the end of the chips (y=${Math.round(chips.bottom)}) or actions (y=${Math.round(actions.bottom)})`);
            t.visible('#ph > pk-tabs', 'the docked tabs');
            if (phone) t.atLeast('#save', 'height', 44);
        }
        if (t.shot === 'popover-open') {
            t.visible(PANEL, 'the badge popover panel');
            t.inViewport(PANEL);
            t.hasText(PANEL, '5 failing checks');
            t.hasText('#bp > [slot=details]', 'image checks');
            t.visible('#bp > [slot=details]', 'the panel body');
            t.visible('#bp > pk-button', 'the Dismiss action');
            const p = t.rect(PANEL), trig = t.rect(TRIGGER);
            if (phone && p) {
                t.ok(Math.abs(p.x - 16) <= 2 && Math.abs(vw - p.right - 16) <= 2, `the panel spans x=${Math.round(p.x)} to ${Math.round(p.right)} in a ${vw}px window; on a phone it should fill the width inside the 16px gutters`);
                if (trig) t.ok(p.y >= trig.bottom, `the panel (from y=${Math.round(p.y)}) covers its pill (to y=${Math.round(trig.bottom)})`);
            } else if (p && trig) {
                t.ok(p.y >= trig.bottom - 1 && p.y <= trig.bottom + 24, `the panel starts at y=${Math.round(p.y)}, not right under its pill (ends y=${Math.round(trig.bottom)})`);
                t.ok(p.x >= trig.x - 16 && p.x <= trig.right, `the panel starts at x=${Math.round(p.x)}, not at its pill (x ${Math.round(trig.x)} to ${Math.round(trig.right)})`);
            }
        }
        if (t.shot === 'scrolled') {
            t.hidden(PANEL, 'the popover panel (closed with Escape)');
            t.ok(t.metric(BODY, 'scrollTop') >= 790, `the body scrolled to ${t.metric(BODY, 'scrollTop')}px, expected 800`);
            t.flushBelow(PH, BAR);
            t.inViewport(PH);
            t.visible(TITLE); t.visible(TABS);
        }
    },
};
