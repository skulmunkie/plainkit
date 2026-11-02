// pk-tree with a very long item label in a stack inside a grid (issue 1851): the tree never widens its column or pushes the sibling card
// out; the long row clips or scrolls inside the tree, and a focused row keeps its ring.
export default {
    name: 'tree-wide-label',
    issue: [1851],
    elements: ['tree'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-grid>
<pk-stack id="col">
<pk-tree id="tr" label="Categories">
<pk-tree-item label="A category whose label keeps going on and on and on, well past the width of a phone column, with no break to wrap at"></pk-tree-item>
<pk-tree-item id="short" label="Short"></pk-tree-item>
</pk-tree>
<pk-card id="card"><p>A sibling card that must keep the column width.</p></pk-card>
</pk-stack>
</pk-grid>
</div>`,
    steps: [{ focus: '#short' }, { shot: 'wide-label' }],
    expect(t) {
        t.within('#tr', '#stage', 1);
        t.within('#card', '#stage', 1);
        t.ringUnclipped('#short');
    },
};
