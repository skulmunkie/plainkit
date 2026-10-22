// A before-list region much taller than the window (issue 1726), drawn the way the Blazor PkListPage wraps it (<span slot="before-list" class="u-contents">): the region gives way and scrolls in its own box,
// the rows keep a usable height and the pager stays in view.
const columns = [{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }];
const rows = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` }));
const BODY = 'pk-app-shell >>> [part=body]';
const BEFORE = 'pk-list-page >>> [part=before]';
const SCROLL = 'pk-list-page >>> pk-data-table >>> pk-table >>> [part=scroll]';
const PAGER = 'pk-list-page >>> pk-data-table >>> pk-pagination';
const lines = Array.from({ length: 22 }, (_, i) => `<p>Summary line ${i + 1}: totals, tax and the notes the reader should see before the list.</p>`).join('');

export default {
    name: 'list-page-before-tall',
    issue: [1726],
    elements: ['list-page'],
    html: `<pk-app-shell contain><span slot="header">Orders</span><pk-list-page><span slot="before-list" class="u-contents"><pk-card heading="Summary">${lines}</pk-card></span></pk-list-page></pk-app-shell>`,
    setup(frame) {
        const lp = frame.querySelector('pk-list-page');
        lp.config = { heading: 'Orders', columns, pageSize: 50, stickyHeader: true };
        lp.load = () => ({ rows, total: rows.length });
    },
    steps: [{ wait: 'settle' }, { wait: 400 }, { shot: 'resting' }, { scroll: BEFORE, to: 200 }, { wait: 200 }, { shot: 'before-scrolled' }],
    expect(t) {
        const body = t.rect(BODY), before = t.rect(BEFORE), scroll = t.rect(SCROLL), pager = t.rect(PAGER);
        if (!body || !before || !scroll || !pager) return t.ok(false, 'the body, the before region, the rows and the pager all render');
        t.ok(scroll.height >= 120, `the rows get ${Math.round(scroll.height)}px (at least three rows)`);
        t.inViewport(PAGER);
        t.noOverlap(BEFORE, SCROLL);
        t.within(BEFORE, BODY);
        t.ok(before.y + before.height <= scroll.y + 1, 'the before region ends above the rows');
    },
};
