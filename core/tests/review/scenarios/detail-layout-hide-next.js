// pk-detail-layout hide-next (#1433): on a phone the layout collapses to one column with a tab strip; the Next button after the main column is there by default and gone with hide-next.
export default {
    name: 'detail-layout-hide-next',
    issue: [1433],
    elements: ['detail-layout', 'card'],
    viewports: ['phone'],
    html: `<pk-detail-layout id="with">
<pk-card heading="Details" data-pk-section="details"><p>Name, SKU, description.</p></pk-card>
<pk-card heading="Pricing" data-pk-section="pricing"><p>Price, cost, margin.</p></pk-card>
</pk-detail-layout>
<pk-detail-layout id="without" hide-next>
<pk-card heading="Details" data-pk-section="details"><p>Name, SKU, description.</p></pk-card>
<pk-card heading="Pricing" data-pk-section="pricing"><p>Price, cost, margin.</p></pk-card>
</pk-detail-layout>`,
    steps: [{ wait: 'settle' }, { shot: 'next' }],
    expect(t) {
        t.visible('#with >>> pk-tabs', 'the strip of the layout with its Next button');
        t.visible('#with >>> [part=next]', 'the default Next button');
        t.visible('#without >>> pk-tabs', 'the strip stays with hide-next');
        t.ok(!t.shown('#without >>> [part=next]'), 'hide-next still draws the Next button');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
