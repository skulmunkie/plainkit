// pk-dropdown open (issue 283 and the overlay class of defect): the menu is a fixed layer that must sit next to its trigger, also when the trigger is wrapped
// the way the Blazor wrapper renders it (display: contents), and flip or shift instead of leaving the viewport at the right edge.
const MENU = id => `#${id} >>> [part=menu]`;

export default {
    name: 'dropdown',
    issue: [283],
    elements: ['dropdown', 'menu-item'],
    html: `<div class="u-p-1r-1p25r"><pk-cluster>
<pk-dropdown id="d1"><span slot="trigger" class="u-contents"><pk-button id="b1" variant="secondary">Actions</pk-button></span>
<pk-menu-item type="header">Order 1042</pk-menu-item><pk-menu-item>Edit</pk-menu-item><pk-menu-item>Duplicate</pk-menu-item><pk-menu-item type="checkbox" checked>Show archived</pk-menu-item><pk-menu-item type="divider"></pk-menu-item><pk-menu-item danger>Delete</pk-menu-item>
</pk-dropdown>
<pk-dropdown id="d2" class="u-ml-auto"><pk-button id="b2" slot="trigger" variant="ghost">More</pk-button>
<pk-menu-item>Edit</pk-menu-item><pk-menu-item>Duplicate</pk-menu-item><pk-menu-item>Archive</pk-menu-item><pk-menu-item danger>Delete</pk-menu-item>
</pk-dropdown>
</pk-cluster>
<p>Some page text under the toolbar.</p></div>`,
    steps: [
        { shot: 'closed' },
        { click: '#b1' }, { wait: 300 }, { shot: 'open-wrapped' },
        { key: 'Escape' }, { wait: 200 },
        { click: '#b2' }, { wait: 300 }, { shot: 'open-edge' },
        { key: 'Escape' }, { wait: 200 },
        { focus: '#b1' }, { key: 'ArrowDown' }, { wait: 300 }, { shot: 'keyboard' },
    ],
    expect(t) {
        const open = { 'open-wrapped': ['d1', 'b1'], 'open-edge': ['d2', 'b2'], keyboard: ['d1', 'b1'] }[t.shot];
        if (!open) { t.hidden(MENU('d1'), 'the menu of the first dropdown while closed'); t.hidden(MENU('d2'), 'the menu of the second dropdown while closed'); return; }
        const [id, trig] = open;
        const menu = MENU(id);
        t.visible(menu, 'the open menu');
        t.ok(t.attr(`#${trig}`, 'aria-expanded') === 'true' || t.attr(`#${id} > [slot=trigger]`, 'aria-expanded') === 'true', `the trigger of #${id} does not say aria-expanded="true" while its menu is open`);
        t.inViewport(menu);
        t.noOverlap(menu, `#${trig}`);
        const m = t.rect(menu), b = t.rect(`#${trig}`);
        if (m && b) {
            t.ok(m.y >= b.bottom - 1 || m.bottom <= b.y + 1, `the menu (y ${Math.round(m.y)} to ${Math.round(m.bottom)}) is neither below nor above its trigger (y ${Math.round(b.y)} to ${Math.round(b.bottom)})`);
            const near = Math.min(Math.abs(m.y - b.bottom), Math.abs(b.y - m.bottom));
            t.ok(near <= 16, `the menu is ${Math.round(near)}px from its trigger, expected it next to it (at most 16px)`);
            t.ok(m.x < b.right && m.right > b.x, `the menu (x ${Math.round(m.x)} to ${Math.round(m.right)}) is not aligned with its trigger (x ${Math.round(b.x)} to ${Math.round(b.right)})`);
            t.ok(m.x > 0 || m.y > 0, 'the menu is at 0,0 (it lost its anchor)');
        }
        t.ok(t.metric(menu, 'scrollWidth') <= t.metric(menu, 'clientWidth') + 1, 'the menu content is wider than the menu (a label runs out of it)');
        for (let i = 1; i <= 6; i++) {
            const sel = `#${id} > pk-menu-item:nth-of-type(${i})`;
            if (!t.shown(sel) || t.attr(sel, 'type') === 'divider' || t.attr(sel, 'type') === 'header') continue;
            t.within(sel, menu);
            t.atLeast(sel, 'height', t.viewport.name === 'phone' ? 40 : 28);
        }
    },
};
