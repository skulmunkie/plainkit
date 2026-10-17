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

    ['breadcrumb: the separator chevron is not part of the link (no underline, no hit area, hidden from assistive tech)', async t => {
        const b = await t.mount('<pk-breadcrumb><a href="#" style="text-decoration: underline">Products</a><span aria-current="page">Blue mug</span></pk-breadcrumb>'); await t.settle();
        const after = getComputedStyle(b.querySelector('a'), '::after');
        t.eq(after.pointerEvents, 'none', 'a click on the chevron does not follow the link');
        t.eq(after.position, 'absolute', 'the chevron is out of the link text flow, so the link underline cannot run under it');
        t.ok(after.content.includes('/ ""'), 'the chevron has empty alternative text, so assistive tech skips it');
    }],

    ['page-header: a record titled by its last crumb keeps the chips and the actions on the crumbs row, and only the chips drop under it when narrow', async t => {
        const html = '<pk-page-header variant="record"><pk-breadcrumb slot="breadcrumb"><a href="#">Products</a><span aria-current="page">Blue mug</span></pk-breadcrumb><pk-badge id="chip">Active</pk-badge><button slot="actions" id="act">Save</button></pk-page-header>';
        const host = t.stage(html); host.style.width = '1000px'; await t.load(host); await t.settle();
        const h = host.firstElementChild, mid = n => (rect(n).top + rect(n).bottom) / 2;
        const crumb = h.querySelector('pk-breadcrumb'), chip = h.querySelector('#chip'), act = h.querySelector('#act');
        t.ok(Math.abs(mid(chip) - mid(crumb)) < 6, 'wide: the chips are on the crumbs row');
        t.ok(Math.abs(mid(act) - mid(crumb)) < 6, 'wide: the actions are on the crumbs row');
        t.ok(rect(act).left > rect(chip).right, 'wide: the actions are at the end');
        host.style.width = '360px'; await t.settle();
        t.ok(Math.abs(mid(act) - mid(crumb)) < 6, 'narrow: the actions stay on the crumbs row');
        t.ok(rect(chip).top >= rect(crumb).bottom - 1, 'narrow: only the chips drop under the crumbs');
        t.ok(h.scrollWidth <= h.clientWidth + 1, 'no horizontal overflow');
    }],

    ['page-header: a record with no crumbs and no heading keeps its chips and its actions on one row at every width', async t => {
        const host = t.stage('<pk-page-header variant="record"><pk-badge id="chip">Open</pk-badge>Acme Supply<button slot="actions" id="act">Print</button></pk-page-header>');
        const h = host.firstElementChild, mid = n => (rect(n).top + rect(n).bottom) / 2;
        for (const w of ['1000px', '360px']) {
            host.style.width = w; await t.load(host); await t.settle();
            const chip = h.querySelector('#chip'), act = h.querySelector('#act');
            t.ok(Math.abs(mid(chip) - mid(act)) < 30, `${w}: the chips and the actions share a row`);
            t.ok(rect(act).left > rect(chip).right, `${w}: the actions are at the end`);
        }
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
        const sh = await t.mount('<pk-app-shell style="height:400px"><pk-page-header sticky heading="Record"><button slot="actions">Sync</button></pk-page-header><div style="height:1500px">Long</div></pk-app-shell>');
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

    ['app-shell: the scrolling body is a containing block, so an absolutely positioned page element resolves against the body, not the page (#302)', async t => {
        const sh = await t.mount('<pk-app-shell style="height:400px"><div id="abs" style="position:absolute;top:0;left:0;width:10px;height:10px"></div><div style="height:1500px">Long</div></pk-app-shell>');
        await t.settle();
        const body = sh.part('body'), abs = sh.querySelector('#abs');
        t.ok(Math.abs(rect(abs).top - rect(body).top) <= 1, 'the element at top:0 sits at the top of the body (' + rect(body).top + '), not of the page: ' + rect(abs).top);
        body.scrollTop = 300; await t.settle();
        t.ok(rect(abs).top < rect(body).top, 'it scrolls with the body content: ' + rect(abs).top);
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
    ['page shell: a field hint and an action hint add an info tip beside the label and a tooltip on the button; a config without them is unchanged', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const cfg = { heading: 'Settings', actions: [{ key: 'save', label: 'Save', hint: 'Saves every section' }, { key: 'x', label: 'Plain' }], sections: [{ heading: 'A', fields: [
            { key: 'name', type: 'text', label: 'Name', hint: 'Shown on invoices' }, { key: 'mail', type: 'email', label: 'Email' },
            { key: 'on', type: 'switch', label: 'Notify', hint: 'Sends a weekly digest' }] }] };
        const page = await t.mount('<pk-settings-page></pk-settings-page>');
        page.config = cfg;
        for (let i = 0; i < 30 && !page.shadowRoot.querySelectorAll('pk-tooltip').length; i++) await wait(100);
        await t.load(page.shadowRoot);
        await t.settle();
        const tips = [...page.shadowRoot.querySelectorAll('pk-tooltip')];
        t.eq(tips.length, 3, 'one tip per hint, none for the plain field or action');
        const field = page.shadowRoot.querySelector('pk-field');
        const label = field.shadowRoot?.querySelector('[part=label]') ?? field;
        const tip = field.querySelector('pk-tooltip[slot=label-action]');
        t.ok(tip && tip.help && tip.interactive && tip.text === 'Shown on invoices', 'the field tip is an interactive info button in the label-action slot');
        t.ok(rect(tip).width > 0 && Math.abs(rect(tip).top - rect(label).top) < rect(label).height + 4, 'the tip sits beside the label, not below the control');
        t.ok(rect(tip).bottom <= rect(field.querySelector('pk-input')).top + 2, 'the tip is above the control');
        const sw = page.shadowRoot.querySelector('pk-cluster pk-switch');
        t.ok(sw && rect(sw).right <= rect(sw.parentNode.querySelector('pk-tooltip')).left + 2, 'the switch hint follows the switch on its row');
        const save = page.shadowRoot.querySelector('pk-page-shell > pk-tooltip[slot=actions][text="Saves every section"] > pk-button');
        t.ok(save, 'the action button is wrapped by its tooltip');
        t.eq(page.shadowRoot.querySelectorAll('pk-page-shell > pk-tooltip[slot=actions]').length, 1, 'an action without a hint is not wrapped in a tooltip');
        t.eq(page.shadowRoot.querySelectorAll('pk-page-shell > pk-button[slot=actions]').length, 1, 'an action without a hint stays a bare button');
        t.eq(page.shadowRoot.querySelectorAll('pk-input').length, 2);
    }],
];

// Issue 801: the crumbs prop (a JSON array) draws the breadcrumb, a home crumb and a back link in the element's own shadow tree.
headerCases.push(
    ['page-header: crumbs draws a pk-breadcrumb with the last crumb as aria-current (and the page title when no heading is set), above the title', async t => {
        const trail = JSON.stringify([{ label: 'Stock', href: '/stock' }, { label: 'Section' }, { label: 'Purchase orders', href: '/stock/orders' }, { label: 'PO 1042' }]).replace(/"/g, '&quot;');
        const h = await t.mount(`<pk-page-header level="1" crumbs="${trail}"></pk-page-header>`);
        const nav = h.part('trail'), kids = [...nav.children];
        t.eq(nav.localName, 'pk-breadcrumb'); t.ok(!nav.hidden && !h.part('crumbs').hidden, 'the trail is shown');
        t.eq(kids.map(k => k.localName).join(), 'a,span,a,span', 'a link where there is an address, text where there is not');
        t.eq(kids[0].getAttribute('href'), '/stock');
        t.eq(kids[3].getAttribute('aria-current'), 'page'); t.eq(kids[3].getAttribute('role'), 'heading'); t.eq(kids[3].getAttribute('aria-level'), '1');
        t.ok(!kids[2].hasAttribute('aria-current'), 'only the last is the current page');
        h.heading = 'Acme order'; await t.settle();
        t.ok(![...h.part('trail').children].pop().hasAttribute('role'), 'with a heading the last crumb is a plain current-page marker');
        t.ok(rect(h.part('trail')).bottom <= rect(h.part('title')).top + 1, 'the trail is above the title');
        h.breadcrumbLabel = 'Where you are'; await t.settle(); t.eq(h.part('trail').getAttribute('label'), 'Where you are');
    }],
    ['page-header: homeHref draws an icon-only home link first, backLink a Back to <parent> button above the header, and neither without crumbs', async t => {
        const h = await t.mount('<pk-page-header heading="T" back-link home-href="#home" home-label="Dashboard" crumbs="[{&quot;label&quot;:&quot;Stock&quot;,&quot;href&quot;:&quot;/stock&quot;},{&quot;label&quot;:&quot;Hidden&quot;},{&quot;label&quot;:&quot;PO&quot;}]"></pk-page-header>');
        const first = h.part('trail').firstElementChild;
        t.eq(first.getAttribute('href'), '#home'); t.eq(first.getAttribute('aria-label'), 'Dashboard'); t.eq(first.querySelector('pk-icon')?.getAttribute('name'), 'dashboard');
        const back = h.part('back');
        t.ok(!back.hidden, 'the back link is shown'); t.eq(back.textContent, 'Back to Stock', 'it names the last crumb before the current one that links'); t.eq(back.href, '/stock');
        t.ok(rect(back).bottom <= rect(h.part('header')).top + 1, 'it sits above the header');
        h.backLink = false; await t.settle(); t.ok(h.part('back').hidden);
        const none = await t.mount('<pk-page-header heading="T" back-link home-href="#home"></pk-page-header>');
        t.ok(none.part('trail').hidden && none.part('back').hidden && none.part('crumbs').hidden, 'without crumbs there is no trail, home crumb or back link');
    }],
    ['page-header: an unsafe crumb address draws no link, and a crumbs value that is not JSON draws no trail', async t => {
        const h = await t.mount('<pk-page-header heading="T" crumbs="[{&quot;label&quot;:&quot;Bad&quot;,&quot;href&quot;:&quot;javascript:alert(1)&quot;},{&quot;label&quot;:&quot;Now&quot;}]"></pk-page-header>');
        t.eq([...h.part('trail').children].map(k => k.localName).join(), 'span,span', 'a script address is not a link');
        const bad = await t.mount('<pk-page-header heading="T" crumbs="not json"></pk-page-header>');
        t.ok(bad.part('trail').hidden, 'no trail');
    }],
    // The suite cannot switch to print media: what the rules do in print is measured by the print-page scenario (ui-review, { media: 'print' }); here the adopted stylesheet itself.
    ['print-page: the adopted document stylesheet carries @page size and margin and the print block, and leaves with the page', async t => {
        const p = await t.mount('<pk-print-page size="A4" margin="12mm"><button slot="toolbar">Print</button><pk-card heading="Acme"><p>Due</p></pk-card><p data-screen-only>Screen only</p><pk-table caption="Lines"></pk-table></pk-print-page>');
        await t.settle();
        const sheet = document.adoptedStyleSheets.at(-1), rules = [...sheet.cssRules];
        t.ok(rules.some(r => r instanceof CSSPageRule && r.style.margin === '12mm'), '@page carries the margin prop');
        t.ok(rules.some(r => r instanceof CSSPageRule && /size:\s*a4/i.test(r.cssText)), '@page carries the size prop');
        p.remove();
        t.ok(rules.some(r => r instanceof CSSMediaRule && r.media.mediaText === 'print' && /break-inside:\s*avoid/.test(r.cssText)), 'the print block keeps cards whole');
        t.ok(!document.adoptedStyleSheets.includes(sheet), 'removing the page removes the document stylesheet');
    }],
    ['print-page: blocks inside the sheet are spaced by the element, never touching (the gallery example)', async t => {
        const p = await t.mount('<pk-print-page size="A4" margin="15mm"><pk-button slot="toolbar">Print</pk-button><pk-heading level="1">Statement</pk-heading><pk-card heading="Acme"><p>Balance due</p></pk-card><p data-screen-only>Not printed</p></pk-print-page>');
        await t.settle(); await t.settle();
        const kids = [...p.children].filter(c => c.slot !== 'toolbar'), r = kids.map(k => k.getBoundingClientRect());
        for (let i = 1; i < r.length; i++) t.ok(r[i].top - r[i - 1].bottom >= 8, `block ${i} sits at least 8px below the one before (${r[i].top - r[i - 1].bottom}px)`);
        p.remove();
    }],
);

// Issue 1000: the host-bound surface of the record page (the Blazor wrapper's Busy, Error and OnDelete): deletable shows Delete, busy disables the bar, error is a notice above the form and sits on its own row.
headerCases.push(
    ['record-page: deletable shows Delete and raises pk-record-delete with the id; busy disables the bar buttons; error is a notice above the layout, and clearing each undoes it', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const page = await t.mount('<pk-record-page></pk-record-page>');
        page.load = async () => ({ name: 'Widget' });
        page.save = async () => {};
        page.config = { id: '7', fields: [{ name: 'name', label: 'Name' }] };
        for (let i = 0; i < 40 && page.part('edit').hidden; i++) await wait(50);
        await t.load(page.shadowRoot); await t.settle();
        t.ok(page.part('delete').hidden, 'no Delete without deletable');
        page.deletable = true; await t.settle();
        t.ok(!page.part('delete').hidden && rect(page.part('delete')).width > 0, 'deletable shows Delete');
        let id = null; page.addEventListener('pk-record-delete', e => { id = e.detail.id; });
        page.part('delete').click(); await t.settle();
        t.eq(id, '7', 'pk-record-delete carries the record id');
        page.busy = true; await t.settle();
        t.ok(['edit', 'delete'].every(p => page.part(p).disabled), 'busy disables the buttons');
        page.busy = false; await t.settle();
        t.ok(['edit', 'delete'].every(p => !page.part(p).disabled), 'and enables them again');
        page.error = 'Could not delete the order.'; await t.settle();
        const notice = page.part('notice'), layout = page.part('layout');
        t.ok(notice.textContent.includes('Could not delete the order.') && rect(notice).bottom <= rect(layout).top + 1, 'the error shows above the record');
        page.error = ''; await t.settle();
        t.eq(notice.children.length, 0, 'an empty error clears it');
        page.remove();
    }],
);

// Issue 1000 step 2: the edit form is one pk-field-group drawn from the field defs; typed values, a checkbox boolean, a hint and a server error on a field all work through it.
headerCases.push(
    ['record-page: edit mode is one pk-field-group from the field defs (key, kind, hint): save receives the typed values, a server error lands on its field, a new record starts from config.values', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const page = await t.mount('<pk-record-page></pk-record-page>');
        let saved = null, fail = true;
        page.load = async () => ({ name: 'Widget', qty: '2', active: true });
        page.save = async v => { saved = v; if (fail) throw Object.assign(new Error('invalid'), { errors: { name: 'Name is taken' } }); };
        page.config = { id: '7', fields: [{ key: 'name', label: 'Name', required: true, hint: 'Shown on invoices' }, { key: 'qty', label: 'Quantity', kind: 'number' }, { key: 'active', label: 'Active', kind: 'checkbox' }] };
        for (let i = 0; i < 40 && page.part('edit').hidden; i++) await wait(50);
        await t.load(page.shadowRoot); await t.settle();
        page.part('edit').click(); await t.settle();
        const group = page.part('main').querySelector('pk-field-group');
        t.ok(group, 'edit mode draws a pk-field-group');
        await t.load(group.shadowRoot); await t.settle(); await t.settle();
        t.eq(group.shadowRoot.querySelectorAll('pk-field').length, 3, 'one pk-field per def');
        t.ok(group.shadowRoot.querySelector('pk-field[help="Shown on invoices"]'), 'the hint is the line under the control');
        const name = page.controls()[0]; name.value = 'Taken'; name.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        t.ok(page.dirty, 'typing marks the page dirty');
        page.part('save').click();
        for (let i = 0; i < 40 && !saved; i++) await wait(50);
        t.eq(saved.name, 'Taken'); t.eq(saved.qty, 2, 'a number def saves a number'); t.eq(saved.active, true, 'a checkbox saves a boolean');
        for (let i = 0; i < 40 && group.shadowRoot.querySelector('pk-field').error !== 'Name is taken'; i++) await wait(50);
        t.eq(group.shadowRoot.querySelector('pk-field').error, 'Name is taken', 'the server error lands on its field');
        fail = false; page.part('save').click();
        for (let i = 0; i < 40 && page.mode !== 'view'; i++) await wait(50);
        t.eq(page.mode, 'view', 'a good save returns to view mode');
        page.remove();
        const fresh = await t.mount('<pk-record-page></pk-record-page>');
        fresh.save = async () => {};
        fresh.config = { fields: [{ key: 'name', label: 'Name' }], values: { name: 'Draft' } };
        await t.load(fresh.shadowRoot); await t.settle();
        const g2 = fresh.part('main').querySelector('pk-field-group');
        await t.load(g2.shadowRoot); await t.settle(); await t.settle();
        t.eq(fresh.controls()[0].value, 'Draft', 'a new record starts from config.values');
        fresh.remove();
    }],
);

// Issue 1000 step 3: a custom field's editor child fills its place in the edit form, and the main-before/main-after sections stay around the form in edit mode.
headerCases.push(
    ['record-page: a custom field shows the host child slot="editor-<key>" inside the form (between the other fields), and main-before and main-after stay in edit mode', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const page = await t.mount('<pk-record-page><pk-switch slot="editor-extra">Gift wrap</pk-switch><pk-card slot="main-before" heading="Before">b</pk-card><pk-card slot="main-after" heading="After">a</pk-card></pk-record-page>');
        page.load = async () => ({ name: 'Widget', tail: 'x' });
        page.save = async () => {};
        page.config = { id: '7', fields: [{ key: 'name', label: 'Name' }, { key: 'extra', label: 'Extras', kind: 'custom' }, { key: 'tail', label: 'Tail' }] };
        for (let i = 0; i < 40 && page.part('edit').hidden; i++) await wait(50);
        await t.load(page.shadowRoot); await t.settle();
        page.part('edit').click(); await t.settle();
        const group = page.part('main').querySelector('pk-field-group');
        await t.load(group.shadowRoot); await t.settle(); await t.settle();
        const fields = [...group.shadowRoot.querySelectorAll('pk-field')], sw = page.querySelector('pk-switch'), r = n => n.getBoundingClientRect();
        t.eq(fields.length, 3, 'three fields, the custom one included');
        t.ok(r(sw).width > 0 && r(sw).top >= r(fields[0]).bottom - 1 && r(sw).bottom <= r(fields[2]).top + 1, 'the editor child sits between the first and third field');
        const before = page.querySelector('[slot=main-before]'), after = page.querySelector('[slot=main-after]');
        t.ok(r(before).bottom <= r(group).top + 1 && r(after).top >= r(group).bottom - 1, 'the sections stay above and below the form in edit mode');
        page.remove();
    }],
);

// Issue 1552: titled sections in the main column, editable sidebar cards that save and validate with the form, and a cancel event.
headerCases.push(
    ['record-page: config.sections are titled cards stacked in the main column, the sidebar card beside them is editable, and one Save collects and validates every group (#1552)', async t => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const page = await t.mount('<pk-record-page></pk-record-page>');
        let saved = null, cancelled = 0;
        page.load = async () => ({ name: 'Widget', city: 'Oslo', note: 'n', active: false });
        page.save = async v => { saved = v; };
        page.addEventListener('pk-record-cancel', () => { cancelled++; });
        page.config = {
            id: '7', heading: 'Details', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'city', label: 'City' }, { key: 'note', label: 'Note' }, { key: 'active', label: 'Active', kind: 'checkbox' }],
            sections: [{ heading: 'Address', fields: ['city'] }, { heading: 'Notes', fields: ['note'] }], sidebar: [{ heading: 'Status', fields: ['active'] }],
        };
        for (let i = 0; i < 40 && page.part('edit').hidden; i++) await wait(50);
        await t.load(page.shadowRoot); await t.settle();
        const lists = [...page.part('main').querySelectorAll('pk-field-list')];
        t.eq(lists.map(l => l.getAttribute('heading')).join(), 'Details,Address,Notes', 'view mode: a titled list per section');
        page.part('edit').click(); await t.settle();
        const cards = [...page.part('main').querySelectorAll('pk-card')], side = page.part('side').querySelector('pk-card');
        t.eq(cards.map(c => c.getAttribute('heading')).join(), 'Details,Address,Notes', 'edit mode: a titled card per section');
        t.ok(cards.every((c, i) => i === 0 || rect(c).top >= rect(cards[i - 1]).bottom - 1), 'the section cards are stacked, none overlapping');
        t.ok(side && rect(side).left >= rect(page.part('main')).right - 1, 'the sidebar card sits beside the main column');
        const groups = [...page.part('layout').querySelectorAll('pk-field-group')];
        t.eq(groups.length, 4, 'three section groups and one sidebar group');
        for (const g of groups) await t.load(g.shadowRoot);
        await t.settle(); await t.settle();
        t.eq(page.controls().length, 4, 'controls() spans every group');
        const box = side.querySelector('pk-field-group').shadowRoot.querySelector('pk-checkbox');
        t.ok(box && rect(box).width > 0, 'the sidebar checkbox is drawn');
        box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle();
        t.ok(page.dirty, 'editing a sidebar field marks the page dirty');
        const name = page.controls()[0]; name.value = ''; name.dispatchEvent(new Event('input', { bubbles: true, composed: true })); name.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle();
        page.part('save').click(); await t.settle(); await wait(200);
        t.ok(saved === null, `a required main field blocks the save`);
        name.value = 'Gadget'; name.dispatchEvent(new Event('input', { bubbles: true, composed: true })); name.dispatchEvent(new Event('change', { bubbles: true, composed: true })); await t.settle(); await wait(100);
        page.part('save').click();
        for (let i = 0; i < 40 && !saved; i++) await wait(50);
        t.ok(saved && saved.name === 'Gadget' && saved.active === true && saved.city === 'Oslo' && saved.note === 'n', `Save collects the sections and the sidebar: ${JSON.stringify(saved)}`);
        for (let i = 0; i < 40 && page.mode !== 'view'; i++) await wait(50);
        page.part('edit').click(); await t.settle();
        page.part('cancel').click(); await t.settle();
        t.eq(cancelled, 1, 'Cancel raises pk-record-cancel'); t.eq(page.mode, 'view', 'and returns to view mode');
        page.remove();
    }],
);
