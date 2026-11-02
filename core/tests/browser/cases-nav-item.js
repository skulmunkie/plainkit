// Browser cases for pk-nav-item and pk-menu-item empty parts (issue 1143). Same contract as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const box = el => el.getBoundingClientRect();

export const navItemCases = [
    ['nav-item: with no icon and no badge the row reserves no space for them; with an icon or a badge it lays out as designed', async t => {
        const host = t.stage('<pk-nav-item id="plain" href="#a">Plain</pk-nav-item><pk-nav-item id="icon" href="#b"><span slot="icon">*</span>Icon</pk-nav-item><pk-nav-item id="badge" href="#c">Badge<span slot="badge">3</span></pk-nav-item>');
        await t.load(host); await t.settle(); await wait(80);
        const part = (id, p) => host.querySelector('#' + id).shadowRoot.querySelector(`[part="${p}"]`);
        const link = part('plain', 'link'), edge = box(link).left + parseFloat(getComputedStyle(link).paddingLeft);
        const plain = box(part('plain', 'label'));
        t.ok(Math.abs(plain.left - edge) <= 0.5, `the plain item's label starts at the link's padding edge (label ${plain.left.toFixed(1)}, edge ${edge.toFixed(1)})`);
        t.eq(box(part('plain', 'icon')).width, 0, 'the empty icon part is 0 wide');
        t.eq(box(part('plain', 'badge')).width, 0, 'the empty badge part is 0 wide');
        const ic = part('icon', 'icon');
        t.ok(Math.abs(box(ic).width - 1.25 * parseFloat(getComputedStyle(document.documentElement).fontSize)) <= 0.5, `the icon part is its designed 1.25rem wide (${box(ic).width})`);
        t.ok(box(part('icon', 'label')).left > box(ic).right, 'the label follows the icon');
        const bd = part('badge', 'badge'), bl = part('badge', 'link');
        t.ok(box(bd).width > 0, 'the badge part has width');
        t.ok(box(bl).right - box(bd).right <= parseFloat(getComputedStyle(bl).paddingRight) + 1, 'the badge sits at the row end');
    }],
    ['nav-item: a slotted light-DOM <a href> is the one link, fills the row, shows current, and the host never touches it (#1841)', async t => {
        const host = t.stage('<pk-nav-item id="s"><a href="#slotted" aria-current="page">Slotted</a></pk-nav-item><pk-nav-item id="p" href="#plain">Plain</pk-nav-item><pk-nav-item id="r" rail><span slot="icon">*</span><a href="#rail">Rail</a></pk-nav-item>');
        await t.load(host); await t.settle(); await wait(80);
        const s = host.querySelector('#s'), a = s.querySelector('a'), row = s.shadowRoot.querySelector('[part="link"]');
        const before = s.innerHTML;
        t.ok(!row.hasAttribute('href') && row.getAttribute('role') === 'presentation', 'the shadow row is presentational, so there is one link');
        t.eq(getComputedStyle(s.shadowRoot.querySelector('[part="chevron"]')).display, 'none', 'no branch chevron beside a link');
        t.eq(getComputedStyle(a).textDecorationLine, 'none', 'the link is not underlined');
        const hit = getComputedStyle(a, '::after'), pad = box(s);
        t.ok(hit.position === 'absolute' && getComputedStyle(s).position === 'relative' && Math.abs(parseFloat(hit.width) - pad.width) <= 1, 'the link hit area is stretched over the whole row (' + hit.width + ' vs ' + pad.width + ')');
        a.focus(); t.ok(s.matches(':focus-within') || s.ownerDocument.activeElement === a, 'the link takes focus');
        t.eq(s.innerHTML, before, 'the host left the author markup unchanged');
        const r = host.querySelector('#r');
        t.ok(box(r.querySelector('a')).width > 0 && box(r).height > 0, 'in the rail the link is still laid out (reachable)');
    }],
    ['menu-item: a description in the slot or the attribute pads the row, a plain item does not', async t => {
        const host = t.stage('<div role="menu"><pk-menu-item id="plain">Plain</pk-menu-item><pk-menu-item id="slot">Slot<span slot="description">desc</span></pk-menu-item><pk-menu-item id="attr" description="desc">Attr</pk-menu-item></div>');
        await t.load(host); await t.settle(); await wait(80);
        const pad = id => host.querySelector("#" + id).getBoundingClientRect().height;
        t.ok(pad('slot') > pad('plain'), `a slotted description makes the row taller (${pad('slot')} vs ${pad('plain')})`);
        t.ok(pad('attr') > pad('plain'), `a description attribute makes the row taller (${pad('attr')} vs ${pad('plain')})`);
    }],
];
