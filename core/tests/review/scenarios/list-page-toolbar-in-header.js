// pk-list-page with config.toolbarInHeader (issue 1723): the breadcrumb and heading share the toolbar row with the search box, Filters and the action; on a phone they wrap, nothing clipped.
const LP = '#lp';
const BAR = `${LP} >>> [part=table] >>> [part=toolbar]`;
const ROWS = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners' }));

export default {
    name: 'list-page-toolbar-in-header',
    issue: [1723],
    elements: ['list-page', 'data-table'],
    html: `<pk-list-page id="lp"></pk-list-page>`,
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = {
            toolbarInHeader: true, heading: 'All orders', breadcrumb: [{ label: 'Sales', href: '#' }, { label: 'Orders' }], actions: [{ label: 'New order', variant: 'primary' }],
            columns: [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer' }],
            filters: [{ key: 'channel', type: 'select', label: 'Channel', options: ['ebay', 'shopify'] }],
        };
        el.load = () => ({ rows: ROWS, total: 4 });
    },
    steps: [{ waitFor: `${LP} >>> [part=table] >>> [part=table]` }, { shot: 'row' }, { click: `${LP} >>> [part=table] >>> [part=filters] >>> [part=trigger]`, on: ['desktop'] }, { wait: 'settle' }, { shot: 'panel-open', on: ['desktop'] }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(BAR, 'the toolbar row'); t.fitsWidth(BAR);
        t.visible(`${LP} >>> [part=table] >>> [part=filters] >>> [part=search]`, 'the search box'); t.inViewport(`${LP} >>> [part=table] >>> [part=filters] >>> [part=search]`);
    },
};
