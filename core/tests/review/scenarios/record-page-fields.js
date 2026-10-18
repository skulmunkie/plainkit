// pk-record-page field sections and editable sidebar cards (#1552): config.sections are titled cards in the main column (lists in view mode), a sidebar card is an editable
// group in edit mode (its field leaves the main form), and a server error lands on a sidebar field. load and save are wired in setup(), so every state is the real one.
const RP = 'pk-record-page';
const MAIN = `${RP} >>> [part=main]`;
const SIDE = `${RP} >>> [part=side]`;

export default {
    name: 'record-page-fields',
    issue: [1552],
    elements: ['record-page', 'detail-layout', 'field-list', 'field-group', 'card', 'checkbox', 'form'],
    html: '<pk-record-page></pk-record-page>',
    setup(frame) {
        const el = frame.querySelector(RP);
        el.load = () => ({ name: 'Acme Ltd', street: '1 Main Street', city: 'Oslo', notes: 'Pays on the 20th.', active: true });
        el.save = () => Promise.reject(Object.assign(new Error('not saved'), { errors: { active: 'Cannot deactivate a customer with open orders.' } }));
        el.config = {
            id: '1', heading: 'Details', title: 'Acme Ltd',
            fields: [{ key: 'name', label: 'Name', required: true }, { key: 'street', label: 'Street' }, { key: 'city', label: 'City' }, { key: 'notes', label: 'Notes', kind: 'textarea' }, { key: 'active', label: 'Active', kind: 'checkbox' }],
            sections: [{ heading: 'Address', fields: ['street', 'city'] }, { heading: 'Notes', fields: ['notes'] }],
            sidebar: [{ heading: 'Status', fields: ['active'] }],
        };
    },
    steps: [{ shot: 'view' }, { click: `${RP} >>> [part=edit]` }, { shot: 'edit' }, { click: `${RP} >>> [part=save]` }, { shot: 'server-error' }],
    expect(t) {
        t.visible(RP, 'the record page');
        if (t.shot === 'view') t.exists(`${MAIN} pk-field-list:nth-of-type(3)`);
        if (t.shot === 'edit' || t.shot === 'server-error') {
            t.exists(`${MAIN} pk-card:nth-of-type(3)`); t.absent(`${MAIN} pk-card:nth-of-type(4)`);
            t.visible(`${SIDE} pk-field-group`, 'the editable sidebar card');
            if (t.viewport.name === 'desktop') t.noOverlap(MAIN, SIDE);
        }
        if (t.shot === 'server-error') t.visible(`${SIDE} pk-field-group >>> pk-field[error]`, 'the sidebar field carrying the server error');
    },
};
