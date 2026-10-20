// pk-table raw mode column widths (#1698): width="sm" gives the amount column a compact width and width="fit" lets the action column shrink to its button, with no class.
const SEL = 'pk-table';

export default {
    name: 'table-raw-width',
    issue: [1698],
    elements: ['table'],
    html: '<pk-table label="Lines"><table><thead><tr><th>Name</th><th width="sm">Amount</th><th width="fit"><span class="u-sr-only">Actions</span></th></tr></thead><tbody><tr><td>Bracket</td><td><pk-input value="4.00"></pk-input></td><td><pk-button size="mini" variant="ghost">Remove</pk-button></td></tr><tr><td>Hinge</td><td><pk-input value="2.50"></pk-input></td><td><pk-button size="mini" variant="ghost">Remove</pk-button></td></tr></tbody></table></pk-table>',
    steps: [{ shot: 'rest' }],
    expect(t) {
        t.inViewport(SEL);
        t.visible('pk-table td pk-button', 'the action button shows');
        t.within('pk-table td pk-button', SEL);
    },
};
