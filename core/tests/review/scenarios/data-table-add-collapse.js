// pk-data-table add button (issue 993): an icon plus label on desktop, icon only on a phone (the label stays the accessible name), at least a touch target.
const ADD = '#dt >>> [part=add]';
export default {
    name: 'data-table-add-collapse',
    issue: [993],
    elements: ['data-table'],
    html: `<pk-data-table id="dt"></pk-data-table>`,
    setup(frame) {
        const el = frame.querySelector('#dt');
        Object.assign(el, { columns: [{ key: 'po', label: 'PO' }], caption: 'Orders', addLabel: 'Add order' });
        el.load = () => ({ rows: [{ po: 'PO 1042' }], total: 1 });
    },
    steps: [{ wait: 200 }, { shot: 'rest' }],
    expect(t) {
        t.visible(ADD, 'the add button');
        const r = t.rect(ADD);
        if (t.viewport.name === 'phone') {
            if (r) t.ok(r.width <= 64, `on a phone the add button should be icon only, but it is ${Math.round(r.width)}px wide`);
            t.atLeast(ADD, 'height', 44);
        } else if (r) t.ok(r.width > 80, `on desktop the add button keeps icon and text, but it is ${Math.round(r.width)}px wide`);
    },
};
