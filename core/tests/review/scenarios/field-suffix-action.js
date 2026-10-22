// pk-field-group suffixAction (issue 1725): an icon button inside the end of an input, in a card, with a read-only field beside it.
export default {
    name: 'field-suffix-action',
    issue: [1725],
    elements: ['field-group', 'input'],
    html: '<div id="stage"><pk-card heading="Item"><pk-field-group id="g" label="Item"></pk-field-group></pk-card></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.fields = [
            { key: 'sku', label: 'SKU', suffixAction: { icon: 'search', label: 'Find SKU', key: 'find' } },
            { key: 'ref', label: 'Reference', readonly: true, suffixAction: { icon: 'search', label: 'Find reference', key: 'ref' } },
        ];
        g.values = { sku: 'A-100', ref: 'R-7' };
    },
    steps: [{ wait: 600 }, { shot: 'resting' }],
    expect(t) {
        t.visible('#g', 'the field group');
        t.within('#g >>> pk-input pk-button', '#g');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
