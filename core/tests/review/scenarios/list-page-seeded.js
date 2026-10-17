// pk-list-page started from a deep link (issue 1550): the search box, the filter field and the filter count show the seeded query, and the pager sits on the seeded page.
const LP = '#lp';
const TABLE = `${LP} >>> [part=table]`;
const ROWS = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, status: 'open' }));

export default {
    name: 'list-page-seeded',
    issue: [1550],
    elements: ['list-page'],
    html: '<pk-list-page id="lp"></pk-list-page>',
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = { heading: 'Orders', columns: [{ key: 'po', label: 'PO', sortable: true }, { key: 'status', label: 'Status' }], filters: [{ key: 'status', type: 'select', label: 'Status', options: ['open', 'done'] }],
            search: 'PO', sort: 'po', sortDir: 'descending', startPage: 2, pageSize: 3, filterValues: { status: 'open' } };
        el.load = () => ({ rows: ROWS, total: 9 });
    },
    steps: [{ shot: 'seeded' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${TABLE} >>> [part=pagination]`, 'the pager');
    },
};
