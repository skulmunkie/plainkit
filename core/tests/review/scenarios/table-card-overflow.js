// pk-table cards (issue 1015): a cell whose content cannot break (a long identifier in code, a button with a long label) must not widen the
// card on a phone; the other values (quantity, status) stay inside the card and the viewport.
const columns = JSON.stringify([{ key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Qty' }, { key: 'status', label: 'Status' }]);
const rows = JSON.stringify([{ id: '1', sku: 'x', qty: '12', status: 'Shipped' }, { id: '2', sku: 'y', qty: '3', status: 'Pending' }]);
const SKU = 'some-long-sku-identifier-with-dashes-and-more-parts';
const STATUS = '#t >>> td[data-key=status]';
const CARD = '#t >>> tbody tr';

export default {
    name: 'table-card-overflow',
    issue: [1015],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="t" cards label="Orders" columns='${columns}' rows='${rows}'>
<pk-button slot="cell-1-sku" variant="plain"><code>${SKU}</code></pk-button><code slot="cell-2-sku">${SKU}</code>
</pk-table></div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(STATUS, 'the status value'); t.within(STATUS, CARD, 1); t.inViewport(STATUS);
    },
};
