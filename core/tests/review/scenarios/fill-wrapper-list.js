// #1675 layout 1: a list page inside a wrapper in a pk-app-shell[contain] body. A bare div does not fill (the list grows to its rows, the pager leaves the screen); pk-stack[fill] is the sanctioned wrapper.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-shell >>> [part=body]';

export default {
    name: 'fill-wrapper-list',
    issue: [1675],
    elements: ['app-shell', 'list-page', 'stack'],
    html: `<pk-app-shell flush contain><span slot="header">Orders</span><pk-stack fill><pk-list-page></pk-list-page></pk-stack><span slot="footer">Acme Inc.</span></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector('pk-list-page');
        lp.config = { heading: 'Orders', columns, pageSize: 100, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 300 }, { shot: 'filled' }],
    expect(t) {
        const body = t.rect(BODY), wrap = t.rect('pk-stack'), list = t.rect('pk-list-page');
        if (!body || !wrap || !list) return t.ok(false, 'the body, the wrapper and the list page render');
        t.ok(wrap.height <= body.height + 1, `the wrapper is ${Math.round(wrap.height)}px in a ${Math.round(body.height)}px body (#1675)`);
        t.ok(list.height <= body.height + 1, `the list page is ${Math.round(list.height)}px inside the wrapper in a ${Math.round(body.height)}px body: it must fill it, not grow to its rows (#1675)`);
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= body.y + body.height + 1, 'the pager stays inside the visible body (#1675)');
    },
};
