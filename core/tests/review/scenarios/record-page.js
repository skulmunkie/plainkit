// pk-record-page (#353): a record read as a field list beside summary cards, then in edit mode (the form), then a failed save with a server error on its field.
// load and save are callback properties, wired in setup(), so every state is the real one.
const RP = 'pk-record-page';
const MAIN = `${RP} >>> [part=main]`;

export default {
    name: 'record-page',
    elements: ['record-page', 'detail-layout', 'field-list', 'form', 'field', 'input', 'textarea', 'select', 'card', 'button', 'page-header', 'breadcrumb'],
    html: '<pk-record-page></pk-record-page>',
    setup(frame) {
        const el = frame.querySelector(RP);
        el.load = () => ({ name: 'Widget 1 Cover A', sku: 'AC-1001', status: 'active', notes: 'Ships in two boxes.' });
        el.save = () => Promise.reject(Object.assign(new Error('The record was not saved.'), { errors: { sku: 'SKU AC-1001 is already used.' } }));
        el.config = {
            id: '1', heading: 'Product', title: 'Widget 1', breadcrumb: [{ label: 'Home', href: '#' }, { label: 'Products', href: '#' }], actions: [{ key: 'archive', label: 'Archive', variant: 'secondary' }],
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'sku', label: 'SKU', required: true },
                { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }] },
                { name: 'notes', label: 'Notes', type: 'textarea' },
            ],
            sidebar: [{ heading: 'Summary', fields: ['sku', 'status'] }],
        };
    },
    steps: [
        { shot: 'view' },
        { click: `${RP} >>> [part=edit]` }, { shot: 'edit' },
        { click: `${RP} >>> [part=save]` }, { shot: 'server-error' },
    ],
    expect(t) {
        t.inViewport(RP);
        t.visible(`${RP} >>> [part=header] pk-page-header`, 'the shared title bar');
        t.noOverlap(`${RP} >>> [part=header]`, `${RP} >>> [part=bar]`);
        if (t.shot === 'view') {
            t.hasText(MAIN, 'Widget 1 Cover A');
            t.visible(`${RP} >>> [part=edit]`, 'the Edit button');
            t.absent(`${MAIN} pk-form`);
        }
        if (t.shot === 'edit') {
            t.visible(`${MAIN} pk-form`, 'the form');
            t.visible(`${RP} >>> [part=save]`, 'the Save button');
        }
        if (t.shot === 'server-error') {
            t.visible(`${MAIN} pk-field[error]`, 'the field carrying the server error');
        }
    },
};
