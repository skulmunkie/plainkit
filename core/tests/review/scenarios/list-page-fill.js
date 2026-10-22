// Full-height list page in pk-app-shell[contain]: title bar, before-list alert, bulk bar, column header and pager stay put while only the rows scroll; the pager sits at the shell body's bottom.
const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const LIST = 'pk-list-page';
const TABLE = 'pk-list-page >>> pk-data-table >>> pk-table';
const SCROLL = `${TABLE} >>> [part=scroll]`;
const BODY = 'pk-app-shell >>> [part=body]';
const PAGER = 'pk-list-page >>> pk-data-table >>> pk-pagination';

export default {
    name: 'list-page-fill',
    issue: [1675, 1705, 1711],
    elements: ['app-shell', 'list-page', 'loading-overlay'],
    html: `<pk-app-shell contain><span slot="header">Orders</span><pk-list-page><pk-alert slot="before-list" kind="info">Prices include tax.</pk-alert></pk-list-page></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector(LIST);
        lp.config = {
            heading: 'Orders', breadcrumb: [{ label: 'Sales', href: '#' }, { label: 'Orders' }], stickyHeader: true, selectable: true, pageSize: 50,
            columns: [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }], bulkActions: [{ id: 'archive', label: 'Archive' }],
        };
        lp.load = () => ({ rows, total: 200 });
    },
    steps: [
        { wait: 'settle' }, { wait: 400 },
        { click: `${TABLE} >>> [data-select]` }, { wait: 300 },
        { shot: 'top' },
        { scroll: SCROLL, to: 400 }, { wait: 300 },
        { shot: 'scrolled' },
    ],
    expect(t) {
        const body = t.rect(BODY), pager = t.rect(PAGER), scroll = t.rect(SCROLL), alert = t.rect('pk-list-page > pk-alert');
        if (!body || !pager || !scroll || !alert) return t.ok(false, 'the shell body, the alert, the table scroll part and the pager all render');
        t.inViewport(PAGER);
        t.inViewport('pk-list-page > pk-alert');
        t.noOverlap('pk-list-page > pk-alert', SCROLL);
        t.noOverlap(SCROLL, PAGER);
        t.within(PAGER, BODY);
        t.within('pk-list-page > pk-alert', BODY);
        const gap = body.y + body.height - parseFloat(t.style(BODY, 'padding-bottom')) - (pager.y + pager.height);
        t.ok(gap <= 1, `the pager ends ${Math.round(gap)}px above the shell body content bottom`);
        t.ok(scroll.height > 150, `the rows get ${Math.round(scroll.height)}px of the page`);
    },
};
