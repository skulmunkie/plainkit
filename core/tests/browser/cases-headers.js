// Browser cases for pk-page-header and pk-toolbar. Same contract as cases.js: [name, async (t) => void].
const rect = el => el.getBoundingClientRect();

export const headerCases = [
    ['page-header: the title is a heading at the chosen level, slots land in their parts, and empty rows are hidden', async t => {
        const h = await t.mount('<pk-page-header heading="PO 1042" level="1"><nav slot="breadcrumb" aria-label="Trail"><a href="#">Stock</a></nav><span>Open</span><button slot="actions">Receive</button><span slot="meta">Note</span></pk-page-header>');
        const title = h.part('title');
        t.eq(title.getAttribute('role'), 'heading'); t.eq(title.getAttribute('aria-level'), '1'); t.eq(title.textContent, 'PO 1042');
        t.eq(h.shadowRoot.querySelector('header')?.getAttribute('part'), 'header');
        t.ok(h.part('crumbs').contains(h.shadowRoot.querySelector('slot[name="breadcrumb"]')), 'breadcrumb slot is in the crumbs row');
        t.ok(h.part('actions').contains(h.shadowRoot.querySelector('slot[name="actions"]')), 'actions slot is in the actions part');
        t.ok(h.part('lead').contains(h.shadowRoot.querySelector('slot:not([name])')), 'default slot is beside the title');
        t.ok(!h.part('crumbs').hidden && !h.part('actions').hidden && !h.part('meta').hidden);
        h.level = 3; await t.settle(); t.eq(h.part('title').getAttribute('aria-level'), '3');
        const bare = await t.mount('<pk-page-header heading="Only a title"></pk-page-header>');
        t.ok(bare.part('crumbs').hidden && bare.part('actions').hidden && bare.part('meta').hidden, 'unused rows are hidden');
        const none = await t.mount('<pk-page-header></pk-page-header>'); t.ok(none.part('titlebar').hidden);
        t.eq(none.variant, 'page');
    }],

    ['page-header: section and record variants reflect, and a pk-breadcrumb slots in above the title', async t => {
        const s = await t.mount('<pk-page-header variant="section" heading="Movements"><button slot="actions">Refresh</button><span slot="meta">Latest 50</span></pk-page-header>');
        t.eq(s.getAttribute('variant'), 'section'); t.eq(s.part('title').getAttribute('aria-level'), '2');
        t.ok(rect(s.part('meta')).top >= rect(s.part('titlebar')).bottom - 1, 'the note sits under the title bar');
        const r = await t.mount('<pk-page-header variant="record"><span id="chip">Open</span><button slot="actions" id="act">Print</button></pk-page-header>');
        t.ok(r.part('title').hidden || r.part('title').textContent === '', 'no title without heading');
        t.ok(rect(r.querySelector('#chip')).left < rect(r.querySelector('#act')).left, 'chips at the left, actions at the right');
        r.variant = 'bogus'; t.eq(r.variant, 'page');
        const b = await t.mount('<pk-page-header heading="T"><pk-breadcrumb slot="breadcrumb"><a href="#">A</a><span aria-current="page">B</span></pk-breadcrumb></pk-page-header>');
        t.ok(rect(b.querySelector('pk-breadcrumb')).bottom <= rect(b.part('title')).top + 1, 'the trail is above the title');
    }],

    ['page-header: on a narrow container the actions take the full width and are touch sized', async t => {
        const host = t.stage('<pk-page-header heading="Wrapped"><button slot="actions">One</button><button slot="actions">Two</button></pk-page-header>');
        host.style.width = '320px'; await t.load(host); await t.settle();
        const h = host.firstElementChild, acts = h.part('actions');
        t.ok(Math.abs(rect(acts).width - rect(h.part('titlebar')).width) < 2, 'actions are as wide as the title bar');
        t.ok(rect(acts).top >= rect(h.part('lead')).bottom - 1, 'actions wrap under the title');
        t.ok(rect(h.querySelector('button')).height >= 44 - 1, 'touch-sized');
        t.ok(h.scrollWidth <= h.clientWidth + 1, 'no horizontal overflow');
        host.style.width = '900px'; await t.settle();
        t.ok(rect(acts).left > rect(h.part('lead')).right - 1 && Math.abs(rect(acts).top - rect(h.part('lead')).top) < rect(h.part('titlebar')).height, 'actions sit beside the title when wide');
    }],

    ['page-header and toolbar: keep their width inside a shrink-to-fit flex parent (size containment must not collapse them)', async t => {
        const host = t.stage('<div><pk-page-header heading="Wide"></pk-page-header><pk-toolbar heading="Wide"></pk-toolbar></div>');
        host.style.width = '500px'; host.firstElementChild.style.display = 'flex'; host.firstElementChild.style.flexDirection = 'column'; host.firstElementChild.style.alignItems = 'flex-start'; await t.load(host); await t.settle();
        for (const el of host.firstElementChild.children) t.ok(rect(el).width >= 499, el.localName + ' is ' + rect(el).width);
    }],

    ['page-header: sticky keeps it flush under the app bar while the app shell body scrolls, and pins in a plain scroller too', async t => {
        const sh = await t.mount('<pk-app-shell style="height:400px"><span slot="title">App</span><pk-page-header sticky heading="Record"><button slot="actions">Sync</button></pk-page-header><div style="height:1500px">Long</div></pk-app-shell>');
        await t.settle();
        const body = sh.part('body'), h = sh.querySelector('pk-page-header');
        body.scrollTop = 600; await t.settle();
        t.ok(body.scrollTop > 0, 'the body scrolled');
        t.ok(Math.abs(rect(h).top - rect(body).top) < 2, 'the header stays at the top of the body: ' + rect(h).top + ' vs ' + rect(body).top);
        t.ok(rect(h.querySelector('button')).height > 0 && rect(h).bottom > rect(body).top, 'its actions are in view');
        const plain = t.stage('<div style="height:200px;overflow:auto"><pk-page-header heading="P"></pk-page-header><div style="height:900px">x</div></div>');
        const ph = plain.firstElementChild.firstElementChild, sc = plain.firstElementChild; await t.load(plain);
        sc.scrollTop = 300; await t.settle(); t.ok(rect(ph).top < rect(sc).top, 'without sticky it scrolls away');
        ph.setAttribute('sticky', ''); await t.settle(); t.ok(Math.abs(rect(ph).top - rect(sc).top) < 2, 'with sticky it stays');
    }],

    ['page-header: a narrow record keeps the actions on row one and drops the badges to their own row, badges stay pills, and the tabs slot is docked', async t => {
        const host = t.stage('<pk-page-header variant="record" heading="Blue mug"><pk-badge>Active</pk-badge><pk-badge variant="muted">On hand 1</pk-badge><button slot="actions">Save</button><div slot="tabs" id="pk-tabs-row">Tabs</div></pk-page-header>');
        host.style.width = '320px'; await t.load(host); await t.settle();
        const h = host.firstElementChild, badge = h.querySelector('pk-badge');
        t.ok(rect(h.querySelector('button')).top < rect(h.part('title')).bottom + 2 && rect(h.querySelector('button')).left > rect(h.part('title')).right - 1, 'the action is on the title row, right of it');
        t.ok(rect(badge).top >= rect(h.querySelector('button')).bottom - 1, 'the badges are on their own row below');
        t.ok(Math.abs(rect(badge).width - rect(badge).height) > 4, 'a badge is a pill, not a circle');
        t.ok(rect(h.part('tabs')).top >= rect(badge).bottom - 1 && h.part('tabs').contains(h.shadowRoot.querySelector('slot[name="tabs"]')) && !h.part('tabs').hidden, 'the tabs row is docked under them');
        host.style.width = '900px'; await t.settle();
        t.ok(Math.abs(rect(badge).top - rect(h.part('title')).top) < rect(h.part('titlebar')).height, 'wide: the badges sit beside the title');
        const bare = await t.mount('<pk-page-header heading="X"></pk-page-header>'); t.ok(bare.part('tabs').hidden && bare.part('chips').hidden, 'empty tabs and chips take no room');
    }],

    ['page-header: a sticky header draws above an in-body sticky strip', async t => {
        const sc = t.stage('<div style="height:240px;overflow:auto"><pk-page-header sticky heading="R"></pk-page-header><div style="position:sticky;top:0;z-index:var(--z-sticky);height:80px">strip</div><div style="height:900px">x</div></div>').firstElementChild;
        await t.load(sc); const h = sc.firstElementChild;
        t.ok(Number(getComputedStyle(h).zIndex) > Number(getComputedStyle(sc.children[1]).zIndex), 'its z-index is above the strip');
    }],

    ['toolbar: heading and note render, actions hide when empty, and it stacks on a narrow container', async t => {
        const host = t.stage('<pk-toolbar heading="Lines" note="12 lines"><button slot="actions">Export</button><button slot="actions">Add</button></pk-toolbar>');
        host.style.width = '900px'; await t.load(host); await t.settle();
        const tb = host.firstElementChild;
        t.eq(tb.part('title').textContent, 'Lines'); t.eq(tb.part('note').textContent, '12 lines');
        t.ok(tb.part('lead').contains(tb.shadowRoot.querySelector('slot:not([name])')), 'default slot in the lead');
        t.ok(!tb.part('actions').hidden);
        t.ok(rect(tb.part('actions')).left >= rect(tb.part('lead')).right - 1, 'actions beside the lead when wide');
        host.style.width = '320px'; await t.settle();
        t.ok(rect(tb.part('actions')).top >= rect(tb.part('lead')).bottom - 1, 'actions stack under the lead when narrow');
        t.ok(Math.abs(rect(tb.part('actions')).width - rect(tb.part('toolbar')).width) < 2, 'full width');
        t.ok(rect(tb.querySelector('button')).height >= 43, 'touch-sized');
        const e = await t.mount('<pk-toolbar heading="Only lead"></pk-toolbar>'); t.ok(e.part('actions').hidden);
    }],
];
