// pk-data-table (issue 1006): 120 rows in a container of fixed height. The column header stays at the top, only the rows scroll, and the pager stays in view
// at the bottom of the container, on a phone and on a desktop; after a scroll the header and the pager have not moved.
const DT = '#dt';
const TABLE = `${DT} >>> [part=table]`;
const SCROLL = `${TABLE} >>> [part=scroll]`;
const HEAD = `${TABLE} >>> thead th`;
const PAGER = `${DT} >>> [part=pagination]`;
const ROWS = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, po: `PO ${1000 + i}`, customer: 'Acme Hardware and Fasteners', total: `$${(i + 1) * 12}.00` }));

export default {
    name: 'data-table-pinned',
    issue: [1006],
    elements: ['data-table'],
    html: `<div id="box"><pk-data-table id="dt" sticky-header selectable></pk-data-table></div>`,
    setup(frame) {
        const el = frame.querySelector(DT), box = frame.querySelector("#box");
        Object.assign(box.style, { display: "flex", flexDirection: "column", blockSize: "70vh" });
        Object.assign(el, { columns: [{ key: 'po', label: 'PO', sortable: true }, { key: 'customer', label: 'Customer', hidePhone: true }, { key: 'total', label: 'Total', type: 'number' }], pageSize: 100, pageSizeOptions: [25, 100], caption: 'Orders' });
        el.load = () => ({ rows: ROWS.slice(0, 100), total: 120 });
    },
    steps: [{ wait: 400 }, { shot: 'top' }, { scroll: SCROLL, to: 1500 }, { wait: 200 }, { shot: 'scrolled' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.scrolls(SCROLL);
        t.inViewport(PAGER); t.inViewport(HEAD);
        t.within(PAGER, '#box', 1); t.within(HEAD, '#box', 1);
        t.noOverlap(PAGER, SCROLL);
        if (t.shot === "scrolled") t.ok(t.metric(SCROLL, "scrollTop") >= 100, "the rows scrolled");
    },
};
