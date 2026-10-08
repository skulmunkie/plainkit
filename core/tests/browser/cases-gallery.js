// Browser cases for the Gallery's routing (site/gallery/gallery.js, #401): the real page in a frame, driven only through its address, so they hold whatever draws the routes. Deep links,
// the old addresses that keep working, back and forward, the query inside the hash (?q ?p) and a scoped mount's first route. Same contract as cases.js: [name, async (t) => void].
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
];
