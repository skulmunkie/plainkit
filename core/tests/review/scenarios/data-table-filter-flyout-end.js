// pk-data-table filterPanel "flyout-end" (#2039): the open filter panel slides in from the inline-end edge of the table area, under the toolbar actions, which stay on the toolbar row.
const T = '#dt >>> [part=filters] >>> [part=trigger]', PANEL = '#dt >>> [part=filters] >>> [part=panel]', AREA = '#dt >>> [part=area]';
export default {
    name: 'data-table-filter-flyout-end',
    issue: [2039],
    elements: ['data-table', 'table-filters'],
    html: '<div id="stage"><pk-data-table id="dt"></pk-data-table></div>',
    setup(frame) {
        const el = frame.querySelector('#dt');
        Object.assign(el, {
            columns: [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }], caption: 'Orders', filterPanel: 'flyout-end',
            filters: Array.from({ length: 14 }, (_, i) => ({ key: 'f' + i, type: 'text', label: 'Field ' + (i + 1) })), pageSize: 8,
        });
        el.load = () => ({ rows: Array.from({ length: 8 }, (_, i) => ({ po: 'PO ' + (1040 + i), customer: 'Customer ' + (i + 1), status: i % 2 ? 'Open' : 'Shipped' })), total: 8 });
    },
    steps: [{ wait: 'settle' }, { shot: 'closed' }, { click: T }, { wait: 400 }, { shot: 'open' }, { key: 'Escape' }, { wait: 'settle' }, { shot: 'escaped' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { click: T }, { wait: 400 }, { shot: 'rtl-open' }],
    expect(t) {
        const rtl = t.shot === 'rtl-open';
        if (t.shot !== 'open' && !rtl) { t.hidden(PANEL, `${t.shot}: the panel`); return; }
        const p = t.rect(PANEL), a = t.rect(AREA);
        if (!p || !a) return t.ok(false, 'the panel and the area render');
        t.ok(p.y >= a.y - 1 && p.y + p.height <= a.y + a.height + 1, 'the panel stays inside the table area');
        t.ok(rtl ? Math.abs(p.x - a.x) <= 1 : Math.abs((p.x + p.width) - (a.x + a.width)) <= 1, 'the panel ends at the area inline-end edge');
        t.visible('#dt >>> [part=filters] >>> [part=clear]', 'Clear filters');
        t.visible('#dt >>> [part=filters] >>> [part=close]', 'Close');
    },
};
