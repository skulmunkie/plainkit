// Browser cases for the Gallery's routing (site/gallery/gallery.js, #401): the real page in a frame, driven only through its address, so they hold whatever draws the routes. Deep links,
// the old addresses that keep working, back and forward, the query inside the hash (?q ?p) and a scoped mount's first route. Same contract as cases.js: [name, async (t) => void].
import { instrument } from './cases-app.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 120) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

// Opens the gallery page at a hash (and a query for the mount's options) and waits for its first view.
async function open(t, hash = '', search = '', width = 1280) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Gallery page'; f.style.cssText = `width:${width}px;height:900px;border:0`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../site/gallery/index.html${search}${hash}`, import.meta.url).href; host.append(f); await loaded;
    const win = f.contentWindow, doc = f.contentDocument;
    await until(() => doc.querySelector('#gx-view')?.firstElementChild, 'the first view');
    const heading = () => doc.querySelector('#gx-view pk-page-header')?.getAttribute('heading') ?? doc.querySelector('#gx-view pk-empty-state')?.getAttribute('heading') ?? '';
    const shows = (text, what) => until(() => heading() === text, `${what ?? text} (the page says "${heading()}")`);
    return { win, doc, heading, shows, go: async next => { win.location.hash = next; }, view: () => doc.querySelector('#gx-view') };
}

export const galleryCases = [
    ['gallery: every foundation, every overview and the sample lists draw a titled page, and none logs a problem or says "Not found" (the views are one module, #401)', async t => {
        const p = await open(t, '#/overview');
        const pages = { overview: '#/overview', foundations: '#/foundations', elements: '#/elements', samples: '#/samples', patterns: '#/samples/patterns', layouts: '#/samples/layouts', templates: '#/samples/templates' };
        for (const id of ['colours', 'typography', 'spacing', 'radii-shadows', 'breakpoints', 'utilities', 'icons', 'tokens']) pages[id] = `#/foundations/${id}`;
        for (const [name, hash] of Object.entries(pages)) {
            await p.go(hash);
            await until(() => p.heading() && p.heading() !== 'Not found' && (p.view().querySelector('pk-page-header, pk-card, pk-table, pk-grid')), `the ${name} page to draw`);
            t.ok(p.heading() !== 'Not found', `${name}: a titled page, not "Not found" (${p.heading()})`);
        }
        await p.go('#/samples/patterns'); const first = await until(() => p.view().querySelector('pk-card[href^="#/samples/patterns/"]')?.getAttribute('href'), 'a pattern card');
        await p.go(first); await until(() => p.view().querySelector('iframe.gx-page-frame'), 'the full-page frame of a pattern'); await until(() => p.doc.querySelector('#gx-title').textContent, 'the slim bar to carry the pattern title');
        const log = p.win.PkLog?.getLogBuffer?.() ?? [];
        t.eq(log.filter(e => e.level === 'warn' || e.level === 'error').map(e => `${e.scope}: ${e.message}`).join('; '), '', 'nothing was logged as a problem');
    }],

    ['gallery: mounting again ends the gallery on show, and destroy() leaves no listener, observer or timer behind and empties its container (#401)', async t => {
        const { mountGallery } = await import(new URL('../../site/gallery/gallery.js', import.meta.url).href);
        const inst = instrument();
        try {
            const host = t.stage('');
            const before = inst.snapshot();
            let last;
            for (let i = 0; i < 3; i++) last = await mountGallery(host, { chrome: 'full', init: false }); // each mount ends the one before it
            t.eq(host.querySelectorAll('#gx-view').length, 1, 'one gallery in the container, not three');
            document.dispatchEvent(new CustomEvent('site-search', { detail: 'flex' }));
            await wait(100);
            last.destroy();
            t.eq(host.childElementCount, 0, 'the container is empty');
            document.dispatchEvent(new CustomEvent('site-search', { detail: 'nothing' })); // nobody listens any more: this must not throw or draw
            await wait(300);
            const after = inst.snapshot();
            t.eq(after.listeners.join('\n'), before.listeners.join('\n'), 'no window or document listener is left');
            t.eq(after.observers, before.observers, 'no observer is left'); t.eq(after.timers, before.timers, 'no long timer is left');
            t.ok(typeof last.destroy === 'function', 'mountGallery resolves with the handle');
        } finally { inst.restore(); }
    }],

    ['gallery: a deep link opens its view, marks its nav row and names the page, for a foundation, an element, a sample list and a full-page sample', async t => {
        const p = await open(t, '#/foundations/colours');
        await p.shows('Colours');
        t.eq(p.doc.querySelector('pk-nav-item[current]')?.getAttribute('href'), '#/foundations/colours', 'the row of the open view is current');
        t.ok(/^foundations - /.test(p.doc.title), 'the section names the page');
        await p.go('#/elements/pk-button'); await p.shows('Button');
        t.eq(p.doc.querySelector('pk-nav-item[current]')?.getAttribute('href'), '#/elements/pk-button');
        await p.go('#/samples/templates'); await p.shows('Templates');
        t.ok(p.view().querySelector('pk-breadcrumb a[href="#/samples"]'), 'the list has its breadcrumb');
        await p.go('#/samples/layouts/shell');
        await until(() => p.doc.querySelector('#gx-view iframe.gx-page-frame'), 'the full-page frame');
        t.ok(/kind=layouts&id=shell/.test(p.doc.querySelector('iframe.gx-page-frame').src), 'the frame loads that layout');
        await until(() => p.doc.querySelector('#gx-title').textContent === 'App shell', 'the slim bar to carry the title');
        await until(() => p.doc.querySelector('#gx-back').href === '#/samples/layouts', 'and a way back to the list');
    }],

    ['gallery: the old addresses keep working: a control page is its element, layouts and templates live under samples, blocks and an unknown section are handled', async t => {
        const p = await open(t, '#/controls/forms-inputs/button');
        await p.shows('Button', 'the old control address to open the element page');
        await until(() => p.win.location.hash === '#/elements/pk-button', 'the address to be rewritten to the element\'s own');
        await p.go('#/layouts/shell');
        await until(() => /kind=layouts&id=shell/.test(p.doc.querySelector('iframe.gx-page-frame')?.src ?? ''), 'the old layout address to open the full page');
        await p.go('#/layouts'); await p.shows('Layouts');
        await until(() => p.win.location.hash === '#/samples/layouts', 'the old layouts address to become the samples one');
        await p.go('#/templates'); await p.shows('Templates');
        await p.go('#/templates/page');
        await until(() => p.doc.querySelector('iframe.gx-page-frame') && p.doc.querySelector('#gx-title').textContent !== 'App shell', 'the old template address to open the full page');
        await p.go('#/templates/block/anything'); await p.shows('Samples', 'the removed building blocks to land on the samples overview');
        await p.go('#/samples/blocks'); await p.shows('Samples');
        await p.go('#/controls/forms-inputs/no-such-element'); await p.shows('Elements', 'an unknown control to land on the elements overview');
        await p.go('#/nonsense/a/b'); await p.shows('Not found', 'an unknown section to say so');
    }],

    ['gallery: back and forward walk the views in order, and a reload of the address opens the same view', async t => {
        const p = await open(t, '#/foundations/colours');
        await p.shows('Colours');
        await p.go('#/foundations/typography'); await p.shows('Typography');
        await p.go('#/elements/pk-card'); await p.shows('Card');
        p.win.history.back(); await p.shows('Typography', 'back to typography');
        p.win.history.back(); await p.shows('Colours', 'back to colours');
        p.win.history.forward(); await p.shows('Typography', 'forward to typography');
        t.eq(p.doc.querySelector('pk-nav-item[current]')?.getAttribute('href'), '#/foundations/typography', 'the nav follows');
        const again = await open(t, p.win.location.hash); await again.shows('Typography', 'the copied address to open typography');
    }],

    ['gallery: the query inside the hash drives a list: ?q filters the utilities, ?p pages them, and going back restores the earlier list', async t => {
        const p = await open(t, '#/foundations/utilities');
        await p.shows('Utilities');
        const rows = () => [...p.view().querySelectorAll('pk-table tbody tr')];
        await until(() => rows().length >= 30, 'the first page of utilities');
        const all = rows().length;
        await p.go('#/foundations/utilities?q=flex');
        await until(() => rows().length > 0 && rows().length < all && rows().every(r => /flex/.test(r.cells[0].textContent)), 'only the matching utilities');
        await p.go('#/foundations/utilities?p=2');
        await until(() => p.view().querySelector('pk-pagination')?.getAttribute('page') === '2', 'the second page');
        p.win.history.back(); await until(() => rows().length > 0 && rows().every(r => /flex/.test(r.cells[0].textContent)), 'back to the filtered list');
    }],

    ['gallery: a scoped mount with no address opens its first view, and one with an address opens that', async t => {
        const p = await open(t, '', '?kind=foundations');
        await p.shows('Foundations', 'the overview of the scope');
        t.ok([...p.doc.querySelectorAll('pk-nav-item[href]')].every(i => i.getAttribute('href').startsWith('#/foundations')), 'the nav holds only the scope');
        const q = await open(t, '#/foundations/spacing', '?kind=foundations'); await q.shows('Spacing');
    }],

    ['gallery: the preview bar and the top bar keep their box while their elements upgrade, so the view does not jump on first load (#1076)', async t => {
        const p = await open(t, '#/overview');
        await Promise.all(['pk-button-group', 'pk-select', 'pk-field', 'pk-navbar'].map(tag => p.win.customElements.whenDefined(tag)));
        await wait(100);
        const bar = p.doc.querySelector('.gx-bar-main'), top = p.doc.querySelector('pk-navbar');
        // The same markup with no script at all: every pk-* element stays undefined, which is the state a slow connection paints first.
        const base = new URL('../../', import.meta.url).href;
        const f = document.createElement('iframe'); f.title = 'Undefined state'; f.style.cssText = 'width:1280px;height:900px;border:0';
        f.srcdoc = `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="${base}plainkit.css"><link rel="stylesheet" href="${base}site/site.css"><link rel="stylesheet" href="${base}site/gallery/gallery.css"></head>`
            + `<body class="site"><div class="gx-mount site-body"><div class="gx-shell"><main class="gx-main">${bar.outerHTML}</main></div></div></body></html>`;
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); p.win.frameElement.parentElement.append(f); await loaded; await wait(100);
        const raw = f.contentDocument.querySelector('.gx-bar-main');
        t.ok(bar.getClientRects().length > 0, `the live preview bar is drawn (display ${p.win.getComputedStyle(bar).display}, ${p.doc.documentElement.className}, ${bar.parentElement?.className})`);
        const h = el =>Math.round(el.getBoundingClientRect().height * 2) / 2;
        t.eq(h(raw), h(bar), `the preview bar is ${h(raw)}px high before its elements upgrade and ${h(bar)}px after`);
        t.ok(top.getBoundingClientRect().height <= parseFloat(getComputedStyle(p.doc.documentElement).fontSize) * 3.5 + 1.5, 'the top bar is one row high');
    }],
    ['gallery: the overview, the page header and the side-nav titles keep their box while their elements upgrade (#1076)', async t => {
        const p = await open(t, '#/overview');
        await Promise.all(['pk-page-header', 'pk-card', 'pk-grid', 'pk-side-nav', 'pk-nav-item'].map(tag => p.win.customElements.whenDefined(tag)));
        await wait(100);
        const shell = p.doc.querySelector('.gx-shell');
        // The same markup with no script: every pk-* element stays undefined, the state a slow connection paints first.
        const base = new URL('../../', import.meta.url).href;
        const f = document.createElement('iframe'); f.title = 'Undefined state'; f.style.cssText = 'width:1280px;height:900px;border:0';
        f.srcdoc = `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="${base}plainkit.css"><link rel="stylesheet" href="${base}site/site.css"><link rel="stylesheet" href="${base}site/gallery/gallery.css"></head>`
            + `<body class="site"><div class="gx-mount site-body">${shell.outerHTML}</div></body></html>`;
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); p.win.frameElement.parentElement.append(f); await loaded; await wait(100);
        const raw = f.contentDocument;
        const box = (d, sel, i = 0) => d.querySelectorAll(sel)[i].getBoundingClientRect();
        const near = (sel, what, i = 0) => t.ok(Math.abs(box(raw, sel, i).height - box(p.doc, sel, i).height) <= 3, `${what} is ${Math.round(box(raw, sel, i).height)}px high before upgrade and ${Math.round(box(p.doc, sel, i).height)}px after`);
        near('.gx-head', 'the page header'); near('.gx-tile', 'an overview tile'); near('main pk-grid', 'the overview grid');
        // Titles sit between nav rows. The nav's own header is hidden until its element is defined, so compare the distance between two titles (the rows
        // between them are what must keep their height while pk-nav-item is undefined: the 0.0015 shift), not the position of the first.
        const gap = (d, i) => box(d, '.gx-nav-title', i + 1).top - box(d, '.gx-nav-title', i).top;
        for (let i = 0; i < 2; i++) t.ok(Math.abs(gap(raw, i) - gap(p.doc, i)) <= 3, `the rows under nav title ${i} take ${Math.round(gap(raw, i))}px before upgrade and ${Math.round(gap(p.doc, i))}px after`);
    }],
];

// The Gallery as a lazy module of the site app (#355, step 4): core/app.html#/gallery/..., the same views under one kept route, the app's own nav and row marking.
export const galleryAppCases = [
    ['gallery module (app): a deep link opens the element page, the nav marks the section and no gallery nav column is drawn, a click in the views keeps the app address, and the page is kept (not remounted) while the address changes', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'Site app'; f.style.cssText = 'width:1280px;height:900px;border:0;display:block';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        f.src = new URL('../../app.html#/gallery/elements/pk-button', import.meta.url).href; host.append(f); await loaded;
        const win = f.contentWindow, d = f.contentDocument;
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'the Button page');
        const shell = d.querySelector('#gx-shell');
        t.ok(getComputedStyle(d.querySelector('#gx-nav')).display === 'none', 'the gallery draws no nav column of its own');
        await until(() => d.querySelector('#pk-nav pk-nav-item[current]')?.textContent.includes('Elements'), 'the Elements row to be current');
        for (const a of d.querySelectorAll('#gx-view [href^="#/"]')) t.ok(a.getAttribute('href').startsWith('#/gallery/'), 'every link in the views is under #/gallery');
        win.location.hash = '#/gallery/foundations/typography'; await wait(300);
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Typography', 'the Typography page');
        t.ok(d.querySelector('#gx-shell') === shell, 'the gallery was kept, not mounted again');
        await until(() => /Typography/.test(d.querySelector('#pk-nav pk-nav-item[current]')?.textContent ?? ''), 'the Typography row to be current');
    }],
];
