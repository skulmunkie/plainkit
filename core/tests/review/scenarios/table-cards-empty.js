// pk-table phone cards (issues 1777, 1794): a slotted cell that renders nothing draws no label in its card.
export default {
    name: 'table-cards-empty',
    issue: [1777, 1794],
    elements: ['table'],
    html: `<pk-table cards label="Parts" columns='[{"key":"sku","label":"SKU"},{"key":"tag","label":"Tag"}]' rows='[{"id":1,"sku":"A"},{"id":2,"sku":"B"}]'><span slot="cell-1-tag"><b>hot</b></span><span slot="cell-2-tag"></span></pk-table>`,
    steps: [{ shot: 'rest' }],
    expect(t) { t.inViewport('pk-table'); },
};
