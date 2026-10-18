// pk-app-frame busy overlay around the page slot (#1545) keeps a pinned-header list page filling the shell body (#1554) and covers the whole page region.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-frame >>> pk-app-shell >>> [part=body]';
const OVERLAY = 'pk-app-frame >>> pk-loading-overlay >>> [part=overlay]';
const LIST = 'pk-list-page';

export default {
    name: 'app-frame-busy-fill',
    issue: [1545],
    elements: ['app-frame', 'loading-overlay', 'list-page'],
    html: `<pk-app-frame brand="Acme" busy busy-label="Saving…"><pk-list-page></pk-list-page></pk-app-frame>`,
    setup(frame) {
        const lp = frame.querySelector(LIST);
        lp.config = { heading: 'Orders', columns, pageSize: 100, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 600 }, { shot: 'busy' }],
    expect(t) {
        const body = t.rect(BODY), list = t.rect(LIST), ov = t.rect(OVERLAY);
        if (!body || !list || !ov) return t.ok(false, 'the shell body, the overlay and the list page all render');
        t.ok(list.height <= body.height + 1, `the list page is ${Math.round(list.height)}px tall inside a ${Math.round(body.height)}px body: the busy wrapper must not break the fill (#1554)`);
        t.ok(ov.height >= body.height - 80, `the busy overlay is ${Math.round(ov.height)}px of the ${Math.round(body.height)}px body: it covers the page region`);
        const pager = t.rect('pk-list-page >>> pk-data-table >>> pk-pagination');
        t.ok(!!pager && pager.y + pager.height <= body.y + body.height + 1, 'the pager stays inside the visible body while the rows scroll');
    },
};
