// The print page in real print media (#1024): the browser is switched to the print media type ({ media: 'print' }), so the app shell's chrome, the toolbar and screen-only parts are
// measured as hidden, the document is left, cards are not split and the table keeps whole rows under a repeating header. The shot shows what the print preview draws.
const rows = Array.from({ length: 6 }, (_, i) => ({ item: `Item ${i + 1}`, qty: String(i + 1) }));
export default {
    name: 'print-page-print',
    issue: [1024],
    elements: ['print-page'],
    viewports: ['desktop'],
    themes: ['light'],
    html: '<pk-app-shell><div slot="nav" id="chrome-nav">Navigation</div><div slot="header" id="chrome-header">App header</div><div slot="footer" id="chrome-footer">App footer</div><pk-print-page size="A4" margin="15mm"><pk-button slot="toolbar" id="tb">Print</pk-button><h1>Statement, October</h1><pk-card heading="Acme Supply"><p>Balance due 1,240.00</p></pk-card><p data-screen-only id="so">Screen only: not printed.</p><pk-table id="tbl" caption="Lines"></pk-table></pk-print-page></pk-app-shell>',
    setup(frame) {
        const table = frame.querySelector('#tbl');
        table.columns = [{ key: 'item', label: 'Item' }, { key: 'qty', label: 'Qty' }];
        table.rows = rows;
    },
    steps: [{ wait: 'settle' }, { shot: 'screen' }, { media: 'print' }, { shot: 'print' }],
    expect(t) {
        if (t.shot === 'screen') return t.visible('#chrome-header', 'the app header on screen');
        for (const id of ['#chrome-nav', '#chrome-header', '#chrome-footer', '#so', '#tb']) t.hidden(id, `${id} in print`);
        t.visible('pk-print-page pk-card', 'the document card');
        t.ok(t.style('pk-print-page pk-card', 'break-inside') === 'avoid', 'a card is not split');
        t.ok(t.style('#tbl >>> thead', 'display') === 'table-header-group', 'the table header repeats on every page');
        t.ok(t.style('#tbl >>> tbody tr', 'break-inside') === 'avoid', 'a table row is not split');
    },
};
