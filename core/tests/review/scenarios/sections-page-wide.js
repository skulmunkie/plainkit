// pk-sections-page tabsFrom / stickyFrom (#2084): every section together at desktop width (a status section in the sidebar column), the tab strip and one section on a phone,
// and the title bar still pinned after the page scrolls 800px.
const SP = '#sp';
const BODY = 'pk-app-shell >>> [part=body]';
const HEADER = `${SP} >>> pk-page-shell >>> pk-page-header`;
export default {
    name: 'sections-page-wide',
    issue: [2084],
    elements: ['sections-page', 'detail-layout', 'page-header'],
    html: `<pk-app-shell><div id="wrap" class="rv-page"><pk-sections-page id="sp">
<pk-card id="d" slot="section-details" heading="Details"><pk-text>Blue mug, 350 ml, glazed ceramic. Dishwasher safe.</pk-text></pk-card>
<pk-card id="o" slot="section-orders" heading="Orders"><pk-text>Three open orders.</pk-text><div id="pad"></div></pk-card>
<pk-card id="s" slot="section-status" heading="Status"><pk-text>12 on hand, reorder at 5.</pk-text></pk-card>
</pk-sections-page></div></pk-app-shell>`,
    setup(frame) {
        frame.querySelector('#pad').style.height = '2000px';
        frame.querySelector(SP).config = {
            heading: 'Blue mug', breadcrumb: [{ label: 'Products', href: '#' }, { label: 'Blue mug' }], tabsFrom: 'tablet', stickyFrom: 'tablet',
            sections: [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders', count: 3 }, { id: 'status', label: 'Status', side: true }],
            actions: [{ key: 'edit', label: 'Edit', variant: 'primary' }],
        };
    },
    steps: [{ wait: 'settle' }, { wait: 400 }, { shot: 'resting' }, { scroll: BODY, to: 800 }, { wait: 250 }, { shot: 'scrolled' }],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'resting') {
            if (phone) { t.visible('#d', 'the first section'); t.hidden('#o', 'the other sections'); t.hidden('#s', 'the status section'); }
            else { t.visible('#d', 'Details'); t.visible('#o', 'Orders'); t.visible('#s', 'Status'); t.noOverlap('#d', '#s', 'the main column and the status card'); }
        }
        if (t.shot === 'scrolled' && !phone) t.ok(Math.abs(t.rect(HEADER).y - t.rect(BODY).y) <= 2, 'the title bar stays pinned at the top after scrolling');
    },
};
