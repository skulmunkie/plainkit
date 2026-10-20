// pk-field-group with layout="inline" (issue 1688): a short add-row. Three fields and the Add and Cancel buttons of the end slot share one row,
// bottom-aligned, with the labels above; on a phone the row wraps and nothing leaves the viewport.
const FIELDS = [{ key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Quantity', kind: 'number' }, { key: 'note', label: 'Note' }];

export default {
    name: 'field-group-inline',
    issue: [1688],
    elements: ['field-group'],
    html: `<pk-stack><pk-field-group id="g" label="Add line" layout="inline"><pk-button slot="end" id="add" variant="primary">Add</pk-button><pk-button slot="end" id="cancel" variant="ghost">Cancel</pk-button></pk-field-group></pk-stack>`,
    steps: [
        { set: '#g', prop: 'fields', value: FIELDS },
        { wait: 'settle' },
        { shot: 'row' },
    ],
    expect(t) {
        const g = t.rect('#g'), add = t.rect('#add'), cancel = t.rect('#cancel');
        t.visible('#add'); t.visible('#cancel'); t.inViewport('#add'); t.inViewport('#cancel');
        if (g && add && cancel) t.ok(add.right <= g.right + 1 && cancel.right <= g.right + 1, 'the end content stays inside the group');
        if (t.viewport.name === 'desktop') {
            const sku = t.rect('#g >>> pk-field'), a = t.rect('#add');
            if (sku && a) t.ok(a.bottom <= sku.bottom + 2 && a.bottom >= sku.bottom - 26, `Add (bottom ${Math.round(a.bottom)}) sits on the fields' row (bottom ${Math.round(sku.bottom)})`);
            t.ok(true);
        }
    },
};
