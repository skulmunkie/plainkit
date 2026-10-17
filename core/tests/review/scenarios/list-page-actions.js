// pk-list-page header and toolbar slots (issue 1548): a callback button and an overflow pk-dropdown in the title bar (actions slot) and beside the search box (toolbar slot, after the config actions).
const LP = '#lp';
const TABLE = `${LP} >>> [part=table]`;
const ROWS = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, status: 'open' }));

export default {
    name: 'list-page-actions',
    issue: [1548],
    elements: ['list-page', 'dropdown'],
    html: `<pk-list-page id="lp">
        <pk-button slot="actions" id="sync" variant="primary">Sync</pk-button>
        <pk-dropdown slot="actions" id="more"><pk-button slot="trigger" id="more-trigger" aria-label="More actions">More</pk-button><pk-menu-item type="header">Orders</pk-menu-item><pk-menu-item>Import</pk-menu-item><pk-menu-item type="divider"></pk-menu-item><pk-menu-item>Export</pk-menu-item></pk-dropdown>
        <pk-dropdown slot="toolbar" id="tools"><pk-button slot="trigger" id="tools-trigger">Tools</pk-button><pk-menu-item>Archive</pk-menu-item></pk-dropdown>
    </pk-list-page>`,
    setup(frame) {
        const el = frame.querySelector(LP);
        el.config = { heading: 'Orders', columns: [{ key: 'po', label: 'PO' }, { key: 'status', label: 'Status' }], actions: [{ key: 'new', label: 'New order' }] };
        el.load = () => ({ rows: ROWS, total: 3 });
    },
    steps: [{ shot: 'resting' }, { click: '#more-trigger' }, { shot: 'menu' }, { key: 'Escape' }, { click: '#tools-trigger' }, { shot: 'toolbar-menu' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#sync', 'the Sync button in the title bar'); t.visible('#more-trigger', 'the More trigger in the title bar'); t.visible('#tools-trigger', 'the Tools trigger in the toolbar');
        t.within('#sync', LP, 1); t.within('#tools-trigger', LP, 1);
        t.noOverlap('#sync', '#more-trigger');
    },
};
