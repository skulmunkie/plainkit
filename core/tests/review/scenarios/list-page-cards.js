// pk-list-page with cards (issue 1549): on a phone every row is a card and a hidePhone column is dropped; on desktop it is the ordinary table. Nothing scrolls sideways.
const LP = '#lp';
const TABLE = `${LP} >>> [part=table] >>> [part=table]`;
const ROWS = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners', note: `Dock ${i + 1}`, total: `EUR ${100 + i}` }));

export default {
    name: 'list-page-cards',
    issue: [1549],
    elements: ['list-page'],
    html: '<pk-list-page id="lp" cards></pk-list-page>',
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = { heading: 'Orders', columns: [{ key: 'po', label: 'PO', title: true }, { key: 'customer', label: 'Customer' }, { key: 'note', label: 'Note', hidePhone: true }, { key: 'total', label: 'Total', align: 'end' }], pageSize: 5 };
        el.load = () => ({ rows: ROWS, total: 4 });
    },
    steps: [{ shot: 'rows' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${TABLE} >>> tbody td`, 'the rows');
        if (t.viewport.name === 'phone') t.hidden(`${TABLE} >>> td[data-hide-phone]`, 'the hidePhone cell inside a card');
        else t.visible(`${TABLE} >>> td[data-hide-phone]`, 'the hidePhone cell of the table');
    },
};
