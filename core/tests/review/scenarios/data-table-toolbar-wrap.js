// pk-data-table toolbar with long action buttons plus the add button (issue 1016): the actions wrap inside the width instead of widening the page,
// so the add button is never clipped at the end of the row, on a phone or on desktop.
export default {
    name: 'data-table-toolbar-wrap',
    issue: [1016],
    elements: ['data-table', 'table'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-data-table id="dt" label="Products" add-label="Add a new product" columns='[{"key":"sku","label":"SKU"},{"key":"name","label":"Name"}]'>
<pk-button slot="actions" variant="ghost">Export the filtered rows</pk-button>
<pk-button slot="actions" variant="ghost">Import from a file</pk-button>
</pk-data-table>
</div>`,
    steps: [{ wait: 400 }, { shot: 'toolbar' }],
    expect(t) {
        t.visible('#dt >>> [part=add]', 'the add button');
        t.inViewport('#dt >>> [part=add]');
        t.within('#dt >>> [part=toolbar]', '#stage', 1);
    },
};
