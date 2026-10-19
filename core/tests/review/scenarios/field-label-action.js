// pk-field-group labelActionEnd (issue 1628): a label action beside the label text, one pinned to the end of the label row, and one on a custom field.
export default {
    name: 'field-label-action',
    issue: [1628],
    elements: ['field-group', 'field'],
    html: '<div id="stage"><pk-card heading="Order"><pk-field-group id="g" label="Order"><pk-badge slot="label-action-pct">52%</pk-badge><pk-badge slot="label-action-qty">kg</pk-badge><pk-button slot="label-action-w" size="mini" variant="ghost">None</pk-button><div slot="editor-w">Custom body</div></pk-field-group></pk-card></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.fields = [
            { key: 'pct', label: 'Share', kind: 'number' },
            { key: 'qty', label: 'Quantity', kind: 'number', labelActionEnd: true },
            { key: 'w', label: 'Weight', kind: 'custom', labelActionEnd: true },
        ];
        g.values = { pct: '52', qty: '4' };
    },
    steps: [{ wait: 600 }, { shot: 'resting' }],
    expect(t) {
        t.visible('#g', 'the field group');
        t.within('#g >>> pk-field', '#g');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
