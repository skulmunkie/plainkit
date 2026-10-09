// pk-field-group (issues 222, 226): the states a still example cannot show. The fields at rest, a conditional field shown after its gate changes, two columns with a spanning field,
// every control disabled, and right-to-left. Each state fits the width at desktop and phone, in both themes, with nothing overlapping or clipped.
const FIELDS = [
    { key: 'name', label: 'Name', required: true, hint: 'As printed on the invoice.' },
    { key: 'qty', label: 'Quantity', kind: 'number', min: '1', help: 'How many units, at least one.' },
    { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
    { key: 'note', label: 'Closing note', kind: 'textarea', required: true, span: true, when: { field: 'status', equals: 'closed' } },
    { key: 'when', label: 'Due', kind: 'date' },
    { key: 'rush', label: 'Rush order', kind: 'switch' },
    { key: 'mail', label: 'Receipt to', kind: 'email', hideLabel: true, placeholder: 'name@example.com', span: true },
];

export default {
    name: 'field-group',
    issue: [222, 226],
    elements: ['field-group', 'field', 'input', 'select', 'textarea', 'switch'],
    html: '<div id="stage"><pk-card heading="Order"><pk-field-group id="g" label="Order"></pk-field-group></pk-card></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.fields = FIELDS; g.values = { name: 'Acme Hardware', qty: '12', status: 'open', rush: true };
    },
    steps: [
        { wait: 600 }, { shot: 'resting' },
        { set: '#g', prop: 'values', value: { name: 'Acme Hardware', qty: '12', status: 'closed', note: 'Shipped and paid.' } }, { wait: 400 }, { shot: 'conditional' },
        { set: '#g', attr: 'columns', value: '2' }, { wait: 300 }, { shot: 'two-columns' },
        { set: '#g', attr: 'disabled', value: '' }, { wait: 300 }, { shot: 'disabled' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 300 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#g', 'the field group');
        t.inViewport('#g');
        t.within('#g >>> pk-field', '#g');
    },
};
