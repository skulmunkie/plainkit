// pk-side-nav as the collapsed icon rail (issues 297, 299): the brand wrapped the way the Blazor wrapper renders it (<span slot="brand" class="u-contents">)
// stays hidden, the collapse caret stays visible, and a branch opens a flyout whose children keep their labels and which names its branch.
// The rail exists above the drawer breakpoint only, so this scenario is desktop only.
const NAV = '#nav';
const SUB = '#products >>> [part=sub]';

export default {
    name: 'side-nav',
    issue: [297, 299, 325],
    elements: ['side-nav', 'nav-item'],
    viewports: ['desktop'],
    html: `<pk-app-shell>
<pk-side-nav slot="nav" id="nav" label="Main" collapsed>
<span slot="brand" class="u-contents"><a id="brand" href="#">Acme Cloud</a></span>
<pk-nav-item id="dash" href="#" current><pk-icon slot="icon" name="dashboard"></pk-icon>Dashboard</pk-nav-item>
<pk-nav-item id="orders" href="#"><pk-icon slot="icon" name="orders"></pk-icon><span slot="badge">12</span>Orders</pk-nav-item>
<pk-nav-item id="products"><pk-icon slot="icon" name="products"></pk-icon>Products
<pk-nav-item id="all" slot="children" href="#">All products</pk-nav-item>
<pk-nav-item id="drafts" slot="children" href="#">Drafts and imports</pk-nav-item>
</pk-nav-item>
<pk-nav-item id="settings" slot="footer" href="#"><pk-icon slot="icon" name="settings"></pk-icon>Settings</pk-nav-item>
</pk-side-nav>
<h2 slot="title">Catalogue</h2>
<pk-stack><p>The page body sits beside the rail.</p></pk-stack>
</pk-app-shell>`,
    steps: [
        { shot: 'rail' },
        { hover: '#products >>> [part=link]' }, { wait: 400 }, { shot: 'flyout' },
    ],
    expect(t) {
        // Issue 325: whatever the load order, the rows carry their reflected `rail` attribute (a property set before the upgrade is reflected).
        const reflected = ['#dash', '#orders', '#products', '#settings'].every(id => t.attr(id, 'rail') !== null);
        t.ok(reflected, 'the rows of the collapsed nav have no rail attribute (a property set before the element upgraded is not reflected): full rows and no flyout');
        if (t.shot === 'rail') {
            const nav = t.rect(NAV);
            t.ok(nav && nav.width < 100, `the rail is ${Math.round(nav?.width ?? 0)}px wide, expected an icon rail under 100px`);
            t.hidden('#brand', 'the brand link (it does not fit the rail)');
            t.visible('#nav >>> [part=collapse]', 'the collapse caret');
            t.within('#nav >>> [part=collapse]', NAV);
            t.attr('#nav >>> [part=collapse]', 'aria-label') === 'Expand the menu' || t.ok(false, 'the caret should offer "Expand the menu" while collapsed');
            if (reflected) for (const id of ['#dash', '#orders', '#products', '#settings']) { t.hidden(`${id} >>> [part=label]`, `the label of ${id}`); t.visible(`${id} >>> [part=icon]`, `the icon of ${id}`); t.within(`${id} >>> [part=icon]`, NAV); }
        }
        if (t.shot === 'flyout' && reflected) {
            t.visible(SUB, 'the flyout');
            const row = t.rect('#products >>> [part=link]'), sub = t.rect(SUB);
            if (row && sub) t.ok(sub.x >= row.right, `the flyout starts at x=${Math.round(sub.x)}, over its own row which ends at x=${Math.round(row.right)}`);
            t.inViewport(SUB);
            // Children keep their labels (they are not rail rows) and the flyout names its branch.
            t.visible('#all >>> [part=label]', 'the label of "All products"');
            t.hasText('#all', 'All products');
            t.visible('#drafts >>> [part=label]', 'the label of "Drafts and imports"');
            t.visible('#products >>> [part=sub-title]', 'the flyout heading');
            t.hasText('#products >>> [part=sub-title]', 'Products');
            t.ok(t.attr(SUB, 'aria-label') === 'Products' && t.attr(SUB, 'role') === 'group', 'the flyout is not a group named after its branch (role=group, aria-label="Products")');
            t.within('#all', SUB); t.within('#drafts', SUB);
        }
    },
};
