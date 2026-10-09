// pk-list-page with selectable (issue 873): a page selected shows the bulk bar with the config's bulkActions button beside the count; nothing overlaps and it fits the width.
const LP = '#lp';
const TABLE = `${LP} >>> [part=table] >>> [part=table]`;
const BAR = `${TABLE} >>> [part=bulk]`;
const COUNT = `${TABLE} >>> [part=bulk-count]`;
const ROWS = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners' }));

export default {
    name: 'list-page-select',
    issue: [873],
    elements: ['list-page'],
    html: '<pk-list-page id="lp"></pk-list-page>',
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = { heading: 'Orders', columns: [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer' }], pageSize: 5, selectable: true, bulkActions: [{ id: 'archive', label: 'Archive' }] };
        el.load = () => ({ rows: ROWS, total: 112 });
    },
    steps: [{ wait: 300 }, { shot: 'rows' }, { click: `${TABLE} >>> [data-select-all]` }, { wait: 300 }, { shot: 'selected' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'rows') t.hidden(BAR, 'the bulk bar with nothing selected');
        if (t.shot === 'selected') {
            t.visible(BAR, 'the bulk bar'); t.hasText(COUNT, '5 selected');
            t.visible(`${LP} >>> [part=bulk] pk-button`, 'the Archive action'); t.within(`${LP} >>> [part=bulk] pk-button`, BAR, 1); t.noOverlap(`${LP} >>> [part=bulk] pk-button`, COUNT);
            t.atLeast(`${LP} >>> [part=bulk] pk-button`, 'height', t.viewport.name === 'phone' ? 44 : 20);
        }
    },
};
