// pk-data-table multiselect filter (issue 1025): a checklist in the filter panel (the phone flyout too) with two values ticked.
const BOX = '#dt >>> [part=filters] fieldset pk-checkbox';
export default {
    name: 'data-table-multiselect',
    issue: [1025],
    elements: ['data-table', 'table-filters'],
    html: `<pk-data-table id="dt"></pk-data-table>`,
    setup(frame) {
        const el = frame.querySelector('#dt');
        Object.assign(el, { columns: [{ key: 'po', label: 'PO' }], caption: 'Orders', filters: [{ key: 'status', type: 'multiselect', label: 'Status', options: ['Open', 'Paid', 'Void', 'Refunded'] }] });
        el.load = () => ({ rows: [{ po: 'PO 1042' }], total: 1 });
    },
    steps: [{ wait: 300 }, { click: '#dt >>> [part=filters] >>> [part=trigger]' }, { wait: 200 }, { click: `${BOX}:nth-of-type(1)` }, { click: `${BOX}:nth-of-type(3)` }, { wait: 300 }, { shot: 'two-ticked' }],
    expect(t) {
        t.visible(BOX, 'the checklist');
    },
};
