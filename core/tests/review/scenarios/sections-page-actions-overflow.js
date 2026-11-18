// pk-sections-page (#2010): a read-mostly record page. Desktop: tabs docked in the header, a primary action and the actions in the title bar, the first section with its summary card beside it.
// Phone: the actions fold into one overflow button and its menu (a pk-dropdown among them is flattened into it, #1737), the tabs stay docked, one section at a time. States: resting, a section chosen,
// the overflow menu open (phone), right-to-left.
const SP = '#sp';
const HEADER = `${SP} >>> pk-page-shell >>> pk-page-header`;
const TABS = `${SP} >>> [part=tabs]`;

export default {
    name: 'sections-page-actions-overflow',
    issue: [2010],
    elements: ['sections-page', 'detail-layout', 'page-header', 'tabs'],
    html: `<div id="wrap" class="rv-page"><pk-sections-page id="sp"><pk-badge slot="badges" variant="ok">Active</pk-badge>
<pk-card id="d" slot="section-details" heading="Details"><pk-text>Blue mug, 350 ml, glazed ceramic. Dishwasher safe.</pk-text></pk-card>
<pk-card id="ds" slot="side-details" heading="Status"><pk-text>12 on hand, reorder at 5.</pk-text></pk-card>
<pk-card id="o" slot="section-orders" heading="Orders"><pk-text>Three open orders.</pk-text></pk-card>
<pk-dropdown slot="actions"><pk-button slot="trigger" variant="ghost">More</pk-button><pk-menu-item>Duplicate</pk-menu-item><pk-menu-item>Export</pk-menu-item></pk-dropdown>
</pk-sections-page></div>`,
    setup(frame) {
        frame.querySelector(SP).config = {
            heading: 'Blue mug', breadcrumb: [{ label: 'Products', href: '#' }, { label: 'Blue mug' }], actionsOverflow: 'phone',
            sections: [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders', count: 3 }],
            actions: [{ key: 'edit', label: 'Edit', variant: 'primary' }, { key: 'archive', label: 'Archive', variant: 'ghost' }],
        };
    },
    steps: [
        { wait: 'settle' }, { wait: 400 }, { shot: 'resting' },
        { click: `${TABS} pk-tab[value=orders]` }, { wait: 300 }, { shot: 'orders' },
        { click: `${HEADER} >>> [part~=overflow-button]`, on: ['phone'] }, { wait: 300 }, { shot: 'menu-open', on: ['phone'] },
        { key: 'Escape', on: ['phone'] }, { set: '#wrap', attr: 'dir', value: 'rtl' }, { wait: 300 }, { shot: 'rtl' },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible(TABS, 'the docked section tabs');
        if (t.shot === 'resting') {
            t.visible('#d', 'the Details section'); t.hidden('#o', 'the Orders section');
            if (!phone) { t.visible('#ds', 'the summary card'); t.noOverlap('#d', '#ds', 'the main column and the summary card'); }
        } else if (t.shot === 'orders') {
            t.visible('#o', 'the Orders section after its tab is chosen');
            t.within('#o', '#sp');
        }
    },
};
