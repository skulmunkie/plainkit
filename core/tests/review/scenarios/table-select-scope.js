// pk-table selection scope (issue 801): a paged (manual) table with a total. Selecting the loaded rows shows "Select all 112 rows" in the bulk bar (a real, named
// button with a focus ring, inside the polite status), choosing it reads "All 112 selected" with a "Clear selection" button, and neither state overflows or
// overlaps at desktop or phone width, light or dark.
const columns = JSON.stringify([{ key: 'po', label: 'PO', sortable: true }, { key: 'customer', label: 'Customer' }, { key: 'total', label: 'Total', type: 'number' }]);
const rows = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners', total: `$${(i + 1) * 120}.00` })));
const BAR = '#t >>> [part=bulk]';
const BTN = '#t >>> [part=bulk-all]';
const COUNT = '#t >>> [part=bulk-count]';

export default {
    name: 'table-select-scope',
    issue: [801, 798],
    elements: ['table'],
    html: `<div class="u-p-1r-1p25r"><pk-table id="t" label="Orders" manual selectable total="112" columns='${columns}' rows='${rows}'>
<pk-button slot="bulk" size="mini" variant="ghost">Export</pk-button>
</pk-table></div>`,
    steps: [
        { shot: 'rest' },
        { click: '#t >>> [data-select-all]' }, { wait: 200 }, { shot: 'page' },
        { focus: BTN }, { shot: 'page-focus' },
        { click: BTN }, { wait: 200 }, { shot: 'all' },
        { focus: BTN }, { shot: 'all-focus' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'rest') { t.hidden(BAR, 'the bulk bar with nothing selected'); return; }
        t.visible(BAR, 'the bulk bar'); t.visible(BTN, 'the select-all button'); t.within(BTN, BAR, 1); t.inViewport(BTN);
        t.noOverlap(BTN, COUNT);
        t.atLeast(BTN, 'height', t.viewport.name === 'phone' ? 44 : 20);
        if (t.shot.startsWith('page')) { t.hasText(BTN, 'Select all 112 rows'); t.hasText(COUNT, '5 selected'); }
        if (t.shot.startsWith('all')) { t.hasText(BTN, 'Clear selection'); t.hasText(COUNT, 'All 112 selected'); }
        if (t.shot.endsWith('-focus')) t.ringVisible(BTN);
    },
};
