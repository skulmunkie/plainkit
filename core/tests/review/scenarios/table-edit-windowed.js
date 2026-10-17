// pk-table in edit mode with 1200 rows (issue 1474): the grid windows, so the states that matter are the ones a window can break. A cell opened for editing and scrolled far away stays drawn and keeps
// its editor; Ctrl+End jumps to the last row (drawn, focused, below the sticky header); the header stays flush with the frame while scrolled. Rows keep their height when an editor opens.
const columns = JSON.stringify([
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Product', editor: 'text', required: true },
    { key: 'qty', label: 'Qty', type: 'number', editor: 'number', required: true, min: 0 },
]);
const rows = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, name: `Widget number ${i + 1}`, qty: i % 40 })));
const frame = '#g >>> [part="scroll"]';
const cell = (id, key) => `#g >>> tr[data-pk-context="${id}"] td[data-key=${key}]`;

export default {
    name: 'table-edit-windowed',
    issue: [1474, 331],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="g" label="Stock" caption="1200 rows, windowed" editable sticky-header max-height="20rem" columns='${columns}' rows='${rows}'></pk-table></div>`,
    steps: [
        { shot: 'rest' },
        { focus: cell(3, 'name') }, { key: 'Enter' }, { type: ' XL' }, { scroll: frame, to: 20000 }, { wait: 300 }, { shot: 'editing-scrolled-away' },
        { key: 'Escape' }, { key: 'Control+End' }, { wait: 300 }, { shot: 'last-row' },
        { key: 'Control+Home' }, { wait: 200 }, { key: 'ArrowDown' }, { key: 'Shift+ArrowDown' }, { key: 'Shift+ArrowDown' }, { key: 'Shift+ArrowRight' }, { wait: 200 }, { shot: 'selection' },
        { key: 'Control+d' }, { wait: 300 }, { shot: 'filled' },
    ],
    expect(t) {
        t.inViewport('#g');
        t.ok(t.attr('#g >>> table', 'aria-rowcount') === '1201', 'aria-rowcount is not the whole view plus the header');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'editing-scrolled-away') {
            t.visible(`${cell(3, 'name')} input`, 'the editor of a row scrolled far away stays drawn');
            t.ok(t.metric(frame, 'scrollTop') > 5000, 'the frame did not scroll');
        }
        if (t.shot === 'selection' || t.shot === 'filled') {
            t.ok(t.attr(cell(4, 'qty'), 'aria-selected') === 'true' && t.attr(cell(2, 'name'), 'aria-selected') === 'true', 'the 3x2 block from row 2 is not selected');
            t.ok(t.attr(cell(5, 'name'), 'aria-selected') === 'false', 'the selection spills past its block');
            t.ok(t.attr('#g >>> table', 'aria-multiselectable') === 'true', 'the grid does not say it holds a range');
        }
        if (t.shot === 'filled') t.hasText(cell(4, 'name'), 'Widget number 2');
        if (t.shot === 'last-row') {
            t.visible(cell(1200, 'name'), 'the last row is drawn after Ctrl+End');
            t.ok(t.attr(cell(1200, 'name'), 'aria-selected') === 'true', 'the last cell is not the active one');
            t.within(cell(1200, 'name'), frame, 1);
        }
    },
};
