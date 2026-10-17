// pk-app-shell fill (issue 1551): a pk-list-page with sticky-header in a fill shell keeps its toolbar, column header and pager in view while the rows scroll; nothing scrolls but the rows.
const BODY = 'pk-app-shell >>> [part=body]';
const columns = JSON.stringify([{ key: 'sku', label: 'SKU' }, { key: 'title', label: 'Title' }]);

export default {
    name: 'app-shell-fill',
    issue: [1551],
    elements: ['app-shell'],
    html: `<pk-app-shell fill><span slot="header">Orders</span><div id="wrap"><pk-list-page id="list" config='{"columns":${columns},"stickyHeader":true,"pageSize":50,"heading":"Orders"}'></pk-list-page></div></pk-app-shell>`,
    setup(frame) {
        const list = frame.querySelector('#list');
        list.load = async () => ({ rows: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, sku: `AC-${1000 + i}`, title: `Widget number ${i + 1}` })), total: 50 });
        list.refresh?.();
    },
    steps: [{ wait: 'settle' }, { wait: 600 }, { shot: 'top' }, { scroll: 'pk-list-page >>> pk-data-table >>> pk-table >>> [part=scroll]', to: 600 }, { wait: 'settle' }, { shot: 'scrolled' }],
    expect(t) {
        t.within('pk-list-page', BODY);
        t.inViewport('pk-list-page >>> pk-data-table >>> pk-table >>> thead th');
        t.inViewport('pk-list-page >>> pk-data-table >>> pk-pagination');
    },
};
