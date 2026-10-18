// pk-table in edit mode with the textarea and combobox editors (issue 1580): a multi-line note opens over its cell without changing the row height (Shift+Enter adds a line), a combobox
// cell is a native input with a list of options, and text outside the list shows the message and keeps the editor open. Every state must stay inside the scroll frame; on a phone the editors keep a tap target.
const columns = JSON.stringify([
    { key: 'sku', label: 'SKU' },
    { key: 'owner', label: 'Owner', editor: 'combobox', options: ['Ana Ruiz', 'Ben Okafor', 'Chi Tran'], required: true },
    { key: 'note', label: 'Note', editor: 'textarea' },
]);
const rows = JSON.stringify([
    { id: 1, sku: 'AC-1001', owner: 'Ana Ruiz', note: 'Reorder in May' },
    { id: 2, sku: 'AC-1002', owner: 'Ben Okafor', note: 'Supplier closed' },
    { id: 3, sku: 'AC-1003', owner: 'Chi Tran', note: '' },
]);
const frame = '#g >>> [part="scroll"]';
const cell = (row, key) => `#g >>> tbody tr:nth-child(${row}) td[data-key=${key}]`;
let h0;

export default {
    name: 'table-edit-lists',
    issue: [1580],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="g" label="Stock" caption="Edit a note or an owner" editable columns='${columns}' rows='${rows}'></pk-table></div>`,
    steps: [
        { shot: 'rest' },
        { focus: cell(2, 'note') }, { key: 'Enter' }, { key: 'End' }, { type: ' again' }, { key: 'Shift+Enter' }, { type: 'second line' }, { shot: 'textarea' },
        { key: 'Escape' },
        { focus: cell(1, 'owner') }, { key: 'Enter' }, { shot: 'combobox' },
        { type: 'zzz' }, { key: 'Enter' }, { shot: 'invalid' },
        { key: 'Escape' },
        { focus: cell(3, 'note') }, { key: 'Enter' }, { type: 'Last row note' }, { key: 'Shift+Enter' }, { type: 'two' }, { shot: 'textarea-last' },
    ],
    expect(t) {
        t.inViewport('#g');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'rest') h0 = t.rect(cell(2, 'note')).height;
        if (t.shot === 'textarea') {
            t.visible(`${cell(2, 'note')} textarea`, 'the textarea'); t.within(`${cell(2, 'note')} textarea`, frame, 1);
            t.ok(Math.abs(t.rect(cell(2, 'note')).height - h0) < 2, 'opening the textarea changed the row height');
            t.ok(t.rect(`${cell(2, 'note')} textarea`).height > h0 * 1.5, 'the textarea shows one line');
            if (t.viewport.name === 'phone') t.atLeast(`${cell(2, 'note')} textarea`, 'height', 44);
        }
        if (t.shot === 'combobox') {
            t.visible(`${cell(1, 'owner')} input`, 'the combobox input'); t.within(`${cell(1, 'owner')} input`, cell(1, 'owner'), 1);
            if (t.viewport.name === 'phone') t.atLeast(`${cell(1, 'owner')} input`, 'height', 44);
        }
        if (t.shot === 'invalid') { t.hasText(`${cell(1, 'owner')} [data-cell-error]`, 'Choose from the list'); t.visible(`${cell(1, 'owner')} input`, 'the editor stays open'); t.within(`${cell(1, 'owner')} [data-cell-error]`, frame, 1); }
        if (t.shot === 'textarea-last') { t.visible(`${cell(3, 'note')} textarea`, 'the textarea'); t.within(`${cell(3, 'note')} textarea`, frame, 1); }
    },
};
