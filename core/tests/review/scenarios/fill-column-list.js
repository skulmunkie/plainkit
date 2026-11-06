// #1675 layout 2: a fixed region above a scrolling list page. The list page fills pk-fill-column's rest region, so the header stays pinned and the pager visible.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-shell >>> [part=body]';

export default {
    name: 'fill-column-list',
    issue: [1675],
    elements: ['app-shell', 'fill-column', 'list-page'],
    html: `<pk-app-shell flush contain><span slot="header">Orders</span><pk-fill-column fixed="8rem"><pk-card slot="fixed" heading="Camera preview">Live preview</pk-card><pk-list-page></pk-list-page></pk-fill-column><span slot="footer">Acme Inc.</span></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector('pk-list-page');
        lp.config = { heading: 'Orders', columns, pageSize: 100, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'filled' }],
    expect(t) {
        const body = t.rect(BODY), col = t.rect('pk-fill-column'), card = t.rect('pk-card'), list = t.rect('pk-list-page');
        if (!body || !col || !card || !list) return t.ok(false, 'the body, the column, the card and the list page render');
        t.ok(col.height <= body.height + 1, `the column is ${Math.round(col.height)}px in a ${Math.round(body.height)}px body (#1675)`);
        t.ok(card.height >= 60, `the fixed card keeps its height (${Math.round(card.height)}px), it is not squeezed (#1675)`);
        t.ok(list.y >= card.y + card.height - 1, 'the list page sits below the card, not over it (#1675)');
        t.ok(list.y + list.height <= body.y + body.height + 1, `the list page (${Math.round(list.height)}px) ends inside the body: it fills the rest region, it does not grow to its rows (#1675)`);
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= body.y + body.height + 1, 'the pager stays inside the visible body (#1675)');
    },
};
