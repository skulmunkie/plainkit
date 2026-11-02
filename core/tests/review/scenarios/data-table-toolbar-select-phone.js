// pk-data-table with a pk-select slotted in actions and the add button (issue 1848): on a phone the select fills the toolbar width and the add
// button stays an icon; on desktop the select keeps its own width in the row.
export default {
    name: 'data-table-toolbar-select-phone',
    issue: [1848],
    elements: ['data-table', 'select'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-data-table id="dt" label="Orders" add-label="Add order" columns='[{"key":"sku","label":"SKU"},{"key":"name","label":"Name"}]'>
<pk-select slot="actions" id="st" aria-label="Status"><option value="all">All statuses</option><option value="open">Open</option></pk-select>
</pk-data-table>
</div>`,
    steps: [{ shot: 'toolbar' }],
    expect(t) {
        t.visible('#st', 'the status select');
        t.within('#dt >>> [part=toolbar]', '#stage', 1);
        const tb = t.rect('#dt >>> [part=toolbar]'), s = t.rect('#st'), a = t.rect('#dt >>> [part=add]');
        if (!tb || !s || !a) return;
        if (t.viewport.name === 'phone') {
            t.ok(s.width >= tb.width - 1, `the select fills the toolbar on a phone (${Math.round(s.width)} of ${Math.round(tb.width)}px)`);
            t.ok(a.width < 80, `the add button stays an icon (${Math.round(a.width)}px)`);
        } else {
            t.ok(s.width < tb.width / 2, `the select keeps its own width on desktop (${Math.round(s.width)} of ${Math.round(tb.width)}px)`);
        }
    },
};
