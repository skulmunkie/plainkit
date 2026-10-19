// pk-table with resizable and reorderable columns (issue 1580), driven from the keyboard (the steps have no drag): a column widened from its separator, a column moved with Alt+Arrow
// (header and cells together, focus kept on the moved header), with a sticky header and an editable cell so the layouts that must hold - sizes, cell alignment, the frame - are the ones measured.
const columns = JSON.stringify([
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'name', label: 'Product', editor: 'text' },
    { key: 'qty', label: 'Qty', type: 'number', editor: 'number', min: 0 },
    { key: 'note', label: 'Note' },
]);
const rows = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, name: `Widget number ${i + 1}`, qty: i % 40, note: i % 3 ? 'In stock' : 'Backorder: expected next week' })));
const head = key => `#g >>> thead tr:first-child th[data-key=${key}]`;
const grip = key => `${head(key)} [data-resize]`;

export default {
    name: 'table-columns',
    issue: [1580, 331],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="g" label="Stock" caption="Resizable, reorderable columns" editable resizable reorderable sticky-header max-height="18rem" columns='${columns}' rows='${rows}'></pk-table></div>`,
    steps: [
        { waitFor: '#g >>> thead th[data-key=sku] [data-resize]' },
        { shot: 'rest' },
        { focus: grip('name') }, { key: 'ArrowRight', times: 6 }, { wait: 200 }, { shot: 'resized' },
        { key: 'ArrowLeft', times: 80 }, { wait: 200 }, { shot: 'narrow' },
        { focus: head('note') }, { key: 'Alt+ArrowLeft' }, { key: 'Alt+ArrowLeft' }, { wait: 200 }, { shot: 'reordered' },
        { hover: grip('qty') }, { shot: 'hover' },
    ],
    expect(t) {
        t.inViewport('#g');
        const frame = '#g >>> [part="scroll"]';
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'rest') t.visible(grip('name'), 'each header has a resize handle');
        if (t.shot === 'resized') t.ok(t.metric(head('name'), 'offsetWidth') > 120, 'the column did not widen with ArrowRight');
        if (t.shot === 'narrow') t.ok(t.metric(head('name'), 'offsetWidth') <= 60, 'the column did not narrow to the minimum with ArrowLeft');
        if (t.shot === 'reordered' || t.shot === 'hover') {
            t.ok(t.metric(head('note'), 'offsetLeft') < t.metric(head('name'), 'offsetLeft'), 'Note did not move ahead of Product');
            t.within('#g >>> tbody tr:first-child td[data-key=note]', frame, 1);
        }
    },
};
