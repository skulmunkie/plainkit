// pk-table in edit mode with 1200 rows and a host that saves asynchronously through detail.wait (issue 331): a committed cell is busy (aria-busy, dimmed) while the host answers, a refused one
// goes back to its value and shows the host's message (aria-invalid, a short line under the cell, readable even in the narrow phone column), and a date column opens a native date input. The grid
// windows, so the edited row is far from the top of the list when the answer comes; every state must stay inside the scroll frame.
const columns = JSON.stringify([
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Product', editor: 'text', required: true },
    { key: 'qty', label: 'Qty', type: 'number', editor: 'number', min: 0 },
    { key: 'due', label: 'Due', type: 'date', editor: 'date', min: '2026-01-01', max: '2026-12-31' },
]);
const rows = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, name: `Widget number ${i + 1}`, qty: i % 40, due: '2026-03-05' })));
const frame = '#g >>> [part="scroll"]';
const cell = (id, key) => `#g >>> tr[data-pk-context="${id}"] td[data-key=${key}]`;

export default {
    name: 'table-edit-async',
    issue: [331],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="g" label="Stock" caption="1200 rows, saved by the host" editable sticky-header max-height="20rem" columns='${columns}' rows='${rows}'></pk-table></div>`,
    setup(root) {
        // The host: a name of "Taken" is refused after a pause, anything else is accepted after a shorter one.
        root.querySelector('#g').addEventListener('pk-cell-edit', e => e.detail.wait(new Promise((ok, no) => setTimeout(() => e.detail.value === 'Taken' ? no(new Error('Name already taken by another product')) : ok(), e.detail.value === 'Taken' ? 1500 : 800))));
    },
    steps: [
        { shot: 'rest' },
        { scroll: frame, to: 6000 }, { wait: 300 }, { shot: 'scrolled' },
        { scroll: frame, to: 0 }, { wait: 300 },
        { focus: cell(3, 'name') }, { key: 'Enter' }, { type: 'Taken' }, { key: 'Enter' }, { wait: 100 }, { shot: 'pending' },
        { wait: 2000 }, { focus: cell(3, 'name') }, { shot: 'rejected' },
        { focus: cell(4, 'due') }, { key: 'Enter' }, { wait: 200 }, { shot: 'date' },
        { key: 'Escape' }, { key: 'ArrowDown' }, { key: 'ArrowLeft' }, { key: 'Enter' }, { type: '7' }, { key: 'Enter' }, { wait: 100 }, { shot: 'pending-number' }, { wait: 1200 }, { shot: 'saved' },
    ],
    expect(t) {
        t.inViewport('#g');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'pending') {
            t.ok(t.attr(cell(3, 'name'), 'aria-busy') === 'true', 'the cell the host is still saving is not aria-busy');
            t.hasText(cell(3, 'name'), 'Taken');
        }
        if (t.shot === 'rejected') {
            t.hasText(cell(3, 'name'), 'Widget number 3');
            t.ok(t.attr(cell(3, 'name'), 'aria-busy') === null || t.attr(cell(3, 'name'), 'aria-busy') === undefined, 'a refused cell is still busy');
            t.ok(t.attr(cell(3, 'name'), 'aria-invalid') === 'true', 'a refused cell is not aria-invalid');
            t.visible(`${cell(3, 'name')} [data-cell-error]`, 'the host message'); t.hasText(`${cell(3, 'name')} [data-cell-error]`, 'Name already taken by another product');
            t.within(`${cell(3, 'name')} [data-cell-error]`, frame, 1);
            t.ok(t.rect(`${cell(3, 'name')} [data-cell-error]`).height < 80, 'the message is wrapped to a column of letters');
        }
        if (t.shot === 'date') {
            t.visible(`${cell(4, 'due')} input[type=date]`, 'the date editor'); t.within(`${cell(4, 'due')} input[type=date]`, frame, 1);
            if (t.viewport.name === 'phone') t.atLeast(`${cell(4, 'due')} input[type=date]`, 'height', 44);
        }
        if (t.shot === 'pending-number') t.ok(t.attr(cell(5, 'qty'), 'aria-busy') === 'true', 'the number cell is not busy while saved');
        if (t.shot === 'saved') { t.hasText(cell(5, 'qty'), '7'); t.ok(t.attr(cell(5, 'qty'), 'aria-invalid') !== 'true', 'an accepted cell is marked invalid'); }
    },
};
