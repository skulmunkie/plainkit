// Browser cases for the section nav of pk-settings-page (#334). Same contract as cases.js: [name, async (t) => void].
// A phone is only a phone when the frame is: media queries answer to the iframe's width, so each case renders the page in a sample frame of the width under test.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const rect = el => el.getBoundingClientRect();
const shown = el => getComputedStyle(el).display !== 'none' && rect(el).width > 0;

const field = (key, label) => ({ key, type: 'text', label });
const SECTIONS = ['Profile', 'Notifications', 'Billing', 'Security'].map(heading => ({ heading, fields: [1, 2, 3, 4, 5, 6].map(i => field(`${heading.toLowerCase()}${i}`, `${heading} ${i}`)) }));

async function frame(t, width, height, config = { sections: SECTIONS }) {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc('<pk-settings-page></pk-settings-page>'); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-settings-page'), 'pk-settings-page to be defined in the frame');
    const page = f.contentDocument.querySelector('pk-settings-page');
    page.config = config;
    await until(() => page.shadowRoot.querySelectorAll('pk-card').length === config.sections.length, 'the cards');
    await until(() => win.customElements.get('pk-card') && win.customElements.get('pk-nav-item') && win.customElements.get('pk-detail-layout'), 'the elements the page draws');
    await t.settle(); await wait(120);
    const cards = [...page.shadowRoot.querySelectorAll('pk-card')];
    const items = [...page.part('nav').children];
    return { doc: f.contentDocument, win, page, cards, items, scroller: f.contentDocument.scrollingElement };
}
const currentItems = items => items.filter(i => i.hasAttribute('current') && i.row.getAttribute('aria-current') === 'page');

export const settingsNavCases = [
    ['settings-page nav (1280px): the nav sits left of the first card, level with its top, and stays in view after scrolling 800px', async t => {
        const { win, page, cards, items, scroller } = await frame(t, 1280, 500);
        t.eq(items.length, 4, 'one item per section');
        t.ok(shown(page.part('nav')), 'the nav is drawn');
        t.ok(rect(page.part('nav')).right <= rect(cards[0]).left + 1, `the nav's right edge (${rect(page.part('nav')).right}) is left of the first card (${rect(cards[0]).left})`);
        t.ok(Math.abs(rect(page.part('nav')).top - rect(cards[0]).top) <= 2, `the nav top (${rect(page.part('nav')).top}) aligns with the first card top (${rect(cards[0]).top})`);
        t.ok(!shown(page.part('layout').part('tabs')), 'no tab strip on a wide screen');
        win.scrollTo(0, 800); await wait(250);
        t.ok(scroller.scrollTop > 400, `the page scrolled (${scroller.scrollTop})`);
        const r = rect(page.part('nav'));
        t.ok(r.top >= 0 && r.top < 100 && r.bottom <= win.innerHeight, `the nav is still in the viewport (top ${r.top})`);
        t.eq(currentItems(items).length, 1, 'exactly one item is current while scrolling');
        t.ok(items.indexOf(currentItems(items)[0]) > 0, 'the scroll spy moved past the first section');
    }],
    ['settings-page nav (375px): no nav column, the section tab strip sits above the cards, and each tab is at least 44px tall', async t => {
        const { page, cards, items } = await frame(t, 375, 700);
        t.ok(!shown(page.part('nav')), 'no nav column on a phone');
        const tabs = page.part('layout').part('tabs');
        t.ok(shown(tabs), 'pk-detail-layout draws its tab strip');
        t.ok(rect(tabs).bottom <= rect(cards[0]).top + 1, 'the strip is above the cards');
        const tab = [...tabs.querySelectorAll('pk-tab')];
        t.eq(tab.length, 4, 'a tab per section');
        t.eq(tab.map(x => x.textContent.trim()).join(), items.map(i => i.textContent.trim()).join(), 'the tabs carry the section names');
        for (const x of tab) t.ok(rect(x).height >= 43.5, `${x.textContent.trim()} tab is at least 44px tall (${rect(x).height})`);
        t.eq(cards.filter(shown).length, 1, 'one section at a time');
    }],
    ['settings-page nav (375px, #1758): the tab strip is position: sticky, opaque, and pinned to the top while the cards scroll under it; at rest it does not touch the first card', async t => {
        const { win, page, cards, scroller } = await frame(t, 375, 500);
        const tabs = page.part('layout').part('tabs');
        t.eq(getComputedStyle(tabs).position, 'sticky', 'the strip sticks');
        t.ok(rect(tabs).bottom <= rect(cards[0]).top + 0.5, `at rest the strip (bottom ${rect(tabs).bottom}) ends above the first card (top ${rect(cards[0]).top})`);
        t.ok(getComputedStyle(tabs).backgroundColor !== 'rgba(0, 0, 0, 0)', 'the strip has a background, so scrolled cards do not show through');
        win.scrollTo(0, 400); await wait(250);
        t.ok(scroller.scrollTop > 100, `the page scrolled (${scroller.scrollTop})`);
        t.ok(Math.abs(rect(tabs).top) <= 1, `the strip is pinned to the top (${rect(tabs).top})`);
    }],

    ['settings-page nav (1280px): activating an item scrolls its card into view, focuses it, and exactly one item has aria-current', async t => {
        const { doc, page, cards, items, scroller } = await frame(t, 1280, 500);
        items[3].row.click(); await wait(300);
        t.ok(scroller.scrollTop > 0, 'the page scrolled');
        t.ok(rect(cards[3]).top >= -2 && rect(cards[3]).top < 120, `the card is at the top of the viewport (${rect(cards[3]).top})`);
        t.ok(page.shadowRoot.activeElement === cards[3], 'focus is on the card');
        t.eq(currentItems(items).length, 1, 'exactly one item is current');
        t.ok(items[3].hasAttribute('current'), 'it is the chosen one');
        t.eq(doc.defaultView.location.hash, '', 'the address did not change');
        items[1].row.click(); await wait(300);
        t.ok(currentItems(items).length === 1 && items[1].hasAttribute('current'), 'choosing another moves it');
    }],
    ['settings-page nav (1280px): the sticky save bar stays flush at the bottom beside the nav and does not cover the last card at the end', async t => {
        const { win, page, cards, scroller } = await frame(t, 1280, 500);
        const input = page.shadowRoot.querySelector('pk-input');
        input.value = 'changed'; input.dispatchEvent(new win.CustomEvent('pk-value-change', { bubbles: true, composed: true })); await t.settle(); await wait(100);
        const bar = page.part('bar');
        t.ok(!bar.hidden && shown(bar), 'the bar appears for an unsaved change');
        t.ok(Math.abs(rect(bar).bottom - win.innerHeight) <= 2, `the bar is flush with the bottom of the viewport (${rect(bar).bottom} of ${win.innerHeight})`);
        scroller.scrollTop = scroller.scrollHeight; await wait(250);
        t.ok(win.innerHeight - rect(bar).bottom <= 16 && rect(bar).bottom <= win.innerHeight, `at the end of the page the bar rests within the page's bottom margin (${rect(bar).bottom} of ${win.innerHeight})`);
        const last = rect(cards[cards.length - 1]);
        t.ok(last.bottom <= rect(bar).top + 1, `the last card (${last.bottom}) ends above the bar (${rect(bar).top})`);
        t.ok(rect(page.part('nav')).bottom <= rect(bar).top + 1, 'the nav does not run under the bar');
    }],
    ['settings-page nav (1280px): an unsaved edit survives switching sections, and the nav is off for two sections or nav: false', async t => {
        const { win, page, cards, items } = await frame(t, 1280, 500);
        const input = page.shadowRoot.querySelector('pk-input');
        input.value = 'kept'; input.dispatchEvent(new win.CustomEvent('pk-value-change', { bubbles: true, composed: true })); await t.settle();
        items[2].row.click(); await wait(200); items[3].row.click(); await wait(200);
        t.ok(!page.part('bar').hidden, 'the Save bar is still shown');
        t.eq(input.value, 'kept', 'the value is intact');
        t.eq(page.currentValues()[input.name ?? 'profile1'] ?? input.value, 'kept');
        page.config = { sections: SECTIONS.slice(0, 2) }; await wait(200);
        t.ok(!shown(page.part('nav')), 'two sections draw no nav');
        t.eq(page.shadowRoot.querySelectorAll('pk-card').length, 2);
        page.config = { sections: SECTIONS, nav: false }; await wait(200);
        t.ok(!shown(page.part('nav')), 'nav: false draws none');
        t.ok(cards.length === 4);
    }],
    ['settings-page: a select field with styled is the themed list (a select-mode combobox), a plain select stays native, and a pick reaches the page values (#1646)', async t => {
        const options = [{ value: 'web', label: 'Web' }, { value: 'live', label: 'Live' }];
        const { page } = await frame(t, 1280, 600, { sections: [{ heading: 'General', fields: [
            { key: 'styledSel', type: 'select', label: 'Channel', styled: true, options },
            { key: 'plainSel', type: 'select', label: 'Native', options },
        ] }, ...SECTIONS.slice(1)] });
        const combo = page.shadowRoot.querySelector('pk-combobox'), native = page.shadowRoot.querySelector('pk-select');
        t.ok(combo && native, 'the styled select is a pk-combobox and the plain one stays pk-select');
        t.eq(combo.getAttribute('mode'), 'select', 'in select mode');
        t.eq(combo.querySelectorAll('option').length, 2, 'the options carried over');
        combo.part('trigger').click(); await t.settle();
        const pop = combo.part('popup');
        t.ok(pop && rect(pop).height > 40, 'the themed list opens');
        combo.value = 'live'; combo.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(page.currentValues().styledSel, 'live', 'the pick is read as the field value');
        t.ok(!page.part('discard').hidden && getComputedStyle(page.part('discard')).display !== 'none', 'the pick marks the page changed (the save bar shows)');
    }],
];
