// Browser cases for pk-sections-page (#2010): docked section tabs, one section at a time, both-way sync with the layout, tab-param, the actions and the phone overflow menu
// (a pk-dropdown among the actions, #1737). Same contract as cases.js: [name, async (t) => void]. A phone is only a phone when the frame is, so each case renders in a frame of the width under test.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const rect = el => el.getBoundingClientRect();
const shown = el => !!el && getComputedStyle(el).display !== 'none' && rect(el).width > 0 && rect(el).height > 0;

const CONFIG = {
    heading: 'Blue mug', breadcrumb: [{ label: 'Products', href: '#' }, { label: 'Blue mug' }], actionsOverflow: 'phone',
    sections: [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders', count: 3 }, { id: 'audit', label: 'Audit', visible: false }],
    actions: [{ key: 'edit', label: 'Edit', variant: 'primary' }, { key: 'archive', label: 'Archive', variant: 'ghost' }],
};
const WIDE = { ...CONFIG, tabsFrom: 'tablet', stickyFrom: 'tablet', sections: [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders' }, { id: 'audit', label: 'Status', side: true }] };
const MARKUP = '<pk-sections-page><pk-card id="d" slot="section-details" heading="Details">Details body</pk-card><pk-card id="ds" slot="side-details" heading="Status">Active</pk-card><pk-card id="o" slot="section-orders" heading="Orders">Orders body</pk-card><pk-card id="a" slot="section-audit" heading="Audit">Audit body</pk-card><pk-dropdown slot="actions"><pk-button slot="trigger" variant="ghost">More</pk-button><pk-menu-item>Duplicate</pk-menu-item><pk-menu-item>Export</pk-menu-item></pk-dropdown></pk-sections-page>';

async function frame(t, width, height = 700, config = CONFIG) {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc(MARKUP); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-sections-page'), 'pk-sections-page to be defined in the frame');
    const doc = f.contentDocument, page = doc.querySelector('pk-sections-page');
    page.config = config;
    await until(() => page.shadowRoot.querySelectorAll('pk-tab').length >= 2 && ['pk-page-shell', 'pk-page-header', 'pk-detail-layout', 'pk-tabs', 'pk-card', 'pk-dropdown'].every(n => win.customElements.get(n)), 'the tabs and the elements the page draws');
    await t.settle(); await wait(150);
    const header = page.part('header').shadowRoot.querySelector('pk-page-header');
    return { doc, win, page, header, layout: page.part('layout'), strip: page.part('tabs'), d: doc.getElementById('d'), ds: doc.getElementById('ds'), o: doc.getElementById('o'), a: doc.getElementById('a') };
}

export const sectionsPageCases = [
    ['sections-page (1280px): the tabs are docked in the header above the content, only the first section shows, and a section marked visible false has no tab and no panel', async t => {
        const { page, strip, d, ds, o, a } = await frame(t, 1280);
        const tabs = [...strip.querySelectorAll('pk-tab')];
        t.eq(tabs.length, 2, 'a tab per visible section, none for the hidden one');
        t.ok(shown(strip), 'the strip is drawn');
        t.ok(rect(strip).bottom <= rect(d).top + 1, `the strip (bottom ${rect(strip).bottom}) is above the first panel (top ${rect(d).top})`);
        t.ok(rect(strip).top < rect(page.part('layout')).top, 'the strip sits in the header, above the layout');
        t.ok(shown(d) && shown(ds), 'Details and its summary card show');
        t.ok(!shown(o) && !shown(a), 'Orders and the hidden Audit do not');
        t.ok(rect(ds).left >= rect(d).right - 1, 'the summary card is beside the main column on a wide screen');
        t.eq(strip.value, 'details', 'the first tab is selected');
    }],
    ['sections-page (1280px): a chosen tab shows its section, the layout keeps the tab in step both ways, a cancelled change keeps the old tab, a section the host cancels stays put', async t => {
        const { page, layout, strip, d, ds, o } = await frame(t, 1280);
        const events = [];
        page.addEventListener('pk-section-change', e => events.push(e.detail.section));
        strip.querySelector('pk-tab[value=orders]').click(); await wait(200);
        t.ok(shown(o) && !shown(d) && !shown(ds), 'Orders shows alone after its tab is chosen');
        t.ok(rect(o).width > rect(layout).width - 2, `a section with no summary card takes the full width (${rect(o).width} of ${rect(layout).width})`);
        t.eq(layout.section, 'orders', 'the layout follows the tab');
        t.eq(page.section, 'orders', 'the page reports the section');
        t.ok(events.includes('orders'), 'pk-section-change reaches the page');
        layout.pick('details'); await wait(200);
        t.eq(strip.value, 'details', 'a change made through the layout moves the tab');
        t.ok(shown(d), 'Details shows again');
        page.addEventListener('pk-section-change', e => e.preventDefault(), { once: true });
        strip.querySelector('pk-tab[value=orders]').click(); await wait(250);
        t.eq(layout.section, 'details', 'the cancelled change keeps the section');
        t.eq(strip.value, 'details', 'and the tab goes back');
    }],
    ['sections-page (1280px): the primary action and the others are drawn in the title bar and no overflow button shows on a wide screen', async t => {
        const { page, header } = await frame(t, 1280);
        const buttons = [...page.part('header').querySelectorAll('pk-button[slot=actions]')];
        t.eq(buttons.map(b => b.textContent.trim()).join(), 'Edit,Archive', 'the config actions are drawn');
        t.eq(buttons[0].variant, 'primary', 'the primary action is the first');
        t.ok(shown(buttons[0]), 'Edit is visible');
        t.ok(!shown(header.shadowRoot.querySelector('[part~=overflow]')), 'no overflow menu button at desktop width');
    }],
    ['sections-page (390px): the actions fold into one overflow button, a pk-dropdown among them is flattened into the menu (#1737), the tabs stay docked and one section shows', async t => {
        const { doc, page, header, strip, d, o } = await frame(t, 390, 800);
        const more = header.shadowRoot.querySelector('[part~=overflow]');
        await until(() => shown(more), 'the overflow button');
        t.ok(!shown(page.part('header').querySelector('pk-button[slot=actions]')), 'the action buttons themselves are folded away');
        const items = [...more.querySelectorAll('pk-menu-item')].map(i => i.textContent.trim());
        t.eq(items.join(), 'Edit,Archive,Duplicate,Export', 'the menu lists the actions and the dropdown items');
        t.ok(shown(strip), 'the tabs are still docked');
        t.ok(shown(d) && !shown(o), 'one section at a time');
        t.ok(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1, 'the page does not scroll sideways');
    }],
    ['sections-page (#2010): newAction is the primary action and a group menu sits beside it at 1280px; at 390px the primary action stays reachable (first row of the overflow menu) and the group items are in the menu', async t => {
        const cfg = { ...CONFIG, actionsOverflow: 'phone', newAction: { key: 'new', label: 'New order', icon: 'plus' }, actions: [{ key: 'edit', label: 'Edit', group: 'More' }, { key: 'archive', label: 'Archive', group: 'More' }] };
        const wide = await frame(t, 1280, 700, cfg);
        const btns = [...wide.page.part('header').querySelectorAll('pk-button[slot=actions]')];
        t.eq(btns[0].textContent.trim(), 'New order', 'the new action is first');
        t.eq(btns[0].variant, 'primary', 'and primary');
        t.ok(shown(btns[0]) && shown(wide.page.part('header').querySelector('pk-dropdown[slot=actions]')), 'the primary action and the group menu are both drawn');
        const phone = await frame(t, 390, 800, cfg);
        const more = phone.header.shadowRoot.querySelector('[part~=overflow]');
        await until(() => shown(more), 'the overflow button');
        const items = [...more.querySelectorAll('pk-menu-item')].map(i => i.textContent.trim());
        t.ok(items[0] === 'New order' && items.includes('Edit') && items.includes('Archive'), 'the overflow menu lists the primary action first, then the group items: ' + items.join());
        t.ok(phone.doc.documentElement.scrollWidth <= phone.doc.documentElement.clientWidth + 1, 'the page does not scroll sideways');
    }],
    ['sections-page: tab-param writes the chosen section to the query (other parameters and hash kept, no history entry) and opens on the section a link names; a bad value is ignored (#2010)', async t => {
        const make = async () => {
            const el = await t.mount('<pk-sections-page><pk-card id="d" slot="section-details">D</pk-card><pk-card id="o" slot="section-orders">O</pk-card></pk-sections-page>');
            el.config = { tabParam: 'tab', sections: [{ id: 'details', label: 'Details' }, { id: 'orders', label: 'Orders' }] };
            await t.load(el.shadowRoot); await t.settle(); await t.settle(); await wait(150);
            return el;
        };
        const before = location.href, len = history.length;
        try {
            history.replaceState(null, '', '?x=1#h');
            const el = await make();
            t.eq(el.part('tabs').value, 'details', 'no parameter: the first section');
            el.part('tabs').querySelector('pk-tab[value=orders]').click(); await t.settle(); await wait(150);
            t.eq(location.search, '?x=1&tab=orders', 'the chosen section is written, other parameters kept'); t.eq(location.hash, '#h', 'the hash is kept'); t.eq(history.length, len, 'no history entry is added');
            const again = await make();
            t.eq(again.part('tabs').value, 'orders', 'a link carrying the parameter opens on that section');
            t.ok(shown(again.querySelector('#o')) && !shown(again.querySelector('#d')), 'and shows only that section');
            history.replaceState(null, '', '?tab=nope');
            t.eq((await make()).part('tabs').value, 'details', 'a value matching no section is ignored');
        } finally { history.replaceState(null, '', before); }
    }],
    // #2084: every section together above config.tabsFrom, the tab strip and one section below it, the title bar pinned from stickyFrom up.
    ['sections-page tabsFrom (1280px): every section shows together, the side section sits beside the main column, and no tab strip is drawn (#2084)', async t => {
        const { strip, d, o, a } = await frame(t, 1280, 700, WIDE);
        t.ok(shown(d) && shown(o) && shown(a), 'Details, Orders and the side section all show');
        t.ok(rect(o).top >= rect(d).bottom - 1, 'the main column stacks Details above Orders');
        t.ok(rect(a).left >= rect(d).right - 1 && rect(a).left >= rect(o).right - 1, `the side section (left ${rect(a).left}) sits beside the main column (right ${rect(d).right})`);
        t.ok(!shown(strip), 'the tab strip is not drawn at a wide width');
    }],
    ['sections-page tabsFrom (600px): below the breakpoint the strip returns and one section shows at a time, the side section as its own tab (#2084)', async t => {
        const { strip, d, o, a } = await frame(t, 600, 700, WIDE);
        t.ok(shown(strip), 'the tab strip is drawn');
        t.eq(strip.querySelectorAll('pk-tab').length, 3, 'a tab per section, the side one included');
        t.ok(shown(d) && !shown(o) && !shown(a), 'only the first section shows');
        strip.querySelector('pk-tab[value=audit]').click(); await wait(250);
        t.ok(shown(a) && !shown(d), 'the side section shows alone when chosen');
    }],
    ['sections-page stickyFrom (1280px): the title bar stays at the top after the page scrolls 800px (#2084)', async t => {
        const { win, doc, d, header } = await frame(t, 1280, 600, WIDE);
        const pad = doc.createElement('div'); pad.style.height = '2400px'; d.append(pad);
        doc.documentElement.scrollTop = 800; win.dispatchEvent(new win.Event('scroll')); await wait(250);
        t.ok(win.scrollY >= 700, `the page scrolled (${win.scrollY})`);
        t.ok(Math.abs(rect(header).top) <= 2, `the title bar is pinned at the top (top ${rect(header).top})`);
    }],
];
