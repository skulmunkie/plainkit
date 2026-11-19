// pk-list-page with toolbarInHeader and actionsOverflow (issue 1956): the one-row mode keeps what pk-page-header gives. On a phone the actions fold into one menu beside the search box,
// on a desktop they stay buttons, and after the page scrolls 800px the toolbar row is still pinned at the top. Run it right to left too: the menu opens from the inline end.
const LP = '#lp';
const TABLE = `${LP} >>> [part=table]`;
const BAR = `${TABLE} >>> [part=toolbar]`;
const SEARCH = `${TABLE} >>> [part=filters] >>> [part=search]`;
const ROWS = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, po: `PO ${1042 + i}`, customer: 'Acme Hardware and Fasteners' }));

export default {
    name: 'list-page-toolbar-overflow',
    issue: [1956],
    elements: ['list-page', 'data-table'],
    html: `<div id="stage"><pk-list-page id="lp"></pk-list-page></div>`,
    setup(frame) {
        const el = frame.querySelector(LP), stage = frame.querySelector('#stage');
        Object.assign(stage.style, { blockSize: '560px', overflowY: 'auto' }); // CSSOM, not a style attribute: the page scrolls inside this box, and the sticky row is measured against it
        el.config = {
            toolbarInHeader: true, actionsOverflow: 'phone', heading: 'All orders', breadcrumb: [{ label: 'Sales', href: '#' }, { label: 'Orders' }],
            actions: [{ key: 'new', label: 'New order', icon: 'plus', variant: 'primary' }, { key: 'export', label: 'Export', icon: 'download' }],
            columns: [{ key: 'po', label: 'PO' }, { key: 'customer', label: 'Customer' }], pageSize: 40,
        };
        el.load = () => ({ rows: ROWS, total: 40 });
    },
    steps: [
        { waitFor: `${TABLE} >>> [part=table]` }, { wait: 'settle' }, { shot: 'top' },
        { click: `${LP} >>> pk-dropdown pk-button`, on: ['phone'] }, { wait: 'settle' }, { shot: 'menu-open', on: ['phone'] }, { key: 'Escape', on: ['phone'] },
        { scroll: '#stage', to: 800 }, { wait: 'settle' }, { shot: 'scrolled' },
        { scroll: '#stage', to: 0 }, { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 'settle' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (t.shot === 'scrolled') { const r = t.rect(BAR); const top = t.rect('#stage').y; t.ok(Math.abs(r.y - top) <= 2, `the toolbar row is pinned at the top after scrolling (${Math.round(r.y - top)} px below the box top)`, 'give the toolbar row position: sticky'); t.inViewport(SEARCH); return; }
        t.visible(BAR, 'the toolbar row'); t.fitsWidth(BAR);
        if (t.viewport.name === 'phone') { t.visible(`${LP} >>> pk-dropdown`, 'the overflow trigger'); t.inViewport(`${LP} >>> pk-dropdown`); }
        else t.hidden(`${LP} >>> pk-dropdown`, 'the overflow trigger');
    },
};
