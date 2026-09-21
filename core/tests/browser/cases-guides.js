// Browser cases for the Guides page (site/guides/): the real page in a frame 1280px and 375px wide, so its media queries answer to the frame. Same contract as
// cases.js: [name, async (t) => void]. What a headless node test cannot see: the side nav, toc and pager as upgraded elements, real scrolling, focus and keys.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const shown = el => getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;

// Opens the page at a hash and waits until it has painted a guide (or the list), its elements are defined and the toc has read the headings.
async function open(t, hash, { width = 1280, height = 800, theme = 'dark', toc = true } = {}) {
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'Guides page'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../site/guides/index.html?theme=${theme}${hash}`, import.meta.url).href; host.append(f); await loaded;
    const win = f.contentWindow, doc = f.contentDocument;
    await until(() => doc.getElementById('gd-body')?.firstElementChild && doc.getElementById('gd-title').textContent, 'the guide to paint');
    await until(() => ['pk-side-nav', 'pk-nav-item', 'pk-toc', 'pk-breadcrumb', 'pk-pager', 'pk-code-block', 'pk-card', 'pk-alert'].every(n => !doc.querySelector(n) || win.customElements.get(n)), 'the elements to be defined');
    const $ = id => doc.getElementById(id);
    if (toc) await until(() => $('gd-toc').shadowRoot?.querySelector('a'), 'the toc to list the headings');
    await t.settle(); await wait(400);
    const problems = () => win.PkLog.getLogBuffer().filter(e => e.level === 'warn' || e.level === 'error').map(e => `${e.scope}: ${e.message}`);
    const links = () => [...$('gd-toc').shadowRoot.querySelectorAll('a')];
    return { f, win, doc, $, problems, links, scroller: $('gd-scroll'), nav: $('gd-nav'), items: [...doc.querySelectorAll('#gd-nav pk-nav-item')] };
}
const hashIs = (p, re, what) => until(() => re.test(p.win.location.hash), what);
const rgb = c => { const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?/.exec(c); return m && Number(m[4] ?? 1) > 0.99 ? [1, 2, 3].map(i => Number(m[i])) : null; };
const backdrop = el => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c) return c; } return null; }; // the first opaque background behind an element
const luminance = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

export const guidesCases = [
    ['guides (1280px): the side nav lists every guide and marks the open one, the page shows its title, breadcrumb, table of contents and pager, and nothing was logged as a problem', async t => {
        const p = await open(t, '#/getting-started');
        t.eq(p.items.length, 4, 'one nav item per guide');
        t.eq(p.items.filter(i => i.hasAttribute('current')).map(i => i.dataset.guide).join(), 'getting-started', 'the open guide is current');
        t.ok(shown(p.nav), 'the nav is a column, not a hidden drawer');
        t.eq(p.$('gd-title').textContent, 'Getting started with the SDK');
        t.eq(p.doc.querySelectorAll('h1').length, 1, 'one h1 on the page');
        t.eq(p.doc.title, 'Getting started with the SDK - Guides - Plainkit');
        const crumb = p.$('gd-crumbs');
        t.eq(crumb.querySelector('a').getAttribute('href'), '#/'); t.eq(crumb.querySelector('[aria-current="page"]').textContent, 'Getting started with the SDK');
        const headings = [...p.$('gd-body').querySelectorAll('h2, h3')];
        t.ok(headings.length >= 5 && headings.every(h => h.id), 'every heading has an id');
        t.eq(p.links().length, headings.length, 'the toc lists every h2 and h3');
        t.eq(p.links().map(a => a.getAttribute('href').slice(1)).join(), headings.map(h => h.id).join(), 'in order, pointing at those ids');
        t.ok(shown(p.$('gd-toc')), 'the toc is visible beside the article');
        t.ok([...p.$('gd-body').querySelectorAll('pk-code-block')].some(b => b.shadowRoot.querySelector('[part="code"]')?.textContent.includes('initPlainkit')), 'a code sample renders in a pk-code-block');
        t.ok(p.$('gd-body').querySelector('pk-alert'), 'the blockquote is a pk-alert');
        t.ok(!p.$('gd-pager').querySelector('[slot="prev"]') && p.$('gd-pager').querySelector('[slot="next"]').getAttribute('href') === '#/getting-started-blazor', 'the first guide has a next link and no previous');
        t.eq(p.problems().join('; '), '', 'no warning or error was logged');
    }],

    ['guides: the previous and next links walk the guides in order, the address follows, and focus lands on the new title', async t => {
        const p = await open(t, '#/getting-started');
        p.$('gd-pager').querySelector('[slot="next"]').click();
        await hashIs(p, /^#\/getting-started-blazor$/, 'the second guide');
        await until(() => p.$('gd-title').textContent === 'Getting started with Blazor', 'its title');
        await until(() => p.doc.activeElement === p.$('gd-title'), 'focus on the title');
        t.eq(p.items.filter(i => i.hasAttribute('current')).map(i => i.dataset.guide).join(), 'getting-started-blazor');
        t.eq(p.$('gd-pager').querySelector('[slot="prev"]').getAttribute('href'), '#/getting-started'); t.eq(p.$('gd-pager').querySelector('[slot="next"]').getAttribute('href'), '#/theming');
        t.eq(p.scroller.scrollTop, 0, 'a new page starts at its top');
        p.$('gd-pager').querySelector('[slot="prev"]').click();
        await hashIs(p, /^#\/getting-started$/, 'back to the first');
        t.eq(p.problems().join('; '), '');
    }],

    ['guides: a table of contents link scrolls the article and not the page shell, marks the heading in view, and makes the address one that reloads to the same place', async t => {
        const p = await open(t, '#/getting-started');
        const target = p.links()[1], id = target.getAttribute('href').slice(1);
        target.click();
        await hashIs(p, new RegExp(`^#/getting-started/${id}$`), 'the address to name the heading');
        await until(() => p.scroller.scrollTop > 100, 'the article to scroll');
        t.eq(p.doc.scrollingElement.scrollTop, 0, 'the page shell did not move');
        const h = p.doc.getElementById(id), bar = p.doc.querySelector('.gd-bar').getBoundingClientRect();
        t.ok(h.getBoundingClientRect().top >= bar.bottom - 1, 'the heading sits below the sticky bar, not under it');
        await until(() => p.links().find(a => a.getAttribute('aria-current') === 'location')?.getAttribute('href') === `#${id}`, 'the toc to mark that heading');
        const reload = await open(t, p.win.location.hash);
        t.ok(reload.doc.getElementById(id).getBoundingClientRect().top >= reload.doc.querySelector('.gd-bar').getBoundingClientRect().bottom - 1, 'the copied address opens at the heading');
    }],

    ['guides: a heading has a permalink (named, empty until drawn) that copies to a deep link, and a deep link opens at its heading', async t => {
        const p = await open(t, '#/theming/change-a-token');
        const h = p.doc.getElementById('change-a-token');
        t.ok(h && h.getBoundingClientRect().top >= p.doc.querySelector('.gd-bar').getBoundingClientRect().bottom - 1 && h.getBoundingClientRect().top < 300, 'the deep link scrolled to the heading');
        const anchor = h.querySelector('a.anchor');
        t.eq(anchor.getAttribute('aria-label'), 'Link to this section'); t.eq(anchor.getAttribute('href'), '#change-a-token'); t.eq(anchor.textContent, '', 'no text of its own, so the toc and the heading text stay clean');
        const other = p.doc.getElementById('the-families-of-tokens');
        other.querySelector('a.anchor').click();
        await hashIs(p, /^#\/theming\/the-families-of-tokens$/, 'the permalink to become a deep link');
        await until(() => p.scroller.scrollTop > 0 && p.doc.scrollingElement.scrollTop === 0, 'the article to scroll without moving the shell');
        t.eq(p.problems().join('; '), '');
    }],

    ['guides: keyboard: the arrow keys move between the guides in the nav, an activated row opens its guide, and the toc links are in the tab order', async t => {
        const p = await open(t, '#/logging');
        const [first, second] = p.items;
        first.focusRow(); await t.settle();
        t.ok(p.doc.activeElement === first, 'the first row has focus');
        t.key(first, 'ArrowDown'); await t.settle();
        t.ok(p.doc.activeElement === second, 'ArrowDown moves to the next guide');
        t.key(second, 'End'); await t.settle();
        t.ok(p.doc.activeElement === p.items.at(-1), 'End moves to the last');
        t.key(p.items.at(-1), 'Home'); await t.settle();
        t.ok(p.doc.activeElement === first, 'Home moves to the first');
        second.shadowRoot.querySelector('a').click();
        await hashIs(p, /^#\/getting-started-blazor$/, 'the activated row to open its guide');
        await until(() => p.$('gd-title').textContent === 'Getting started with Blazor', 'its title');
        t.ok(p.links().every(a => a.tabIndex >= 0), 'the toc links are focusable');
        t.ok(p.$('gd-body').querySelector('a.anchor').tabIndex >= 0, 'so are the heading permalinks');
    }],

    ['guides (375px): no sideways scroll, the nav is a drawer opened by the Guides button, Escape closes it and choosing a guide closes it and opens the guide', async t => {
        const p = await open(t, '#/getting-started', { width: 375, height: 800 });
        t.ok(p.doc.documentElement.scrollWidth <= 375, 'the page fits the phone width');
        t.ok(p.$('gd-body').getBoundingClientRect().right <= 375 + 1, 'so does the article');
        for (const wrap of p.$('gd-body').querySelectorAll('.table-wrap')) t.ok(wrap.getBoundingClientRect().right <= 376, 'a table scrolls inside its own region');
        const button = p.$('gd-contents');
        t.ok(shown(button), 'the Guides button is shown'); t.ok(!shown(p.nav), 'the nav is off screen until asked');
        button.click(); await until(() => shown(p.nav), 'the drawer to open');
        t.ok(p.nav.hasAttribute('open') && button.hasAttribute('pressed'), 'the button shows it is pressed');
        t.key(p.items[0], 'Escape'); await until(() => !p.nav.hasAttribute('open'), 'Escape to close the drawer');
        t.ok(!button.hasAttribute('pressed'), 'the button follows');
        button.click(); await until(() => shown(p.nav), 'the drawer to open again');
        p.items[2].shadowRoot.querySelector('a').click();
        await hashIs(p, /^#\/theming$/, 'the chosen guide');
        await until(() => !p.nav.hasAttribute('open') && p.$('gd-title').textContent === 'Theming and tokens', 'the drawer to close on the new guide');
        t.ok(shown(p.$('gd-toc')) && p.links().length >= 5, 'the toc stays available above the article');
        t.eq(p.problems().join('; '), '');
    }],

    ['guides: the list page has a card per guide, and an unknown guide says so, offers the list and logs a warning', async t => {
        const list = await open(t, '#/', { toc: false });
        const cards = [...list.$('gd-body').querySelectorAll('pk-card')];
        t.eq(cards.length, 4); t.eq(cards.map(c => c.getAttribute('href')).join(), '#/getting-started,#/getting-started-blazor,#/theming,#/logging');
        t.ok(!list.items.some(i => i.hasAttribute('current')), 'no guide is current on the list'); t.eq(list.$('gd-aside').hidden, true, 'no toc on the list');
        const gone = await open(t, '#/no-such-guide', { toc: false });
        t.eq(gone.$('gd-title').textContent, 'Guide not found');
        t.eq(gone.$('gd-body').querySelector('pk-alert').getAttribute('kind'), 'warning'); t.eq(gone.$('gd-body').querySelector('a').getAttribute('href'), '#/');
        t.ok(gone.problems().some(m => /no guide named "no-such-guide"/.test(m)), 'the mistake is logged, not silent');
    }],

    ['guides: in both themes the article text and its code stay readable (4.5:1) and the page follows the theme', async t => {
        for (const theme of ['dark', 'light']) {
            const p = await open(t, '#/theming', { theme });
            t.eq(p.doc.documentElement.getAttribute('data-theme'), theme);
            const bg = backdrop(p.scroller);
            t.ok(bg, `the page has a background in ${theme}`);
            const check = (el, what) => { const c = rgb(getComputedStyle(el).color), ratio = contrast(c, bg); t.ok(ratio >= 4.5, `${theme}: ${what} is ${ratio.toFixed(2)}:1 on the page`); };
            check(p.$('gd-body').querySelector('p'), 'paragraph text'); check(p.$('gd-summary'), 'the summary'); check(p.$('gd-body').querySelector('h2'), 'a heading');
            check(p.links()[0], 'a toc link');
            const alert = p.$('gd-body').querySelector('pk-alert'); t.ok(alert && shown(alert), `${theme}: the alert is drawn`);
            t.eq(p.problems().join('; '), '');
        }
    }],
];
