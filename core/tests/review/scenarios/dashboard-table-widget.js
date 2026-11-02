// pk-dashboard-page table widget (#1844): a stat beside a table widget with columns, rows and a result caption, and a table that fails once. The table card spans the whole row
// at desktop and phone width with nothing overflowing; the failed one shows its error with Retry, and Retry brings its table in.
const DP = 'pk-dashboard-page';
const CARD = key => `${DP} >>> pk-card[data-key=${key}]`;
const COLUMNS = [{ key: 'no', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', align: 'end' }];
const ROWS = [
    { id: 1, no: 'SO-1001', customer: 'Northwind Traders', status: 'Open', total: '$1,204.50' },
    { id: 2, no: 'SO-1002', customer: 'Contoso Ltd', status: 'Packed', total: '$318.00' },
    { id: 3, no: 'SO-1003', customer: 'Fabrikam Industries', status: 'Open', total: '$9,870.25' },
];

export default {
    name: 'dashboard-table-widget',
    issue: 1844,
    elements: ['dashboard-page', 'card', 'stat', 'table', 'alert', 'button'],
    html: '<pk-dashboard-page></pk-dashboard-page>',
    setup(frame) {
        const el = frame.querySelector(DP);
        el.config = {
            heading: 'Orders',
            widgets: [
                { key: 'open', label: 'Open orders', kind: 'stat' },
                { key: 'list', label: 'Recent orders', kind: 'table' },
                { key: 'late', label: 'Late deliveries', kind: 'table' },
            ],
        };
        let attempts = 0;
        el.load = key => {
            if (key === 'late' && ++attempts === 1) return Promise.reject(new Error('The deliveries feed did not answer.'));
            if (key === 'open') return Promise.resolve({ value: '42', subtext: 'across 3 warehouses' });
            return Promise.resolve({ columns: COLUMNS, rows: ROWS, caption: key === 'list' ? 'Orders placed this week' : 'Late deliveries' });
        };
    },
    steps: [{ waitFor: `${CARD('list')} pk-table` }, { wait: 400 }, { shot: 'loaded' }, { click: `${CARD('late')} pk-button` }, { waitFor: `${CARD('late')} pk-table` }, { wait: 300 }, { shot: 'retried' }],
    expect(t) {
        t.exists(`${CARD('list')} pk-table`);
        t.ok(t.attr(CARD('list'), 'data-kind') === 'table', 'data-kind is table');
        const card = t.rect(CARD('list')), grid = t.rect(`${DP} >>> [part=grid]`);
        t.ok(card && grid && Math.abs(card.width - grid.width) <= 1, 'the table card spans the whole grid row');
        t.within(CARD('list'), DP);
        if (t.shot === 'loaded') t.exists(`${CARD('late')} pk-alert`);
        if (t.shot === 'retried') t.exists(`${CARD('late')} pk-table`);
    },
};
