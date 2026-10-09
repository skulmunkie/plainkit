// pk-field-group inside pk-form (issues 222, 226): a stopped submit shows every problem of the group in the summary and in its own field, focus on the first, then the fixed form.
// Each state fits the width at desktop and phone, in both themes, with the summary and the focused field in view.
const FIELDS = [
    { key: 'name', label: 'Name', required: true, msg: { required: 'Enter a name.' } },
    { key: 'qty', label: 'Quantity', kind: 'number', min: '5', hint: 'At least five units.' },
    { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
    { key: 'note', label: 'Closing note', kind: 'textarea', required: true, when: { field: 'status', equals: 'closed' } },
];

export default {
    name: 'field-group-form',
    issue: [222, 226],
    elements: ['field-group', 'form', 'field', 'input', 'button'],
    html: '<div id="stage"><pk-card heading="Order"><pk-form id="f" summary><form id="form"><pk-stack><pk-field-group id="g" label="Order"></pk-field-group><pk-button id="sub" type="submit" variant="primary">Save</pk-button></pk-stack></form></pk-form></pk-card></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        g.fields = FIELDS; g.values = { qty: '1', status: 'open' };
        frame.querySelector('#form').addEventListener('submit', e => e.preventDefault());
    },
    steps: [
        { wait: 600 }, { shot: 'resting' },
        { click: '#sub' }, { wait: 500 }, { shot: 'errors' },
        { set: '#g', prop: 'values', value: { qty: '1', status: 'closed' } }, { wait: 400 }, { click: '#sub' }, { wait: 500 }, { shot: 'conditional-errors' },
        { set: '#g', prop: 'values', value: { name: 'Acme', qty: '9', status: 'closed', note: 'Paid.' } }, { wait: 900 }, { click: '#sub' }, { wait: 900 }, { shot: 'valid' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 300 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#g', 'the field group');
        t.within('#g >>> pk-field', '#g');
        if (t.shot === 'errors') { t.visible('#f >>> [part=summary]', 'the summary'); t.inViewport('#f >>> [part=summary]'); }
    },
};
