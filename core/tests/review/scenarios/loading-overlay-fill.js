// pk-loading-overlay[fill] around a pk-list-page in a definite-height flex column (issue 1705): the header row and pager stay pinned, only the rows scroll, the page does not grow to its content.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const COL = 'pk-app-shell >>> [part=body]';

export default {
    name: 'loading-overlay-fill',
    issue: [1705],
    elements: ['loading-overlay', 'list-page'],
    html: `<pk-app-shell flush><span slot="header">Orders</span><pk-loading-overlay fill label="Loading orders"><pk-list-page></pk-list-page></pk-loading-overlay><span slot="footer">Acme Inc.</span></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector('pk-list-page');
        lp.config = { heading: 'Orders', columns, pageSize: 50, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'resting' }, { set: 'pk-loading-overlay', prop: 'busy', value: true }, { wait: 200 }, { shot: 'busy' }],
    expect(t) {
        const col = t.rect(COL), list = t.rect('pk-list-page'), ov = t.rect('pk-loading-overlay');
        if (!col || !list || !ov) return t.ok(false, 'the column, overlay and list page all render');
        t.ok(ov.height <= col.height + 1, `the overlay is ${Math.round(ov.height)}px tall in a ${Math.round(col.height)}px column: [fill] must pass the height down (issue 1705)`);
        t.ok(list.height <= col.height + 1, `the list page is ${Math.round(list.height)}px tall in a ${Math.round(col.height)}px column: it must not grow to its 50 rows (issue 1705)`);
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= col.y + col.height + 1, 'the pager stays inside the visible column while the rows scroll above it (issue 1705)');
    },
};
