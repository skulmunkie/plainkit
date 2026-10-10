// The print page on screen (#1024): a paper-like sheet under the screen-only toolbar on a desktop, flat and full width on a phone. Print output itself is measured in the
// browser suite (print-page cases); this scenario is for looking at the screen preview.
export default {
    name: 'print-page',
    issue: [1024],
    elements: ['print-page'],
    html: '<pk-print-page size="A4" margin="15mm"><pk-button slot="toolbar" icon-name="document">Print</pk-button><pk-button slot="toolbar" variant="ghost">Back</pk-button><h1>Statement, October</h1><pk-card heading="Acme Supply"><p>Balance due 1,240.00</p></pk-card><p data-screen-only>Screen only: not printed.</p></pk-print-page>',
    steps: [{ wait: 'settle' }, { shot: 'preview' }],
    expect(t) {
        const sheet = 'pk-print-page >>> [part="sheet"]', bar = 'pk-print-page >>> [part="toolbar"]';
        t.fitsWidth(sheet);
        t.noOverlap(sheet, bar);    },
};
