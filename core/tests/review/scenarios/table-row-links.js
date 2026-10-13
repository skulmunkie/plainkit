// pk-table, pk-data-table and pk-list-page with row-href-template (#366): the first cell of each row is a real link; it shows as a link, keeps a visible focus ring, and the row stays inside
// the table at phone width. The hover and focus states of a link in a row are the ones a still example cannot show.
const DT = '#dt';
const TABLE = `${DT} >>> [part=table]`;
const LINK = `${TABLE} >>> a[data-row-link]`;
const PLAIN = '#plain >>> a[data-row-link]';
const ROWS = Array.from({ length: 4 }, (_, i) => ({ id: `A-${i + 1}`, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners', total: `$${(i + 1) * 120}.00` }));
const COLUMNS = [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer', hidePhone: true }, { key: 'total', label: 'Total', type: 'number' }];

export default {
    name: 'table-row-links',
    issue: [366],
    elements: ['table', 'data-table', 'list-page'],
    html: `<pk-stack gap="md"><pk-table id="plain" label="Orders" row-href-template="#order-{id}"></pk-table>
<pk-data-table id="dt" row-href-template="#order-{id}" caption="Orders (paged)"></pk-data-table>
<pk-list-page id="lp" row-href-template="#order-{id}"></pk-list-page></pk-stack>`,
    setup(frame) {
        const plain = frame.querySelector('#plain'), dt = frame.querySelector(DT);
        Object.assign(plain, { columns: COLUMNS, rows: ROWS });
        Object.assign(dt, { columns: COLUMNS, pageSize: 5, hideSearch: true });
        dt.load = () => ({ rows: ROWS, total: ROWS.length });
        const lp = frame.querySelector('#lp');
        lp.config = { heading: 'Orders (list page)', columns: COLUMNS, pageSize: 5, searchable: false };
        lp.load = () => ({ rows: ROWS, total: ROWS.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'links' }, { hover: PLAIN }, { shot: 'hover' }, { focus: LINK }, { shot: 'focus' }],
    expect(t) {
        t.exists(PLAIN); t.exists(LINK); t.exists('#lp >>> [part=table] >>> [part=table] >>> a[data-row-link]');
        t.ok(t.attr(PLAIN, 'href') === '#order-A-1', `the first row link goes to ${t.attr(PLAIN, 'href')}`);
        t.within(PLAIN, '#plain', 1); t.within(LINK, DT, 1);
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'focus') t.ringVisible(LINK);
    },
};
