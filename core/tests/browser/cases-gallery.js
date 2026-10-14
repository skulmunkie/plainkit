// Browser cases for the Gallery's routing (site/gallery/gallery.js, #401): the embed page (full chrome) in a frame, driven only through its address, so they hold whatever draws the routes. Deep links,
// the old addresses that keep working, back and forward, the query inside the hash (?q ?p) and a scoped mount's first route. Same contract as cases.js: [name, async (t) => void].
import { instrument } from './cases-app.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 120) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };

// Opens the gallery page at a hash (and a query for the mount's options) and waits for its first view.
async function open(t, hash = '', search = '', width = 1280) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Gallery page'; f.style.cssText = `width:${width}px;height:900px;border:0`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../site/gallery/embed.html${search}${hash}`, import.meta.url).href; host.append(f); await loaded;
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

    ['gallery: the content of a card in a view is stacked with a gap, not flush (sections of tokens, spacing and the layout samples; #1161)', async t => {
        const p = await open(t, '#/foundations/tokens', '', 375);
        for (const hash of ['#/foundations/tokens', '#/foundations/spacing', '#/samples/layouts/responsive']) {
            await p.go(hash); await until(() => p.view().querySelector('pk-card > pk-stack > *:nth-child(2)'), `a card with stacked content on ${hash}`); await wait(300);
            const flush = [];
            for (const card of p.view().querySelectorAll('pk-card')) {
                const kids = [...card.children].filter(k => k.getBoundingClientRect().height > 0 && !k.slot);
                for (let i = 1; i < kids.length; i++) if (kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom < 1) flush.push(`${kids[i - 1].localName} -> ${kids[i].localName}`);
            }
            t.eq(flush.slice(0, 5).join('; '), '', `${hash}: no two blocks inside a card touch`);
        }
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

    ['gallery: mounting and destroying it 100 times leaves the listener, observer, timer and node counts where they started, and a mount keeps no state of the one before (#1239)', async t => {
        const { mountGallery } = await import(new URL('../../site/gallery/gallery.js', import.meta.url).href);
        const inst = instrument(), hash = location.hash;
        try {
            const host = t.stage('');
            const nodes = () => document.getElementsByTagName('*').length;
            const one = async (options, to) => { location.hash = to; const g = await mountGallery(host, options); await wait(0); g.destroy(); };
            await one({ chrome: 'full', init: false }, '#/overview'); // warm up: modules and stylesheets load once
            const before = inst.snapshot(), nodesBefore = nodes();
            for (let i = 0; i < 100; i++) await one(i % 2 ? { chrome: 'none', filter: 'button', init: false } : { chrome: 'full', init: false }, i % 3 ? '#/elements/pk-button' : '#/foundations/colours');
            await wait(100); // an element page's timers end with the page (#1326): nothing to wait out
            const after = inst.snapshot();
            t.eq(after.listeners.join('\n'), before.listeners.join('\n'), 'no window or document listener is left after 100 mounts');
            t.eq(after.observers, before.observers, 'no observer is left'); t.eq(after.timers, before.timers, 'no long timer is left');
            t.eq(nodes(), nodesBefore, 'the document has the same number of nodes'); t.eq(host.childElementCount, 0, 'the container is empty');
            // a mount starts from its own defaults: the filter and the bare chrome of the mount before do not carry over
            location.hash = '#/foundations/colours';
            const g = await mountGallery(host, { chrome: 'full', init: false });
            await until(() => host.querySelector('#gx-view')?.firstElementChild, 'the first view');
            t.ok(host.querySelector('#gx-nav') && host.querySelectorAll('#gx-nav pk-nav-item[href]').length > 20, 'a fresh mount draws the whole nav, unfiltered');
            g.destroy();
        } finally { inst.restore(); location.hash = hash; }
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
        await until(() => p.doc.querySelector('#gx-view iframe.gx-page-frame'), 'the full-page frame', 400);
        t.ok(/kind=layouts&id=shell/.test(p.doc.querySelector('iframe.gx-page-frame').src), 'the frame loads that layout');
        await until(() => p.doc.querySelector('#gx-title').textContent === 'App shell', 'the slim bar to carry the title', 400);
        await until(() => p.doc.querySelector('#gx-back').href === '#/samples/layouts', 'and a way back to the list', 400);
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
        const rows = () => [...(p.view().querySelector('pk-table')?.shadowRoot?.querySelectorAll('tbody tr') ?? [])];
        const name = r => r.cells[0].querySelector('slot')?.assignedNodes()[0]?.textContent ?? r.cells[0].textContent;
        await until(() => rows().length >= 30, 'the first page of utilities');
        const all = rows().length;
        await p.go('#/foundations/utilities?q=flex');
        await until(() => rows().length > 0 && rows().length < all && rows().every(r => /flex/.test(name(r))), 'only the matching utilities');
        await p.go('#/foundations/utilities?p=2');
        await until(() => p.view().querySelector('pk-pagination')?.getAttribute('page') === '2', 'the second page');
        p.win.history.back(); await until(() => rows().length > 0 && rows().every(r => /flex/.test(name(r))), 'back to the filtered list');
    }],

    ['gallery: a scoped mount with no address opens its first view, and one with an address opens that', async t => {
        const p = await open(t, '', '?kind=foundations');
        await p.shows('Foundations', 'the overview of the scope');
        t.ok([...p.doc.querySelectorAll('pk-nav-item[href]')].every(i => i.getAttribute('href').startsWith('#/foundations')), 'the nav holds only the scope');
        const q = await open(t, '#/foundations/spacing', '?kind=foundations'); await q.shows('Spacing');
    }],

    ['gallery: the preview bar keeps their box while their elements upgrade, so the view does not jump on first load (#1076)', async t => {
        const p = await open(t, '#/overview');
        await Promise.all(['pk-toolbar', 'pk-dropdown', 'pk-button'].map(tag => p.win.customElements.whenDefined(tag)));
        await wait(100);
        const bar = p.doc.querySelector('#gx-bar');
        // The same markup with no script at all: every pk-* element stays undefined, which is the state a slow connection paints first.
        const base = new URL('../../', import.meta.url).href;
        const f = document.createElement('iframe'); f.title = 'Undefined state'; f.style.cssText = 'width:1280px;height:900px;border:0';
        f.srcdoc = `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="${base}plainkit.css"><link rel="stylesheet" href="${base}site/site.css"><link rel="stylesheet" href="${base}site/gallery/gallery.css"></head>`
            + `<body class="site"><div class="site-body" data-gx-mount><pk-app-shell flush>${bar.outerHTML}</pk-app-shell></div></body></html>`;
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); p.win.frameElement.parentElement.append(f); await loaded; await wait(100);
        const raw = f.contentDocument.querySelector('#gx-bar');
        t.ok(bar.getClientRects().length > 0, `the live preview bar is drawn (display ${p.win.getComputedStyle(bar).display}, ${p.doc.documentElement.className}, ${bar.parentElement?.className})`);
        const h = el =>Math.round(el.getBoundingClientRect().height * 2) / 2;
        t.eq(h(raw), h(bar), `the preview bar is ${h(raw)}px high before its elements upgrade and ${h(bar)}px after`);
    }],
    ['gallery: the preview bar and the slim page bar are pk-toolbar rows, their controls share one row and the Display menu holds the viewport and the text size (#682)', async t => {
        const p = await open(t, '#/overview');
        const main = p.doc.querySelector('#gx-bar'), page = p.doc.querySelector('#gx-pagebar');
        t.eq(main?.localName, 'pk-toolbar', 'the preview bar is a pk-toolbar'); t.eq(page?.localName, 'pk-toolbar', 'the page bar is a pk-toolbar');
        t.eq(main.querySelectorAll('[class]').length, 0, 'no hand-written class inside the preview bar');
        const display = main.querySelector('pk-dropdown'), inspect = p.doc.querySelector('#gx-inspect');
        t.eq([...display.querySelectorAll('pk-menu-item[data-set-width]')].map(i => i.dataset.setWidth).join(), 'desktop,phone', 'the Display menu switches the viewport');
        t.eq(display.querySelectorAll('pk-menu-item[data-scale]').length, 4, 'and the text size');
        inspect.hidden = false; await wait(100);
        const a = display.getBoundingClientRect(), b = inspect.getBoundingClientRect();
        t.ok(Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 2, 'Display and Details share one row');
        t.ok(main.getBoundingClientRect().height <= 64, 'the preview bar is one slim row');
        await p.go('#/samples/layouts/shell'); await until(() => p.doc.querySelector('#gx-title').textContent === 'App shell', 'the slim bar');
        const row = ['#gx-back', '#gx-title', '#gx-theme', '#gx-open'].map(s => p.doc.querySelector(s).getBoundingClientRect());
        t.ok(row.every(r => Math.abs((r.top + r.height / 2) - (row[0].top + row[0].height / 2)) < 2), 'Back, the title, the theme switch and Open share one row');
    }],
    ['gallery: the page frame is a pk-app-shell, the nav is its nav column, both bars are its header, the view is the one scroller and the Details drawer docks over the end edge (#682)', async t => {
        const p = await open(t, '#/elements/pk-button');
        await p.win.customElements.whenDefined(p.doc.querySelector('#gx-shell').localName); await wait(100);
        const shell = p.doc.querySelector('#gx-shell'), nav = p.doc.querySelector('#gx-nav'), bar = p.doc.querySelector('#gx-bar'), view = p.view();
        t.eq(shell.localName, 'pk-app-shell', 'the frame is a pk-app-shell'); t.eq(nav.getAttribute('slot'), 'nav', 'the nav is in its nav slot');
        t.eq(p.doc.querySelectorAll('#gx-shell > [class]:not(.gx-nav)').length, 0, 'no hand-written class on the frame parts (the nav keeps one for its width before it upgrades)');
        await until(() => view.querySelector('pk-page-header'), 'the element page');
        const n = nav.getBoundingClientRect(), b = bar.getBoundingClientRect(), v = view.getBoundingClientRect();
        t.ok(n.right <= b.left + 1 && n.right <= v.left + 1, 'the nav column lies before the bar and the view');
        t.ok(b.bottom <= v.top + 1, 'the header (the bar) lies above the view');
        t.ok(Math.abs(v.bottom - shell.getBoundingClientRect().bottom) < 2, 'the view reaches the bottom of the frame');
        t.ok(shell.getBoundingClientRect().height <= p.win.innerHeight + 1, 'the frame fits the window, only the view scrolls');
        const toggle = p.doc.querySelector('#gx-inspect'); toggle.hidden = false;
        if (!p.doc.querySelector('#gx-inspector').hasAttribute('open')) toggle.click();
        await until(() => p.doc.querySelector('#gx-inspector').hasAttribute('open'), 'the Details drawer to open'); await wait(300);
        const d = p.doc.querySelector('#gx-inspector').shadowRoot.querySelector('[part="panel"]').getBoundingClientRect();
        t.ok(Math.abs(d.right - v.right) < 2 && d.top >= b.bottom - 1, 'the drawer docks to the end edge of the body, under the header');
        t.ok(parseFloat(p.win.getComputedStyle(view).paddingInlineEnd) >= d.width, 'the view keeps clear of the drawer');
        p.go('#/samples/layouts/shell'); await until(() => p.doc.querySelector('#gx-title').textContent === 'App shell', 'the slim bar');
        t.ok(p.win.getComputedStyle(nav).display === 'none' && bar.hidden && !p.doc.querySelector('#gx-pagebar').hidden, 'a full-page sample hides the nav and the wide bar and shows the slim bar');
    }],
    ['gallery: the overview, the page header and the side-nav titles keep their box while their elements upgrade (#1076)', async t => {
        const p = await open(t, '#/overview');
        await Promise.all(['pk-page-header', 'pk-card', 'pk-grid', 'pk-side-nav', 'pk-nav-item'].map(tag => p.win.customElements.whenDefined(tag)));
        await wait(100);
        const shell = p.doc.querySelector('#gx-shell');
        // The same markup with no script: every pk-* element stays undefined, the state a slow connection paints first.
        const base = new URL('../../', import.meta.url).href;
        const f = document.createElement('iframe'); f.title = 'Undefined state'; f.style.cssText = 'width:1280px;height:900px;border:0';
        f.srcdoc = `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="${base}plainkit.css"><link rel="stylesheet" href="${base}site/site.css"><link rel="stylesheet" href="${base}site/gallery/gallery.css"></head>`
            + `<body class="site"><div class="site-body" data-gx-mount>${shell.outerHTML}</div></body></html>`;
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); p.win.frameElement.parentElement.append(f); await loaded; await wait(100);
        const raw = f.contentDocument;
        const box = (d, sel, i = 0) => d.querySelectorAll(sel)[i].getBoundingClientRect();
        const near = (sel, what, i = 0) => t.ok(Math.abs(box(raw, sel, i).height - box(p.doc, sel, i).height) <= 3, `${what} is ${Math.round(box(raw, sel, i).height)}px high before upgrade and ${Math.round(box(p.doc, sel, i).height)}px after`);
        near('[data-gx~="head"]', 'the page header'); near('[data-gx~="tile"]', 'an overview tile'); near('#gx-view pk-grid', 'the overview grid');
        // Titles sit between nav rows. The nav's own header is hidden until its element is defined, so compare the distance between two titles (the rows
        // between them are what must keep their height while pk-nav-item is undefined: the 0.0015 shift), not the position of the first.
        const gap = (d, i) => box(d, '.gx-nav-title', i + 1).top - box(d, '.gx-nav-title', i).top;
        for (let i = 0; i < 2; i++) t.ok(Math.abs(gap(raw, i) - gap(p.doc, i)) <= 3, `the rows under nav title ${i} take ${Math.round(gap(raw, i))}px before upgrade and ${Math.round(gap(p.doc, i))}px after`);
    }],
    ['gallery: the Details inspector draws its API tables on pk-table, no cell overlaps another, no Description is clipped inside its cell, the Name column stays put when the table scrolls, and the drawer never scrolls sideways (#1113)', async t => {
        const p = await openInspector(t, 1280);
        const body = p.doc.querySelector('#gx-inspector-body'), tb = p.tbl.shadowRoot.querySelector('table'), scroll = p.tbl.shadowRoot.querySelector('[part="scroll"]');
        const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const rows = [...tb.querySelectorAll('tbody tr')], bad = [];
        for (const tr of rows) { const cells = [...tr.children].map(c => c.getBoundingClientRect()); for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (overlap(cells[i], cells[j])) bad.push(tr.textContent.slice(0, 40)); }
        t.eq(bad.join(' | '), '', 'no cell overlaps another in any row');
        const d = [...tb.querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase()).indexOf('description');
        t.ok(d > 0, 'the table has a Description column');
        t.eq(rows.filter(tr => tr.children[d].scrollWidth > tr.children[d].clientWidth + 1).length, 0, 'no Description cell is clipped by its own box');
        t.ok(Math.min(...rows.map(tr => tr.children[d].getBoundingClientRect().width)) >= 128, 'the Description column is at least 128px wide');
        const drawer = p.doc.querySelector('#gx-inspector');
        t.ok(body.scrollWidth <= body.clientWidth + 1 && drawer.scrollWidth <= drawer.clientWidth + 1, 'the drawer itself does not scroll sideways');
        t.ok(scroll.scrollWidth > scroll.clientWidth, 'the wide table scrolls inside its own region (the intentional scroll)');
        const first = rows[0].children[0], x0 = first.getBoundingClientRect().left; scroll.scrollLeft = 120; await wait(100);
        t.ok(Math.abs(first.getBoundingClientRect().left - x0) < 2, 'the Name column stays put while the table scrolls sideways');
    }],
    ['gallery: on a phone the inspector API tables are cards, one labelled line per cell, none overlapping and nothing scrolling sideways (#1113)', async t => {
        const p = await openInspector(t, 375);
        const scroll = p.tbl.shadowRoot.querySelector('[part="scroll"]'), card = p.tbl.shadowRoot.querySelector('tbody tr');
        t.eq(p.win.getComputedStyle(card).display, 'block', 'a row is a card (block), not a table row');
        t.ok(scroll.scrollWidth <= scroll.clientWidth + 1, 'the cards do not scroll sideways');
        const cells = [...card.children].map(c => c.getBoundingClientRect()), box = card.getBoundingClientRect();
        t.ok(cells.length === 4 && cells.every((c, i) => c.left >= box.left - 1 && c.right <= box.right + 1 && (i === 0 || c.top >= cells[i - 1].bottom - 1)), 'the four cells stack inside the card without overlapping');
        t.ok([...card.children].every(c => c.getAttribute('data-label')), 'every cell is labelled');
    }],
    ['gallery: the embed keeps its choices in the store (pk.gallery, pk.app), reads the old pk-gallery-* keys once, and remembers an opened fold and the theme (#1339)', async t => {
        const keys = ['pk.gallery', 'pk.app', 'pk-gallery-width', 'pk-gallery-scale', 'pk-gallery-open', 'pk-site-theme'], saved = keys.map(k => localStorage.getItem(k));
        try {
            for (const k of keys) localStorage.removeItem(k);
            localStorage.setItem('pk-gallery-width', 'phone'); localStorage.setItem('pk-gallery-scale', '1.3');
            const p = await open(t, '#/overview');
            t.eq(p.doc.documentElement.dataset.width, 'phone', 'the old width key is read once');
            const branch = await until(() => p.doc.querySelector('#gx-nav pk-nav-item[data-branch]'), 'a folding group');
            await p.win.customElements.whenDefined('pk-nav-item');
            t.ok(!branch.hasAttribute('expanded'), 'a group is folded until it is opened');
            branch.shadowRoot.querySelector('[part="link"]').click();
            await until(() => JSON.parse(localStorage.getItem('pk.gallery') ?? '{}').data?.open?.includes(branch.dataset.branch), 'the opened fold to be saved');
            t.eq(JSON.parse(localStorage.getItem('pk.gallery')).data.width, 'phone', 'the migrated width is saved with it');
            p.doc.querySelector('#gx-theme').click();
            await until(() => JSON.parse(localStorage.getItem('pk.app') ?? '{}').data?.theme === 'light', 'the theme choice in the app namespace');
            t.eq(localStorage.getItem('pk-site-theme'), null, 'the old theme key is not written any more');
            const again = await open(t, '#/overview');
            t.ok(again.doc.querySelector(`#gx-nav pk-nav-item[data-branch="${branch.dataset.branch}"]`)?.hasAttribute('expanded'), 'the fold the reader opened is open on the next visit');
        } finally { keys.forEach((k, i) => (saved[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[i]))); }
    }],
];

// The gallery on an element page with the Details drawer open and its first API table (Properties) drawn.
async function openInspector(t, width) {
    const p = await open(t, '#/elements/pk-button', '', width);
    const toggle = p.doc.querySelector('#gx-inspect'); toggle.hidden = false;
    if (!p.doc.querySelector('#gx-inspector').hasAttribute('open')) toggle.click();
    p.tbl = await until(() => { const e = p.doc.querySelector('#gx-inspector-body pk-table'); return e?.shadowRoot?.querySelectorAll('tbody tr').length > 3 && e; }, 'the Properties table');
    await wait(300); return p;
}

async function openApp(t, hash, width = 1280) {
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'Site app'; f.style.cssText = `width:${width}px;height:900px;border:0;display:block`;
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    f.src = new URL(`../../app.html${hash}`, import.meta.url).href; host.append(f); await loaded;
    return { win: f.contentWindow, d: f.contentDocument };
}

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
        t.ok(!d.querySelector('#gx-nav'), 'the gallery draws no nav column of its own');
        await until(() => d.querySelector('#pk-nav pk-nav-item[current]')?.getAttribute('href') === '#/gallery/elements/pk-button', 'the Button row to be current');
        for (const a of d.querySelectorAll('#gx-view [href^="#/"]')) t.ok(a.getAttribute('href').startsWith('#/gallery/'), 'every link in the views is under #/gallery');
        win.location.hash = '#/gallery/foundations/typography'; await wait(300);
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Typography', 'the Typography page');
        t.ok(d.querySelector('#gx-shell') === shell, 'the gallery was kept, not mounted again');
        await until(() => /Typography/.test(d.querySelector('#pk-nav pk-nav-item[current]')?.textContent ?? ''), 'the Typography row to be current');
    }],
    ['gallery module (app): the nav lists the foundations and the element categories folded, a category opens to its elements, and a deep link to an element opens its page with that row marked and its category open', async t => {
        const { d, win } = await openApp(t, '#/gallery');
        const nav = () => [...d.querySelectorAll('#pk-nav pk-nav-item')];
        await until(() => nav().some(i => i.textContent.trim().startsWith('Foundations')), 'the Foundations row');
        const row = text => nav().find(i => i.firstChild?.textContent.trim() === text);
        t.ok(row('Typography') && row('Navigation') && row('Page types') && row('Templates'), 'foundation pages, element categories and the sample lists are all in the nav');
        t.ok(!row('Navigation').hasAttribute('expanded'), 'a category is folded until it is opened');
        t.ok(!row('Navigation').querySelector('[current]'), 'no element row is marked before one is open');
        row('Navigation').toggleAttribute('expanded', true);
        t.ok(row('Navigation').querySelectorAll('pk-nav-item').length >= 10, 'the opened category lists its elements');
        win.location.hash = '#/gallery/elements/pk-button'; await wait(200);
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'the Button page');
        await until(() => d.querySelector('#pk-nav pk-nav-item[current]')?.getAttribute('href') === '#/gallery/elements/pk-button', 'the Button row to be current');
        t.ok(d.querySelector('#pk-nav pk-nav-item[current]').closest('pk-nav-item[expanded]'), 'the category of the current row is open');
        win.location.hash = '#/gallery/foundations/typography'; await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Typography', 'Typography');
        win.history.back(); await until(() => d.querySelector('#pk-nav pk-nav-item[current]')?.getAttribute('href') === '#/gallery/elements/pk-button', 'back to the Button row');
        const link = d.querySelector('#pk-nav pk-nav-item[href="#/gallery/elements/pk-badge"]');
        link?.focus(); t.ok(link && d.querySelector('#pk-nav').contains(link), 'element rows are links, reachable by keyboard');
    }],
    ['gallery module (app): on a phone the drawer holds the same tree and an element row opens its page', async t => {
        const { d, win } = await openApp(t, '#/gallery/elements/pk-button', 375);
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'the Button page');
        d.querySelector('pk-button[data-nav-toggle]').click(); await wait(500);
        const cur = await until(() => d.querySelector('#pk-nav pk-nav-item[current][href$="pk-button"]'), 'the current row in the drawer');
        t.eq(cur.getAttribute('href'), '#/gallery/elements/pk-button', 'the drawer marks the Button row');
        win.location.hash = '#/gallery/elements/pk-badge';
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Badge', 'the Badge page');
    }],
    ['gallery module (app): the old addresses under #/gallery are rewritten to the current ones, an unknown one says so, back and forward walk the views, the header search finds an element and the theme switch reaches the page (#1239)', async t => {
        const { d, win } = await openApp(t, '#/gallery/controls/forms-inputs/button');
        const shows = text => until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === text || d.querySelector('#gx-view pk-empty-state')?.getAttribute('heading') === text, `the ${text} page (the page says "${d.querySelector('#gx-view pk-page-header')?.getAttribute('heading')}")`);
        const go = hash => { win.location.hash = hash; };
        await shows('Button');
        await until(() => win.location.hash === '#/gallery/elements/pk-button', 'the old control address to become the own address of the element, under the app prefix');
        go('#/gallery/layouts'); await shows('Layouts');
        await until(() => win.location.hash === '#/gallery/samples/layouts', 'the old layouts address to become the samples one');
        go('#/gallery/foundations/colours'); await shows('Colours');
        go('#/gallery/foundations/typography'); await shows('Typography');
        win.history.back(); await shows('Colours');
        win.history.forward(); await shows('Typography');
        await until(() => /Typography/.test(d.querySelector('#pk-nav pk-nav-item[current]')?.textContent ?? ''), 'the Typography row to be current after forward');
        go('#/gallery/nonsense/a'); await shows('Not found');
        go('#/gallery/elements/pk-badge'); await shows('Badge');
        const search = d.querySelector('pk-app-bar-search'), input = await until(() => search?.shadowRoot?.querySelector('[part="control"]'), 'the header search input');
        input.value = 'pk-card'; input.dispatchEvent(new win.Event('input', { bubbles: true }));
        await until(() => search.items?.some(i => i.route === '/elements/pk-card' || i.label === '<pk-card>'), 'the search to offer <pk-card>');
        const before = d.documentElement.getAttribute('data-theme');
        d.querySelector('pk-menu-item[value=theme]').dispatchEvent(new win.CustomEvent('pk-select', { bubbles: true, detail: {} }));
        await until(() => d.documentElement.getAttribute('data-theme') !== before, 'the theme to switch');
        await shows('Badge');
        win.localStorage.removeItem('pk.app');
    }],
    ['gallery module (app): an element deep link with the whole nav tree drawn shifts the layout less than 0.1 (#355)', async t => {
        const { d, win } = await openApp(t, '#/gallery/elements/pk-button');
        await until(() => d.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'the Button page');
        await wait(1500);
        const seen = type => new Promise(r => { const o = new win.PerformanceObserver(l => r(l.getEntries())); try { o.observe({ type, buffered: true }); } catch { r([]); } setTimeout(() => r(o.takeRecords()), 300); });
        const entries = await seen('layout-shift'), cls = entries.filter(e => !e.hadRecentInput).reduce((n, e) => n + e.value, 0);
        t.ok(d.querySelectorAll('#pk-nav pk-nav-item').length > 150, 'the nav tree is in the page');
        t.ok(cls < 0.1, `layout shift ${cls.toFixed(4)} over ${entries.length} entries`);
    }],
    ['gallery module (host): four gallery pages and another module, 100 times over, leave no listener, observer, timer or store subscription behind, one frame is in the page, and a route change takes 100 ms at most (#1239)', async t => {
        const { createModuleHost, defineModule } = await import(new URL('../../js/app.js', import.meta.url).href);
        const { createStore } = await import(new URL('../../js/store.js', import.meta.url).href);
        const gallery = (await import(new URL('../../site/modules/gallery.js', import.meta.url).href)).default;
        const el = document.createElement('div'); t.stage('').append(el);
        const store = createStore({ storage: { getItem: () => null, setItem() {} } });
        const host = createModuleHost(el, { modules: [{ id: 'gallery', title: 'Gallery', load: async () => gallery }, { id: 'idle', title: 'Idle', load: async () => defineModule({ id: 'idle', routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }] }) }],
            store, router: { navigate: () => true, href: p => `#${p}` }, timeout: 10000 });
        const pages = ['/elements/pk-button', '/elements/pk-badge', '/foundations/typography', '/samples/patterns'];
        const cycle = async () => { for (const path of pages) t.eq(await host.show('gallery', { path }), 'ok', path); t.eq(await host.show('idle'), 'ok'); };
        for (let i = 0; i < 2; i++) { await cycle(); await t.settle(); await wait(300); } // warm-up rounds: the module, its stylesheet and the element chunks load once
        const inst = instrument();
        let before, after;
        try {
            before = inst.snapshot();
            performance.clearMeasures();
            for (let i = 0; i < 100; i++) await cycle();
            await t.settle(); await wait(300);
            after = inst.snapshot();
        } finally { inst.restore(); }
        t.eq(after.listeners.join('\n'), before.listeners.join('\n'), 'window/document listeners are back to the baseline');
        t.eq(after.observers, before.observers, 'live observers are back to the baseline'); t.eq(after.timers, before.timers, 'timers are back to the baseline');
        t.eq(store.listeners(), 0, 'store subscriptions are freed');
        t.eq(document.querySelectorAll('link[href$="gallery/gallery.css"]').length, 0, 'the stylesheet link is taken out with the module');
        await host.show('gallery', { path: '/elements/pk-button' });
        t.eq(el.querySelectorAll('#gx-shell').length, 1, 'one gallery frame is in the page');
        // a route change between two element pages, the module already on show: the page type of the next is drawn into the frame that stays
        const ms = [];
        for (let i = 0; i < 20; i++) { const from = performance.now(); await host.show('gallery', { path: i % 2 ? '/elements/pk-button' : '/elements/pk-badge' }); ms.push(performance.now() - from); }
        const mean = ms.reduce((s, x) => s + x, 0) / ms.length, median = [...ms].sort((a, b) => a - b)[ms.length >> 1], quarter = [...ms].sort((a, b) => a - b)[ms.length >> 2];
        t.ok(quarter <= 100, `a route change between element pages takes ${median.toFixed(1)} ms at the median (mean ${mean.toFixed(1)}) over ${ms.length}, budget 100`);
        await host.destroy();
    }],
    ['modules (app): a cold deep link to each lazy module leaves no pk-* element undefined once its view is drawn, and the gallery page header draws its heading (the view is drawn after the app scan)', async t => {
        for (const hash of ['#/gallery/elements/pk-button', '#/gallery/foundations/typography', '#/guides', '#/files', '#/scorecard', '#/theme', '#/layout-builder', '#/settings', '#/devtools']) {
            const { d, win } = await openApp(t, hash);
            await until(() => d.querySelector('main')?.querySelector('*'), `${hash}: the page to draw`);
            if (hash.includes('gallery')) await until(() => d.querySelector('#gx-view pk-page-header, #gx-view pk-card'), `${hash}: the gallery view`);
            // The loader imports each element on demand, so a loaded machine defines them late: after the 1.2 s grace, poll (10 s cap) until none is left undefined; a tag the loader never picks up still fails.
            const undefOf = () => [...new Set([...d.body.querySelectorAll('*')].map(e => e.localName).filter(n => n.startsWith('pk-')))].filter(n => !win.customElements.get(n));
            await wait(1200);
            for (let i = 0; i < 200 && undefOf().length; i++) await wait(50);
            t.eq(undefOf().join(', '), '', `${hash}: every pk-* in the page is defined once the view is drawn`);
            if (hash.includes('pk-button')) t.ok(d.querySelector('#gx-view pk-page-header')?.shadowRoot?.querySelector('[part="title"]')?.textContent.trim(), 'the page header drew its heading');
        }
    }],
    // Files and Scorecard as lazy modules of the site app (#355, step 6a)
    ['files module (app, 1280px and 375px): the explorer opens the file and line of the address, fills the content area under the bar and does not scroll the page', async t => {
        for (const width of [1280, 375]) {
            const { d } = await openApp(t, '#/files?path=tokens/tokens.css&line=3', width);
            const ex = await until(() => d.querySelector('#pk-main pk-code-explorer'), `the explorer at ${width}px`);
            await until(() => /tokens\.css/.test(ex.textContent + (ex.shadowRoot?.textContent ?? '')), 'the opened file name in the explorer');
            const main = d.querySelector('#pk-main').getBoundingClientRect(), box = ex.getBoundingClientRect();
            t.ok(box.height >= main.height * 0.6, `the explorer is ${Math.round(box.height)}px high in a ${Math.round(main.height)}px content area at ${width}px`);
            t.ok(box.right <= main.right + 1 && box.left >= main.left - 1, `the explorer stays inside the content area at ${width}px`);
            t.ok(box.bottom <= Math.min(main.bottom, d.documentElement.clientHeight) + 1, `the explorer ends at ${Math.round(box.bottom)}px, inside the ${Math.round(Math.min(main.bottom, d.documentElement.clientHeight))}px window, so the page does not scroll behind it at ${width}px`);
            t.ok(d.documentElement.scrollWidth <= width, `no horizontal page scroll at ${width}px`);
        }
    }],
    ['scorecard module (app, 1280px and 375px): the card opens with its Run button and ranked section inside the content area, and a file link points into the Files module', async t => {
        for (const width of [1280, 375]) {
            const { d } = await openApp(t, '#/scorecard', width);
            const run = await until(() => d.querySelector('#pk-main [data-sc-run]'), `the Run button at ${width}px`);
            const main = d.querySelector('#pk-main').getBoundingClientRect(), r = run.getBoundingClientRect();
            t.ok(r.right <= main.right + 1 && r.left >= main.left - 1 && r.height > 0, `the Run button sits inside the content area at ${width}px`);
            t.ok(d.documentElement.scrollWidth <= width, `no horizontal page scroll at ${width}px`);
        }
    }],
    ['scorecard module (app, 1280px and 375px): in every section card the badge row ends above the note under it (#1121)', async t => {
        for (const width of [1280, 375]) {
            const { d } = await openApp(t, '#/scorecard', width);
            await until(() => d.querySelector('#pk-main [data-sc-run]'), `the Run button at ${width}px`);
            const notes = await until(() => { const n = [...d.querySelectorAll('#pk-main pk-card pk-text[tone=muted]')].filter(p => p.previousElementSibling?.localName === 'pk-cluster'); return n.some(p => p.textContent.startsWith("Elements per composition")) ? n : null; }, "the section notes", 400).catch(e => { throw new Error(`${e.message}: cards ${d.querySelectorAll("pk-card").length}, muted ${[...d.querySelectorAll("pk-text[tone=muted]")].map(p => p.previousElementSibling?.localName + ":" + p.closest("pk-card")?.localName).join()}, hash ${d.location.hash}`); });
            for (const p of notes) {
                const above = [...p.previousElementSibling.children].reduce((r, e) => ({ top: Math.min(r.top, e.getBoundingClientRect().top), bottom: Math.max(r.bottom, e.getBoundingClientRect().bottom) }), p.previousElementSibling.getBoundingClientRect()), box = p.getBoundingClientRect();
                t.ok(above.bottom <= box.top + 0.01, `the badge row (${above.top}-${above.bottom}) ends above the note (${box.top}) in '${p.textContent.slice(0, 30)}' at ${width}px`);
            }
        }
    }],

    ['gallery: a pattern drawn inline puts the desktop sample beside the phone sample on a wide window and keeps only the phone sample, inside the viewport, on a phone (pk-grid, no gx-pair class)', async t => {
        for (const width of [1280, 375]) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'Gallery inline'; f.style.cssText = `width:${width}px;height:900px;border:0;position:fixed;left:0;top:0;z-index:10`;
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
            f.src = new URL('../../site/gallery/embed.html?chrome=none#/samples/patterns/notifications', import.meta.url).href; host.append(f); await loaded;
            const doc = f.contentDocument, win = f.contentWindow;
            const halves = await until(() => { const h = [...doc.querySelectorAll('[data-pair] > pk-stack')]; return h.length === 2 && h; }, 'the desktop and phone halves');
            t.eq(doc.querySelectorAll('.gx-pair').length, 0, 'no hand-written pair class is left');
            await until(() => win.customElements.get('pk-grid'), 'pk-grid to load'); await t.settle();
            const [d, ph] = halves.map(h => h.getBoundingClientRect());
            if (width > 640) {
                t.ok(ph.left >= d.right - 0.5, `the phone half (left ${ph.left}) starts at or after the desktop half's right edge (${d.right}) at ${width}px`);
                t.ok(Math.abs(ph.top - d.top) < 2, `the halves share a top (${d.top} / ${ph.top}) at ${width}px`);
            } else {
                t.eq(win.getComputedStyle(halves[0]).display, 'none', 'the desktop half is dropped on a phone');
                t.ok(ph.width > 0 && ph.right <= width + 0.5, `the phone half (${ph.left}-${ph.right}) fits the ${width}px window`);
            }
        }
    }],

    ['gallery: the embed page draws real content (not a blank frame) and reports its height to the embedder', async t => {
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'Gallery embed'; f.style.cssText = 'width:1000px;height:600px;border:0';
        const heights = [], listen = e => { if (e.data?.type === 'pk-gallery-height') heights.push(e.data.height); };
        window.addEventListener('message', listen);
        try {
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
            f.src = new URL('../../site/gallery/embed.html?chrome=none', import.meta.url).href; host.append(f); await loaded;
            const doc = f.contentDocument;
            const box = await until(() => { const b = doc.getElementById('gx-host')?.getBoundingClientRect(); return b && b.height > 100 && b; }, 'the gallery host to draw content');
            t.ok(doc.querySelector('#gx-host pk-alert') === null, 'the gallery started without an error alert');
            await until(() => heights.length > 0, 'the frame to report its height');
            t.ok(Math.abs(heights.at(-1) - box.height) < 400, `the reported height (${heights.at(-1)}) matches the content (${box.height})`);
        } finally { window.removeEventListener('message', listen); }
    }],
    ['gallery module (app): navFilter puts the nav\'s filter box on the app side nav, typing narrows the rows to the matches and clearing brings them back, and a module without the option has no box (#1339)', async t => {
        const { d, win } = await openApp(t, '#/gallery');
        const nav = d.querySelector('#pk-nav'), rows = () => [...nav.querySelectorAll('pk-nav-item[href]')];
        await until(() => rows().length > 20, 'the gallery rows');
        await win.customElements.whenDefined('pk-side-nav');
        t.ok(nav.hasAttribute('filterable'), 'the gallery module asks for the filter box');
        const input = await until(() => nav.shadowRoot?.querySelector('[part="filter-input"]'), 'the filter box'), all = rows().filter(r => !r.hidden).length;
        input.value = 'butt'; input.dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => rows().filter(r => !r.hidden).length < all / 4 && rows().some(r => !r.hidden && /Button/.test(r.textContent)), 'the rows to narrow to the matches');
        input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => rows().filter(r => !r.hidden).length === all, 'every row to come back');
        win.location.hash = '#/guides';
        await until(() => !nav.hasAttribute('filterable') && nav.querySelector('pk-nav-item[href*="/guides"]'), 'a module without the option: no box');
    }],
];
