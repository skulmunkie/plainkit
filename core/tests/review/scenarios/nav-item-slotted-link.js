// pk-nav-item with an author-written light-DOM <a href> (#1841): the anchor is the row's one link, styled like the row (no underline,
// current accent bar, focus ring on the row), next to the same row built from the href attribute, in the side nav and in the icon rail.
export default {
    name: 'nav-item-slotted-link',
    issue: [1841],
    elements: ['nav-item', 'side-nav'],
    html: `<div class="stack">
<div id="nav">
<pk-nav-item current><a href="#a" aria-current="page">Slotted current</a></pk-nav-item>
<pk-nav-item><a href="#b">Slotted link</a></pk-nav-item>
<pk-nav-item href="#c">Attribute link</pk-nav-item>
<pk-nav-item rail><span slot="icon">*</span><a href="#d">Rail slotted</a></pk-nav-item></div></div>`,
    steps: [
        { shot: 'rest' },
        { focus: '#nav pk-nav-item:nth-of-type(2) a' },
        { shot: 'focused' },
    ],
    expect(t) {
        const a = t.rect('pk-nav-item:nth-of-type(1)'), b = t.rect('pk-nav-item:nth-of-type(2)'), c = t.rect('pk-nav-item:nth-of-type(3)');
        if (a && b && c) t.ok(Math.abs(b.height - c.height) <= 1, `the slotted row is as tall as the attribute row (${b.height} vs ${c.height})`);
        t.visible('pk-nav-item:nth-of-type(2) a', 'the slotted link');
    },
};
