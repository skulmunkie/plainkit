// pk-detail-layout data-pk-section-order and data-pk-section-count (#1471): a sidebar section sits between main ones in the phone strip and carries a badge.
export default {
    name: 'detail-layout-order-count',
    issue: [1471],
    elements: ['detail-layout', 'tabs', 'card'],
    html: `<pk-detail-layout id="dl" tabs-from="phone">
<pk-card id="details" heading="Details" data-pk-section="details" data-pk-section-order="1"><p>Name, SKU.</p></pk-card>
<pk-card id="notes" heading="Notes" data-pk-section="notes" data-pk-section-order="3"><p>Free text.</p></pk-card>
<div slot="sidebar">
<pk-card id="history" heading="History" data-pk-section="history" data-pk-section-order="2" data-pk-section-count="12"><p>12 events</p></pk-card>
</div>
</pk-detail-layout>`,
    steps: [{ shot: 'strip' }],
    expect(t) {
        if (t.viewport.name !== 'phone') return;
        t.visible('#dl >>> pk-tabs', 'the strip shows on a phone');
        const x = s => t.rect('#dl >>> pk-tab[value=' + s + ']')?.x;
        t.ok(x('details') < x('history') && x('history') < x('notes'), 'the sidebar section sits between the main ones');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
