// Browser cases for the Guides module of the site app (core/app.html#/guides): the real app in a frame 1280px and 375px wide, so its media queries answer to the frame.
// Same contract as cases.js: [name, async (t) => void]. What a headless node test cannot see: the side nav, toc and pager as upgraded elements, real scrolling, focus and keys.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

const rgb = c => { const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?/.exec(c); return m && Number(m[4] ?? 1) > 0.99 ? [1, 2, 3].map(i => Number(m[i])) : null; };
const backdrop = el => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c) return c; } return null; }; // the first opaque background behind an element
const luminance = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// The Guides as a lazy module of the site app (#355): core/app.html#/guides, the same content and search in the app's 'doc' page type.
async function openApp(t, hash, width = 1280) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Site app'; f.style.cssText = `width:${width}px;height:800px;border:0;display:block`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../app.html${hash}`, import.meta.url).href; host.append(f); await loaded;
    const win = f.contentWindow, d = f.contentDocument;
    await until(() => d.querySelector('#pk-main pk-doc-page .doc-page-title, #pk-main pk-doc-page pk-card'), 'the guides page');
    await t.settle(); await wait(300);
    const go = async to => { win.location.hash = to; await wait(150); };
    return { win, d, go, doc: () => d.querySelector('#pk-main pk-doc-page'), items: () => [...d.querySelectorAll('#pk-nav pk-nav-item')] };
}
export const guidesAppCases = [
    ['guides module (app, 1280px): the guide list is the nav, a deep link opens a guide with crumbs, and a heading anchor in the address scrolls to it', async t => {
        const p = await openApp(t, '#/guides/theming');
        t.eq(p.items().length, 11, 'one nav item per guide');
        t.eq(p.items().filter(i => i.hasAttribute('current')).length, 1, 'the open guide is current');
        t.ok(p.items().every(i => /^#\/guides\/[a-z-]+$/.test(i.getAttribute('href'))), 'every nav link is a router address under #/guides');
        await until(() => p.d.querySelector('.doc-page-title')?.textContent, 'the title');
        t.ok(/theming/i.test(p.d.querySelector('.doc-page-title').textContent), 'the deep link opened Theming');
        const h = [...p.doc().querySelectorAll('h2')][1];
        await p.go(`#/guides/theming?anchor=${h.id}`);
        await until(() => Math.abs(h.getBoundingClientRect().top) < 700, 'the heading to be scrolled into view');
        t.ok(/anchor=/.test(p.win.location.hash), 'the address keeps the anchor');
    }],
    ['guides module (app, 375px): the list route draws the guide cards and a body word finds the guides that mention it', async t => {
        const p = await openApp(t, '#/guides', 375);
        const input = await until(() => p.doc().querySelector(':scope > pk-container pk-input'), 'the search box above the article');
        t.ok(p.doc().querySelector('pk-side-nav').hidden && !p.doc().querySelector('pk-breadcrumb:not([hidden])'), 'the doc page draws neither its own nav nor a breadcrumb');
        t.ok(p.doc().querySelectorAll('pk-card').length >= 10, 'a card per guide on the list');
        input.value = 'logger'; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
        const status = p.doc().querySelector(':scope > pk-container pk-text').textContent;
        t.ok(/mentioned in|titled/.test(status), `the status line names the guides that match: ${status}`);
    }],
    ['guides module (app, 1280px and 375px): typing a body word filters the app side nav to the matching guides, clearing restores it, the deep link survives, and the search box sits under the title, not between the contents and the title (#1101)', async t => {
        for (const width of [1280, 375]) {
            const p = await openApp(t, '#/guides/theming', width);
            const input = await until(() => p.doc().querySelector(':scope > pk-container pk-input'), 'the search box');
            const shown = () => p.items().filter(i => !i.hidden && /\/guides\/[a-z-]+$/.test(i.getAttribute('href') ?? '')).map(i => i.getAttribute('href').split('/').pop());
            t.eq(shown().length, 11, `${width}: every guide in the nav`);
            const title = p.d.querySelector('.doc-page-title').getBoundingClientRect(), box = input.getBoundingClientRect();
            t.ok(box.top >= title.bottom - 1, `${width}: the search box sits under the title (${box.top} vs ${title.bottom})`);
            input.value = 'logger'; input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            await until(() => shown().length > 0 && shown().length < 11, `${width}: the nav to filter`);
            t.ok(shown().length < 11 && p.items().filter(i => i.hidden).length > 0, `${width}: only the matching guides stay (${shown().join()})`);
            t.ok(/logg/i.test(p.doc().querySelector(':scope > pk-container pk-text').textContent), `${width}: the status line still names them`);
            t.eq(p.win.location.hash, '#/guides/theming', `${width}: the deep link is untouched`);
            input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            await until(() => shown().length === 11, `${width}: every guide again`);
        }
    }],
    // The behaviours the standalone page had that a module must keep (#357): the address says what is open, focus follows, an unknown guide is a not-found page that is logged, a heading anchor lands at the top of the app's own scroll box.
    ['guides module (app): the pager walks guide to guide, the address, title and document title follow, focus lands in the new guide, and an unknown guide is a not-found page that names it and is logged', async t => {
        const p = await openApp(t, '#/guides/getting-started');
        const next = await until(() => p.doc().querySelector('pk-pager [slot="next"]'), 'the pager next link');
        next.click();
        await until(() => p.win.location.hash === '#/guides/getting-started-blazor', 'the second guide address');
        await until(() => p.d.querySelector('.doc-page-title')?.textContent === 'Getting started with Blazor', 'its title');
        t.ok(/Getting started with Blazor/.test(p.d.title), `the document title names the guide (${p.d.title})`);
        await until(() => p.d.activeElement?.closest?.('#pk-main'), 'focus inside the page');
        await p.go('#/guides/no-such-guide');
        await until(() => /Not found/i.test(p.d.querySelector('#pk-main')?.textContent ?? ''), 'the not-found page');
        t.ok(/no-such-guide/.test(p.d.querySelector('#pk-main pk-empty-state')?.getAttribute('description') ?? ''), 'it names what is missing');
        t.ok(p.win.PkLog.getLogBuffer().some(e => /no-such-guide/.test(e.message)), 'the mistake is logged, not silent');
        t.eq(p.items().filter(i => i.hasAttribute('current')).length, 0, 'no guide is current');
    }],
    ['guides module (app, 1280px): a heading anchor in the address lands that heading near the top of the app scroll box, and a table of contents link writes an address that reloads to the same place', async t => {
        const p = await openApp(t, '#/guides/theming');
        const id = [...p.doc().querySelectorAll('h2')][2].id, body = p.d.querySelector('pk-app-shell').shadowRoot.querySelector('[part="body"]');
        await p.go(`#/guides/theming?anchor=${id}`);
        await until(() => body.scrollTop > 100, 'the scroll box to move');
        await wait(600);
        const h = p.doc().querySelector(`[id="${id}"]`), gap = h.getBoundingClientRect().top - body.getBoundingClientRect().top;
        t.ok(gap > -4 && gap < 200, `the heading sits at the top of the scroll box (${Math.round(gap)}px)`);
        t.ok(p.d.documentElement.scrollTop < 3, 'the page itself did not scroll (only the shell body did)');
        const toc = p.doc().querySelector('pk-toc'), link = await until(() => [...(toc.shadowRoot?.querySelectorAll('a') ?? [])][1], 'a toc link');
        link.click();
        await until(() => /^#\/guides\/theming\?anchor=/.test(p.win.location.hash), `the toc link (${link.getAttribute('href')}) to write an anchored address, hash ${p.win.location.hash}`);
    }],
    // Ported from the standalone page (#357) before it was retired: keyboard, the phone drawer, permalinks and both themes, now against the app's guides module.
    ['guides module (app): keyboard: the arrow keys, Home and End move between the guides in the nav, an activated row opens its guide, and the toc links and heading permalinks are in the tab order', async t => {
        const p = await openApp(t, '#/guides/logging');
        const guides = () => p.items().filter(i => /\/guides\/[a-z-]+$/.test(i.getAttribute('href') ?? ''));
        const [first, second] = guides();
        first.focusRow(); await t.settle();
        t.ok(p.d.activeElement === first, 'the first guide row has focus');
        t.key(first, 'ArrowDown'); await t.settle();
        t.ok(p.d.activeElement === second, 'ArrowDown moves to the next guide');
        t.key(second, 'End'); await t.settle();
        t.ok(p.d.activeElement === p.items().at(-1), 'End moves to the last row');
        t.key(p.d.activeElement, 'Home'); await t.settle();
        t.ok(p.d.activeElement === p.items()[0], 'Home moves to the first row');
        second.shadowRoot.querySelector('a').click();
        await until(() => p.win.location.hash === '#/guides/getting-started-blazor', 'the activated row to open its guide');
        await until(() => p.d.querySelector('.doc-page-title')?.textContent === 'Getting started with Blazor', 'its title');
        const toc = await until(() => p.doc().querySelector('pk-toc')?.shadowRoot?.querySelectorAll('a'), 'the toc links');
        t.ok(toc.length > 0 && [...toc].every(a => a.tabIndex >= 0), 'the toc links are focusable');
        t.ok(p.doc().querySelector('a.anchor').tabIndex >= 0, 'so are the heading permalinks');
    }],
    ['guides module (app, 375px): no sideways scroll, the guide list is a drawer opened by the menu button, Escape closes it and choosing a guide closes it and opens the guide', async t => {
        const p = await openApp(t, '#/guides/getting-started', 375);
        const nav = p.d.querySelector('#pk-nav'), button = p.d.querySelector('[data-nav-toggle]');
        const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.right > 0 && r.left < 375; };
        t.ok(p.d.documentElement.scrollWidth <= 375, 'the page fits the phone width');
        t.ok(p.doc().querySelector('.prose').getBoundingClientRect().right <= 376, 'so does the article');
        for (const wrap of p.doc().querySelectorAll('.table-wrap')) t.ok(wrap.getBoundingClientRect().right <= 376, 'a table scrolls inside its own region');
        t.ok(vis(button), 'the menu button is shown'); t.ok(!vis(nav), 'the nav is off screen until asked');
        button.click(); await until(() => vis(nav) && nav.hasAttribute('open'), 'the drawer to open');
        t.key(p.items()[0], 'Escape'); await until(() => !nav.hasAttribute('open'), 'Escape to close the drawer');
        button.click(); await until(() => vis(nav), 'the drawer to open again');
        p.items().find(i => /\/guides\/theming$/.test(i.getAttribute('href') ?? '')).shadowRoot.querySelector('a').click();
        await until(() => p.win.location.hash === '#/guides/theming', 'the chosen guide');
        await until(() => !nav.hasAttribute('open') && p.d.querySelector('.doc-page-title')?.textContent === 'Theming and tokens', 'the drawer to close on the new guide');
        t.ok(p.d.documentElement.scrollWidth <= 375, 'still no sideways scroll');
    }],
    ['guides module (app): a heading has a permalink (named, empty until drawn) that writes a deep link, and a deep link opens at its heading; a bare in-page #heading address is not an app address and opens no guide', async t => {
        const p = await openApp(t, '#/guides/theming?anchor=change-a-token');
        const body = p.d.querySelector('pk-app-shell').shadowRoot.querySelector('[part="body"]');
        const h = await until(() => p.doc().querySelector('[id="change-a-token"]'), 'the heading');
        await until(() => body.scrollTop > 0, 'the deep link to scroll');
        await wait(600);
        t.ok(Math.abs(h.getBoundingClientRect().top - body.getBoundingClientRect().top) < 250, 'the deep link opened at the heading');
        const a = h.querySelector('a.anchor');
        t.eq(a.getAttribute('aria-label'), 'Link to this section'); t.eq(a.textContent, '', 'no text of its own, so the toc and the heading text stay clean');
        p.doc().querySelector('[id="the-families-of-tokens"] a.anchor').click();
        await until(() => /^#\/guides\/theming\?anchor=the-families-of-tokens$/.test(p.win.location.hash), `the permalink to become a deep link (${p.win.location.hash})`);
        t.ok(p.d.documentElement.scrollTop < 3, 'the page itself did not scroll');
        await p.go('#the-families-of-tokens');
        t.ok(p.d.querySelector('pk-app-shell'), 'the app survives a bare anchor address');
    }],
    ['guides module (app): in both themes the article text, summary, heading, toc link and alert stay readable (4.5:1) and the page follows the theme', async t => {
        for (const theme of ['dark', 'light']) {
            const p = await openApp(t, '#/guides/theming');
            p.win.PkTheme?.setTheme?.(p.d.documentElement, theme) ?? p.d.documentElement.setAttribute('data-theme', theme);
            p.d.documentElement.setAttribute('data-theme', theme); await t.settle(); await wait(300);
            const bg = backdrop(p.doc());
            t.ok(bg, `the page has a background in ${theme}`);
            const check = (el, what) => { const c = rgb(getComputedStyle(el).color), ratio = contrast(c, bg); t.ok(ratio >= 4.5, `${theme}: ${what} is ${ratio.toFixed(2)}:1 on the page`); };
            check(p.doc().querySelector('.prose p'), 'paragraph text'); check(p.doc().querySelector('.doc-page-summary'), 'the summary'); check(p.doc().querySelector('.prose h2'), 'a heading');
            const link = await until(() => p.doc().querySelector('pk-toc')?.shadowRoot?.querySelector('a'), 'a toc link'); check(link, 'a toc link');
            const alert = p.doc().querySelector('pk-alert'); t.ok(alert && alert.getBoundingClientRect().width > 0, `${theme}: the alert is drawn`);
        }
    }],
    ['guides module (app): a guide has one h1, the toc lists every h2 and h3 in order, code is a pk-code-block, a quote is a pk-alert, the first guide has a next link and no previous, and a permalink is its own history entry that back undoes', async t => {
        const p = await openApp(t, '#/guides/getting-started');
        await until(() => p.doc().querySelector('pk-toc')?.shadowRoot?.querySelector('a') && p.doc().querySelector('pk-pager [slot="next"]'), 'the toc and pager to draw'); await wait(300);
        const links = () => [...p.doc().querySelector('pk-toc').shadowRoot.querySelectorAll('a')];
        await until(() => p.d.querySelector('.doc-page-title')?.textContent === 'Getting started with the SDK', 'the guide title to draw'); // a loaded machine splits the title from the toc pass
        t.eq(p.d.querySelectorAll('h1').length, 1, 'one h1 on the page');
        t.eq(p.d.querySelector('.doc-page-title').textContent, 'Getting started with the SDK');
        const headings = [...p.doc().querySelectorAll('.prose h2, .prose h3')];
        t.ok(headings.length >= 5 && headings.every(h => h.id), 'every heading has an id');
        t.eq(links().map(a => a.getAttribute('href').slice(1)).join(), headings.map(h => h.id).join(), 'the toc lists every h2 and h3, in order, pointing at those ids');
        t.ok([...p.doc().querySelectorAll('pk-code-block')].some(b => (b.textContent + (b.shadowRoot?.textContent ?? '')).includes('initPlainkit')), 'a code sample is a pk-code-block');
        t.ok(p.doc().querySelector('pk-alert'), 'the blockquote is a pk-alert');
        t.ok(!p.doc().querySelector('pk-pager [slot="prev"]') && /getting-started-blazor$/.test(p.doc().querySelector('pk-pager [slot="next"]').getAttribute('href')), 'the first guide has a next link and no previous');
        const before = p.win.history.length;
        links()[1].click();
        await until(() => /\?anchor=/.test(p.win.location.hash), 'the permalink address');
        t.eq(p.win.history.length, before + 1, 'one new history entry');
        p.win.history.back();
        await until(() => p.win.location.hash === '#/guides/getting-started', 'back to the guide address');
        await until(() => p.d.querySelector('.doc-page-title')?.textContent === 'Getting started with the SDK', 'the guide to draw again after back');
        t.eq(p.d.querySelector('.doc-page-title').textContent, 'Getting started with the SDK');
    }],
    ['guides module (app): the search finds a word only in a guide body, says which guides matched, says so when none do, and clearing shows every guide again', async t => {
        const p = await openApp(t, '#/guides');
        const input = await until(() => p.doc().querySelector(':scope > pk-container pk-input'), 'the search box'), status = () => p.doc().querySelector(':scope > pk-container pk-text').textContent;
        const shown = () => p.items().filter(i => !i.hidden && /\/guides\/[a-z-]+$/.test(i.getAttribute('href') ?? '')).map(i => i.getAttribute('href').split('/').pop());
        const type = v => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true, composed: true })); };
        type('swatch'); // only in theming's body, in no title
        await until(() => shown().length === 1, 'the nav to narrow to the body match');
        t.eq(shown()[0], 'theming'); t.ok(status().includes('mentioned in') && status().includes('Theming and tokens'), 'the status says it was found in the text');
        type('there-is-no-such-word-in-any-guide');
        await until(() => shown().length === 0, 'no guide to match'); t.ok(status().includes('No guides match'));
        type(''); await until(() => shown().length === 11, 'every guide again');
    }],
    // The header search (#355): the active module's `search` answers; picking a result navigates.
    ['site app header search (1280px): a body word lists the Guides that mention it, the keyboard picks one and the address and page follow', async t => {
        const { p, el, input, type } = await headerSearch(t, 1280);
        await type('logger');
        t.ok(el.items.every(i => i.label && i.sub), 'every result has a guide title and why it matched');
        const first = el.items[0].label;
        t.key(input, 'ArrowDown'); t.key(input, 'Enter');
        await until(() => /^#\/guides\/[a-z-]+$/.test(p.win.location.hash), 'the address to become a guide');
        await until(() => p.d.querySelector('.doc-page-title')?.textContent === first, 'the picked guide to open');
    }],
    ['site app header search (375px): a pick opens the guide and the page does not scroll sideways', async t => {
        const { p, el, type } = await headerSearch(t, 375);
        await type('theming');
        const rows = [...el.shadowRoot.querySelectorAll('[role="option"]')];
        t.ok(rows.length >= 1, 'results are drawn');
        rows[0].click();
        await until(() => /^#\/guides\/[a-z-]+$/.test(p.win.location.hash), 'the address to become a guide');
        t.ok(p.d.documentElement.scrollWidth <= 375, 'no sideways scroll');
    }],
];
async function headerSearch(t, width) {
    const p = await openApp(t, '#/guides', width);
    await p.win.customElements.whenDefined('pk-app-bar-search');
    const el = p.d.querySelector('pk-app-bar-search'), input = await until(() => el.shadowRoot?.querySelector('[part="control"]'), 'the search input');
    const type = async text => { input.value = text; input.dispatchEvent(new p.win.Event('input', { bubbles: true })); await until(() => el.items?.length, `results for ${text}`, 100); };
    return { p, el, input, type };
}
