// pk-card-menu (issues 728 and 837): a pk-dropdown opened by an icon pk-button, in the actions slot of a pk-card header. With a heading long enough
// to wrap, the button stays on the first row at the inline end (never dropped under the heading); the open menu is fully inside the viewport, right edge aligned with
// the button; and in right-to-left everything mirrors.
const T1 = '#c1 >>> [part=title]';
const T2 = '#c2 >>> [part=title]';
const CARD2 = '#c2 >>> [part=card]';
const MENU = id => `#${id} >>> [part=menu] >>> [part=menu]`;
const BTN = id => `#${id} >>> [part=button]`;

export default {
    name: 'card-menu',
    issue: [728, 837],
    elements: ['card', 'card-menu', 'dropdown'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-stack>
<pk-card id="c1" heading="Orders"><pk-card-menu id="d1" slot="actions" label="Orders actions"><pk-menu-item value="export">Export</pk-menu-item><pk-menu-item value="archive">Archive</pk-menu-item><pk-menu-item value="delete" variant="danger">Delete</pk-menu-item></pk-card-menu><p>Recent orders.</p></pk-card>
<pk-card id="c2" heading="Quarterly orders and fulfilment overview for every regional warehouse and distribution partner in the network"><pk-card-menu id="d2" slot="actions" label="Overview actions"><pk-menu-item value="export">Export</pk-menu-item><pk-menu-item value="archive">Archive</pk-menu-item></pk-card-menu><p>Totals by region.</p></pk-card>
</pk-stack>
</div>`,
    steps: [
        { shot: 'closed' },
        { click: BTN('d2') }, { wait: 300 }, { shot: 'open-long' },
        { key: 'Escape' }, { wait: 200 },
        { click: BTN('d1') }, { wait: 300 }, { shot: 'open-short' },
        { key: 'Escape' }, { wait: 200 },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 200 }, { click: BTN('d2') }, { wait: 300 }, { shot: 'rtl-open-long' },
        { key: 'Escape' }, { wait: 200 }, { shot: 'rtl-closed' },
    ],
    expect(t) {
        const rtl = t.shot.startsWith('rtl');
        for (const [btn, title, card] of [[BTN('d1'), T1, '#c1 >>> [part=card]'], [BTN('d2'), T2, CARD2]]) {
            const b = t.rect(btn), c = t.rect(card), h = t.rect(title);
            if (!b || !c || !h) continue;
            t.ok(b.y < h.y + h.height / 2 + 1, `${btn}: the button (top ${Math.round(b.y)}) is on the heading's first row (heading ${Math.round(h.y)}-${Math.round(h.y + h.height)})`, 'the card header must keep its actions beside the heading: card.css [part=title] takes the row (flex 1 1 0, min-inline-size 0)');
            t.ok(rtl ? b.x - c.x < 30 : c.right - b.right < 30, `${btn}: the button is at the inline end of the card (${Math.round(rtl ? b.x - c.x : c.right - b.right)}px from the edge)`);
            t.ok(rtl ? h.x >= b.right - 1 : h.right <= b.x + 1, `${btn}: the heading does not run under the button`);
        }
        if (t.shot.includes('open')) {
            const id = t.shot.endsWith('short') ? 'd1' : 'd2';
            t.visible(MENU(id), 'the open menu');
            t.inViewport(MENU(id));
            t.noOverlap(MENU(id), BTN(id));
        }
    },
};
