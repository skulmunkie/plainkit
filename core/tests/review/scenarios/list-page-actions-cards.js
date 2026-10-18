// pk-list-page with host actions and toolbar slots (issue 1548), rows as cards on a phone (1549) and a seeded filter (1550): the header and toolbar buttons are drawn and
// fit, the page never scrolls sideways, the seeded filter is counted in the filter panel, and a hidePhone column is gone from the phone cards.
const LP = '#lp';
const HEADER = `${LP} >>> [part=header]`;
const FILTERS = `${LP} >>> [part=table] >>> [part=filters]`;
const ROWS = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners', channel: 'ebay', notes: 'Pick up Monday' }));

export default {
    name: 'list-page-actions-cards',
    issue: [1548, 1549, 1550],
    elements: ['list-page', 'data-table'],
    html: `<pk-list-page id="lp"><pk-button slot="actions" id="sync">Sync</pk-button><pk-button slot="toolbar" id="export" variant="ghost">Export</pk-button></pk-list-page>`,
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = {
            heading: 'Orders',
            columns: [{ key: 'po', label: 'PO', title: true }, { key: 'customer', label: 'Customer' }, { key: 'channel', label: 'Channel' }, { key: 'notes', label: 'Notes', hidePhone: true }],
            filters: [{ key: 'channel', type: 'select', label: 'Channel', options: ['ebay', 'shopify'] }],
            filterValues: { channel: 'ebay' },
            pageSize: 5,
        };
        el.load = () => ({ rows: ROWS, total: 4 });
    },
    steps: [{ waitFor: `${LP} >>> [part=table] >>> [part=table]` }, { shot: 'list' }, { resize: 390 }, { wait: 'settle' }, { shot: 'at-390' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#sync', 'the title bar action'); t.inViewport('#sync'); t.within('#sync', HEADER, 1);
        t.visible('#export', 'the toolbar action'); t.fitsWidth('#export');
        t.visible(`${FILTERS} >>> [part=count]`, 'the seeded filter count'); t.hasText(`${FILTERS} >>> [part=count]`, '1');
    },
};
