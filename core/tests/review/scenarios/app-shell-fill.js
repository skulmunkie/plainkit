// pk-app-shell body as a flex column of definite height (issue 1551): a list page with a pinned header fills it, the page does not grow to its content, and only the rows scroll.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-shell >>> [part=body]';
const LIST = 'pk-list-page';

export default {
    name: 'app-shell-fill',
    issue: [1551],
    elements: ['app-shell', 'list-page'],
    html: `<pk-app-shell flush><span slot="header">Orders</span><pk-list-page></pk-list-page><span slot="footer">Acme Inc.</span></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector(LIST);
        lp.config = { heading: 'Orders', columns, pageSize: 100, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'filled' }],
    expect(t) {
        const body = t.rect(BODY), list = t.rect(LIST);
        if (!body || !list) return t.ok(false, 'the shell body and the list page both render');
        t.ok(list.height <= body.height + 1, `the list page is ${Math.round(list.height)}px tall inside a ${Math.round(body.height)}px body: it must fill it, not grow to its content (issue 1551)`);
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= body.y + body.height + 1, 'the pager stays inside the visible body while the 120 rows scroll above it (issue 1551)');
        t.styleIs(BODY, 'display', 'flex');
        t.styleIs(BODY, 'flex-direction', 'column');
    },
};
