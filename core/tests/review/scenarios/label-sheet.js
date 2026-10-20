// pk-label-sheet (#1674) on screen: 4x6-style cells at true physical scale with cut guides, three to a row; on a phone the sheet scrolls sideways instead of squeezing the cells.
export default {
    name: 'label-sheet',
    issue: [1674],
    elements: ['label-sheet'],
    html: '<pk-label-sheet cell-width="50mm" cell-height="25mm" columns="3" gap="2mm" outline>' + ['A1', 'A2', 'A3', 'B1', 'B2'].map(n => `<pk-card heading="Bin ${n}"><p>M6 bolts</p></pk-card>`).join('') + '</pk-label-sheet>',
    steps: [{ wait: 'settle' }, { shot: 'sheet' }],
    expect(t) {
        const cells = 'pk-label-sheet > pk-card';
        t.noOverlap(cells, 'pk-label-sheet > pk-card:nth-child(2)');
    },
};
