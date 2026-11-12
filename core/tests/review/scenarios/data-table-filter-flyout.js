// pk-data-table filterPanel "flyout" (#1939): the open filter panel slides in from the inline-start edge over the table area, the rows stay where they were and
// usable beside it, the panel never outgrows the area (its body scrolls, Close and Clear filters stay in view), and Escape closes it.
const T = '#dt >>> [part=filters] >>> [part=trigger]', PANEL = '#dt >>> [part=filters] >>> [part=panel]', AREA = '#dt >>> [part=area]';
export default {
    name: 'data-table-filter-flyout',
    issue: [1939],
    elements: ['data-table', 'table-filters'],
    html: '<pk-data-table id="dt"></pk-data-table>',
    setup(frame) {
        const el = frame.querySelector('#dt');
        Object.assign(el, {
            columns: [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }], caption: 'Orders', filterPanel: 'flyout',
            filters: Array.from({ length: 14 }, (_, i) => ({ key: 'f' + i, type: 'text', label: 'Field ' + (i + 1) })), pageSize: 8,
        });
        el.load = () => ({ rows: Array.from({ length: 8 }, (_, i) => ({ po: 'PO ' + (1040 + i), customer: 'Customer ' + (i + 1), status: i % 2 ? 'Open' : 'Shipped' })), total: 8 });
    },
    steps: [{ wait: 'settle' }, { shot: 'closed' }, { click: T }, { wait: 400 }, { shot: 'open' }, { key: 'Escape' }, { wait: 'settle' }, { shot: 'escaped' }],
    expect(t) {
        const open = t.shot === 'open';
        if (!open) { t.hidden(PANEL, `${t.shot}: the panel`); return; }
        const p = t.rect(PANEL), a = t.rect(AREA);
        if (!p || !a) return t.ok(false, 'the panel and the area render');
        t.ok(p.y >= a.y - 1 && p.y + p.height <= a.y + a.height + 1, `the panel stays inside the table area (${Math.round(p.y)}-${Math.round(p.y + p.height)} in ${Math.round(a.y)}-${Math.round(a.y + a.height)})`);
        t.ok(Math.abs(p.x - a.x) <= 1, 'the panel starts at the area inline-start edge');
        t.visible('#dt >>> [part=filters] >>> [part=clear]', 'Clear filters');
        t.visible('#dt >>> [part=filters] >>> [part=close]', 'Close');
    },
};
