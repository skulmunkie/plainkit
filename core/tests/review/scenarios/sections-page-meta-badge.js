// pk-sections-page meta line, reassigned primary action and a badge popover (#2084, step B): the open popover and the meta line under the title.
const SP = '#sp';
export default {
    name: 'sections-page-meta-badge',
    issue: [2084],
    elements: ['sections-page', 'badge-popover', 'page-header'],
    html: `<pk-app-shell><div id="wrap" class="rv-page"><pk-sections-page id="sp">
<span id="meta" slot="meta">Updated 12 November by Sam</span>
<p id="late" slot="badge-late">Lines 2 and 4 are past their ship date.</p>
<pk-card id="d" slot="section-summary" heading="Summary"><pk-text>Waiting for approval.</pk-text></pk-card>
</pk-sections-page></div></pk-app-shell>`,
    setup(frame) {
        frame.querySelector(SP).config = {
            heading: 'Order 1042', breadcrumb: [{ label: 'Orders', href: '#' }, { label: 'Order 1042' }],
            badges: [{ id: 'late', label: '2 late', variant: 'warn', popover: { heading: 'Late lines' } }],
            newAction: { key: 'approve', label: 'Approve', variant: 'primary' }, sections: [{ id: 'summary', label: 'Summary' }],
        };
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'resting' }, { click: `${SP} >>> pk-badge-popover` }, { wait: 300 }, { shot: 'open' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#meta', 'the meta line');
        if (t.shot === 'open') { t.visible('#late', 'the badge popover body'); t.inViewport('#late'); }
    },
};
