// pk-detail-layout tabs-from="always" (#342): the two-column layout keeps its strip and shows one section at a time, the sidebar cards of the chosen
// section beside it; on a phone it is the same single-column tab strip as the default.
export default {
    name: 'detail-layout-tabs-from',
    issue: [342],
    elements: ['detail-layout', 'tabs', 'card'],
    html: `<pk-detail-layout id="dl" tabs-from="always">
<pk-card id="details" heading="Details" data-pk-section="details"><p>Name, SKU, description.</p></pk-card>
<pk-card id="pricing" heading="Pricing" data-pk-section="pricing"><p>Price, cost, margin.</p></pk-card>
<div slot="sidebar">
<pk-card id="status" heading="Status" data-pk-section="details"><p>Active</p></pk-card>
<pk-card id="channels" heading="Channels" data-pk-section="pricing"><p>Web, store</p></pk-card>
</div>
</pk-detail-layout>`,
    steps: [
        { shot: 'details' },
        { click: '#dl >>> pk-tab:nth-of-type(2)' }, { shot: 'pricing' },
    ],
    expect(t) {
        const details = t.shot === 'details';
        t.visible('#dl >>> pk-tabs', 'the tab strip shows at every width');
        t.ok(t.shown('#details') === details && t.shown('#status') === details, 'the first section (main and sidebar card) shows only on the first tab');
        t.ok(t.shown('#pricing') !== details && t.shown('#channels') !== details, 'the second section (main and sidebar card) shows only on the second tab');
        if (t.viewport.name === 'desktop') {
            const side = t.rect('#dl >>> [part=sidebar]'), main = t.rect('#dl >>> [part=main]');
            if (side && main) t.ok(side.x >= main.right, 'the sidebar stays beside the main column on desktop');
        }
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
