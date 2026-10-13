// pk-detail-layout hide-tabs (#1241): the layout draws no strip; the sections come from section alone, the strip is the page header's.
export default {
    name: 'detail-layout-hide-tabs',
    issue: [1241],
    elements: ['detail-layout', 'page-header', 'card'],
    html: `<pk-page-header id="ph" heading="Blue mug" tabs-from="always" tabs='[{"value":"details","label":"Details"},{"value":"pricing","label":"Pricing"}]'></pk-page-header>
<pk-detail-layout id="dl" hide-tabs tab-param="tab" section="pricing">
<pk-card id="details" heading="Details" data-pk-section="details"><p>Name, SKU, description.</p></pk-card>
<pk-card id="pricing" heading="Pricing" data-pk-section="pricing"><p>Price, cost, margin.</p></pk-card>
<div slot="sidebar"><pk-card heading="Status"><p>Active</p></pk-card></div>
</pk-detail-layout>`,
    steps: [{ shot: 'pricing' }],
    expect(t) {
        t.visible('#ph >>> pk-tabs', 'the page header draws the strip');
        t.ok(!t.shown('#dl >>> pk-tabs'), 'the layout draws no strip of its own');
        const first = false;
        t.ok(t.shown('#pricing') !== first && t.shown('#details') === first, 'only the selected section shows');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
