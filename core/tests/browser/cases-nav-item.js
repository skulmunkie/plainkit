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
    ['nav-item: with the element not defined (no JavaScript yet) the slotted <a href> is a visible, focusable, working link; defining the element keeps the same link working and the light DOM unchanged (#1841)', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'nav item before it is defined';
        f.style.cssText = 'width:600px;height:300px;border:0;display:block';
        f.src = new URL('./nav-item-frame.html?hold=pk-nav-item', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const win = f.contentWindow, d = win.document;
        await wait(400);
        t.ok(!win.customElements.get('pk-nav-item'), 'pk-nav-item is not defined');
        const a = d.querySelector('#n1 > a'), before = a.parentElement.innerHTML; // the host may add its own state attributes; its children are the author's
        const r = box(a);
        t.ok(r.width > 0 && r.height > 0 && getComputedStyle(a).visibility === 'visible', 'the link is visible (' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) + ')');
        a.focus(); t.ok(d.activeElement === a, 'the link takes focus');
        a.click(); await wait(50);
        t.eq(win.location.hash, '#slotted-target', 'the link navigates with no element code');
        win.location.hash = '';
        win.release(); await Promise.race([win.customElements.whenDefined('pk-nav-item'), wait(5000)]); await wait(300);
        t.ok(!!win.customElements.get('pk-nav-item'), 'pk-nav-item is defined now');
        t.eq(d.querySelector('#n1').innerHTML, before, 'defining the element left the author children unchanged');
        const a2 = d.querySelector('#n1 > a'); t.ok(a2 === a, 'it is the same anchor node');
        a2.focus(); t.ok(d.activeElement === a2, 'the link still takes focus');
        a2.click(); await wait(50);
        t.eq(win.location.hash, '#slotted-target', 'the link still navigates once upgraded');
    }],
    ['nav-item: defining the element does not move the slotted links or the rows under them (layout shift, #1877)', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'nav item layout shift';
        f.style.cssText = 'width:600px;height:300px;border:0;display:block';
        f.src = new URL('./nav-item-frame.html?hold=pk-nav-item', import.meta.url).href;
        await new Promise(resolve => { f.addEventListener('load', resolve, { once: true }); host.append(f); });
        const win = f.contentWindow, d = win.document;
        await wait(400);
        t.ok(!win.customElements.get('pk-nav-item'), 'pk-nav-item is not defined');
        const ids = ['n1', 'n2', 'n3'], rects = () => ids.map(id => { const range = d.createRange(); range.selectNodeContents(d.querySelector('#' + id + ' > a')); const r = range.getBoundingClientRect(), h = box(d.querySelector('#' + id)); return [r.left, r.top, r.width, r.height, h.top, h.height]; });
        const before = rects();
        win.release(); await Promise.race([win.customElements.whenDefined('pk-nav-item'), wait(5000)]); await wait(300);
        t.ok(!!win.customElements.get('pk-nav-item'), 'pk-nav-item is defined now');
        const after = rects();
        ids.forEach((id, i) => {
            const dx = after[i].map((v, k) => Math.abs(v - before[i][k]));
            t.ok(Math.max(...dx) < 1.5, id + ' link/row left,top,width,height,rowTop,rowHeight went from ' + before[i].map(Math.round) + ' to ' + after[i].map(Math.round) + ' when it upgraded, expected the same. FIX: reserve its box with pk-nav-item:not(:defined) in base.css');
        });
    }],
    ['menu-item: a description in the slot or the attribute pads the row, a plain item does not', async t => {
        const host = t.stage('<div role="menu"><pk-menu-item id="plain">Plain</pk-menu-item><pk-menu-item id="slot">Slot<span slot="description">desc</span></pk-menu-item><pk-menu-item id="attr" description="desc">Attr</pk-menu-item></div>');
        await t.load(host); await t.settle(); await wait(80);
        const pad = id => host.querySelector("#" + id).getBoundingClientRect().height;
        t.ok(pad('slot') > pad('plain'), `a slotted description makes the row taller (${pad('slot')} vs ${pad('plain')})`);
        t.ok(pad('attr') > pad('plain'), `a description attribute makes the row taller (${pad('attr')} vs ${pad('plain')})`);
    }],
];
