// Row actions on pk-data-table (#2046): an icon action column at the inline end (a disabled action with its hint), a hover ring, the collapsed row menu open (four actions),
// the phone cards with the actions as the card footer, and right-to-left. Every shot is opened and read.
const A = '#a >>> [part=table]', B = '#b';
const ROWS = [{ id: 1, name: 'Order 1042', state: 'Open' }, { id: 2, name: 'Order 1043', state: 'Posted', _actions: { delete: { disabled: true, hint: 'Posted orders cannot be deleted' } } }, { id: 3, name: 'Order 1044', state: 'Open' }];
const THREE = [{ key: 'view', label: 'View', icon: 'search' }, { key: 'edit', label: 'Edit', icon: 'edit' }, { key: 'delete', label: 'Delete', icon: 'trash', variant: 'warn' }];

export default {
    name: 'row-actions',
    issue: [2046],
    elements: ['data-table'],
    html: `<div id="stage"><pk-data-table id="a" label="Orders" cards></pk-data-table><pk-data-table id="b" label="More orders" hide-search></pk-data-table></div>`,
    setup(frame) {
        const columns = [{ key: 'name', label: 'Name', title: true }, { key: 'state', label: 'State' }];
        for (const [sel, actions] of [['#a', THREE], ['#b', [...THREE, { key: 'copy', label: 'Copy', icon: 'copy' }]]]) {
            const el = frame.querySelector(sel);
            el.columns = columns; el.rowActions = actions; el.pageSizeOptions = null; el.load = () => ({ rows: ROWS, total: 3 });
        }
    },
    steps: [
        { waitFor: `${A} >>> td[data-pin]` }, { wait: 'settle' }, { shot: 'rest' },
        { hover: '#a >>> [part=table] pk-button' }, { shot: 'hover' },
        { click: '#b >>> [part=table] pk-dropdown pk-button' }, { wait: 'settle' }, { shot: 'menu' },
        { key: 'Escape' }, { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 'settle' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(`${A} >>> td[data-pin]`, 'the action cell');
        if (t.viewport.name !== 'phone') t.within(`${A} >>> tbody tr td[data-pin]`, `${A} >>> [part=scroll]`, 2);
    },
};
