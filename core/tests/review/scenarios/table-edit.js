// pk-table in edit mode (issue 331): the grid at rest (active cell, read-only cells, the switch column), a text cell open for editing, a number cell holding an invalid
// draft (its message, aria-invalid, the editor kept open), and a select cell, and an edit undone with Ctrl+Z. Each state must stay inside the scroll frame; on a phone the editor keeps a tap target.
const columns = JSON.stringify([
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Product', editor: 'text', required: true },
    { key: 'qty', label: 'Qty', type: 'number', editor: 'number', required: true, min: 0 },
    { key: 'status', label: 'Status', editor: 'select', options: ['Active', 'Draft', 'Retired'] },
    { key: 'listed', label: 'Listed', editor: 'switch' },
]);
const rows = JSON.stringify([
    { id: 1, sku: 'AC-1001', name: 'Widget number one', qty: 12, status: 'Active', listed: true },
    { id: 2, sku: 'AC-1002', name: 'Widget number two', qty: 0, status: 'Draft', listed: false },
    { id: 3, sku: 'AC-1003', name: 'Widget number three', qty: 48, status: 'Retired', listed: false },
]);
const cell = (row, key) => `#g >>> tbody tr:nth-child(${row}) td[data-key=${key}]`;

export default {
    name: 'table-edit',
    issue: [331],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="g" label="Stock" caption="Edit a cell with Enter" editable columns='${columns}' rows='${rows}'></pk-table></div>`,
    steps: [
        { wait: 400 }, { shot: 'rest' },
        { focus: cell(1, 'name') }, { key: 'Enter' }, { wait: 200 }, { type: ' XL' }, { shot: 'editing' },
        { key: 'Escape' }, { wait: 200 },
        { focus: cell(2, 'qty') }, { key: 'Enter' }, { wait: 200 }, { type: 'lots' }, { key: 'Enter' }, { wait: 200 }, { shot: 'invalid' },
        { key: 'Escape' }, { wait: 200 },
        { focus: cell(1, 'name') }, { key: 'Enter' }, { wait: 200 }, { key: 'End' }, { type: ' XL' }, { key: 'Enter' }, { wait: 200 }, { shot: 'edited' },
        { key: 'Control+z' }, { wait: 200 }, { shot: 'undone' },
        { focus: cell(3, 'status') }, { key: 'Enter' }, { wait: 200 }, { shot: 'select' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways (the grid must scroll inside its own frame)');
        t.inViewport('#g');
        t.ok(t.attr('#g >>> table', 'role') === 'grid', 'the editable table is not a grid');
        t.ok(t.attr(cell(1, 'sku'), 'aria-readonly') === 'true', 'a column without an editor is not aria-readonly');
        if (t.shot === 'rest') {
            t.ok(t.attr(cell(1, 'sku'), 'aria-selected') === 'true', 'the first cell is not the active one');
            t.exists(`${cell(1, 'listed')} input[role=switch]`);
        }
        if (t.shot === 'editing') {
            t.visible(`${cell(1, 'name')} input`, 'the text editor'); t.within(`${cell(1, 'name')} input`, cell(1, 'name'), 1);
            t.ok(t.attr(`${cell(1, 'name')} input`, 'aria-label') === 'Product, row 1', 'the editor has no name');
            t.ok(t.attr(cell(1, 'name'), 'aria-selected') === 'true', 'the edited cell is not the active one');
            if (t.viewport.name === 'phone') t.atLeast(`${cell(1, 'name')} input`, 'height', 44);
        }
        if (t.shot === 'invalid') {
            t.visible(`${cell(2, 'qty')} [data-cell-error]`, 'the error message'); t.hasText(`${cell(2, 'qty')} [data-cell-error]`, 'Enter a number');
            t.within(`${cell(2, 'qty')} [data-cell-error]`, cell(2, 'qty'), 1);
            t.ok(t.attr(`${cell(2, 'qty')} input`, 'aria-invalid') === 'true', 'the invalid editor is not aria-invalid');
            t.ok(t.attr(cell(2, 'qty'), 'aria-invalid') === 'true', 'the invalid cell is not aria-invalid');
            t.ok(!!t.attr(`${cell(2, 'qty')} input`, 'aria-describedby'), 'the message is not tied to the editor');
            t.ringVisible(`${cell(2, 'qty')} input`);
        }
        if (t.shot === 'edited') t.hasText(cell(1, 'name'), 'Widget number one XL');
        if (t.shot === 'undone') { t.hasText(cell(1, 'name'), 'Widget number one'); t.ok(t.attr(cell(1, 'name'), 'aria-selected') === 'true', 'the undone cell is not the active one'); }
        if (t.shot === 'select') { t.exists(`${cell(3, 'status')} select`); t.within(`${cell(3, 'status')} select`, cell(3, 'status'), 1); }
    },
};
