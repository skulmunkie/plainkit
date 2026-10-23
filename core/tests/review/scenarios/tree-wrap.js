// pk-tree wrap-labels (issue 1713): long item labels wrap inside a narrow navigation column instead of one clipped line.
const COL = '#col', WRAPPED = '#wrapped pk-tree-item:nth-of-type(1)', CLIPPED = '#clipped pk-tree-item:nth-of-type(1)';
const LONG = 'Quarterly purchase orders waiting for approval by the regional finance team';
export default {
    name: 'tree-wrap',
    issue: [1713],
    elements: ['tree', 'tree-item'],
    html: `<div id="col" class="u-p-1r-1p25r"><pk-tree id="clipped" label="Clipped"><pk-tree-item label="${LONG}"></pk-tree-item><pk-tree-item label="Short"></pk-tree-item></pk-tree><pk-tree id="wrapped" label="Wrapped" wrap-labels><pk-tree-item label="${LONG}"></pk-tree-item><pk-tree-item label="Short"></pk-tree-item></pk-tree></div>`,
    setup(frame) { frame.querySelector('#col').style.inlineSize = '12rem'; }, // a narrow nav column (CSSOM, not a style attribute)
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.within(WRAPPED, COL);
        t.within(CLIPPED, COL);
        const w = t.rect(WRAPPED), c = t.rect(CLIPPED);
        if (w && c) t.ok(w.height > c.height + 8, `the wrapped row is ${Math.round(w.height)}px tall, expected taller than the one-line ${Math.round(c.height)}px`);
    },
};
