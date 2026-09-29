// pk-app-bar-search inside the pk-app-shell header (issues 295, 280, 267): centred in the free space of the header at desktop width, an icon button that
// expands over the header row on a phone, and the results panel open with a group heading, a group note row, a footer slot and a popup wider than
// a narrow field.
const ITEMS = [
    { id: 'p1', label: 'Chai latte mix', group: 'Products', sub: 'SKU 1042', badge: 'In stock' },
    { id: 'p2', label: 'Chamomile tea', group: 'Products', sub: 'SKU 1043' },
    { label: '+12 more products', group: 'Products' },
    { id: 'o1', label: 'Order 5531 for Chandra Supply', group: 'Orders', sub: 'Shipped 3 May' },
];
const HEADER = 'pk-app-shell >>> [part=header]';
const BOX = '#q >>> [part=box]';
const POP = '#q >>> [part=popup]';
// group/note styling (317), the centring with a title present (318) and the contrast of the sub text and badge (319) are all fixed;
// contrast is reported by the audit.

export default {
    name: 'app-bar-search',
    issue: [295, 280, 267],
    elements: ['app-bar-search', 'app-shell'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" label="Main"><a slot="brand" href="#">Acme</a><pk-nav-item href="#" current>Orders</pk-nav-item><pk-nav-item href="#">Products</pk-nav-item></pk-side-nav>
<pk-button slot="header" id="menu" data-nav-toggle variant="ghost" size="mini" icon aria-label="Menu"><pk-icon name="menu"></pk-icon></pk-button>
<pk-app-bar-search slot="header" id="q" placeholder="Search products and orders"><a slot="footer" href="#all">Full search</a></pk-app-bar-search>
<pk-button slot="header" id="account" variant="ghost">Account</pk-button>
<pk-stack><p>Recent orders appear here.</p></pk-stack>
</pk-app-shell>`,
    steps: [
        { shot: 'rest' },
        { click: '#q >>> [part=expand]', on: ['phone'] }, { shot: 'expanded', on: ['phone'] },
        { set: '#q', prop: 'items', value: ITEMS },
        { click: '#q >>> [part=control]', on: ['desktop'] },
        { type: 'cha' },
        { wait: 400 },
        { shot: 'results' },
    ],
    expect(t) {
        const desktop = t.viewport.name === 'desktop';
        if (t.shot === 'rest') {
            t.visible('#q');
            if (desktop) {
                t.visible(BOX, 'the search field');
                t.hidden('#q >>> [part=expand]', 'the icon button (only the phone has it)');
                // Centred in the free space between the menu button and the account button (issues 295, 318): within 24px.
                const menu = t.rect('#menu'), account = t.rect('#account'), box = t.rect(BOX);
                if (menu && account && box) t.ok(Math.abs(box.cx - (menu.right + account.x) / 2) <= 24, `with a page title in the header the field is centred at x=${Math.round(box.cx)}, but the free space between the menu and the account button is centred at x=${Math.round((menu.right + account.x) / 2)}`);
                t.noOverlap(BOX, '#account');
            } else {
                t.visible('#q >>> [part=expand]', 'the search icon button');
                t.hidden(BOX, 'the field (collapsed to an icon)');
                t.atLeast('#q >>> [part=expand]', 'width', 44); t.atLeast('#q >>> [part=expand]', 'height', 44);
            }
        }
        if (t.shot === 'expanded') {
            t.visible(BOX, 'the expanded field');
            const h = t.rect(HEADER), b = t.rect(BOX);
            if (h && b) t.ok(b.width >= h.width * 0.85 && b.y >= h.y - 1, `the expanded field (${Math.round(b.width)}px wide, from y=${Math.round(b.y)}) does not cover the ${Math.round(h.width)}px header row`);
        }
        if (t.shot === 'results') {
            t.visible(POP, 'the results panel');
            t.inViewport(POP);
            t.hasText(POP, 'Chai latte mix');
            t.hasText(POP, '+12 more products');
            t.visible('#q >>> [part=footer]', 'the footer slot');
            t.within('#q >>> [part=footer]', POP);
            const pop = t.rect(POP), group = t.rect('#q >>> [part=group]'), note = t.rect('#q >>> [part=note]');
            if (pop && group) t.ok(group.x - pop.x >= 8, `the group heading starts ${Math.round(group.x - pop.x)}px from the panel's edge (rows are indented 12px)`);
            if (pop && note) t.ok(note.x - pop.x >= 8, `the note row starts ${Math.round(note.x - pop.x)}px from the panel's edge`);
            t.ok(t.rect(POP)?.width >= (desktop ? 383 : 300), `the results panel is ${Math.round(t.rect(POP)?.width ?? 0)}px wide, too narrow to read`);
        }
    },
};
