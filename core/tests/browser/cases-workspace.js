// Browser cases for pk-workspace and pk-image-gallery. Same contract as cases.js: [name, async (t) => void].
// A phone is only a phone when the frame is: media queries answer to the iframe's width, so the width cases render in a sample frame (the same
// srcdoc the gallery uses) 1200px and 375px wide.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const shown = el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;

async function frame(t, html, width, height = 520) {
    const { sampleDoc } = await import('../../site/gallery/frame.js');
    const host = t.stage('');
    const f = document.createElement('iframe');
    f.title = 'sample'; f.style.width = `${width}px`; f.style.height = `${height}px`; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    host.append(f); f.srcdoc = sampleDoc(html); await loaded;
    const win = f.contentWindow;
    await until(() => win.customElements.get('pk-workspace') || !/pk-workspace/.test(html), 'pk-workspace to be defined in the frame');
    if (/pk-image-gallery/.test(html)) await until(() => win.customElements.get('pk-image-gallery'), 'pk-image-gallery to be defined in the frame');
    await t.settle(); await wait(60);
    return { doc: f.contentDocument, win, frame: f };
}

const WS = '<pk-workspace aside-open nav-label="Files" aside-label="Outline"><div slot="nav" id="n">Nav content</div><div id="m">Main content</div><div slot="aside" id="a">Aside content</div></pk-workspace>';
const tab = (ws, pane) => ws.part('strip').querySelector(`[data-pane="${pane}"]`);
const pane = (ws, name) => ws.part(name);

const PNG = ['iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAmklEQVR42gXBIQ4AIAgAQB/GD/yBP6DQ2Cw2N4uNzUJjs9iINqLP8i4BvUxR6CJ5pTPIFukmScAvcxS+yF75DLbFulkStJdblHaxeW1nNFtNd5ME/eUepV/sXvsZ3VbX3SXBfHlGmRen13nGtDV1T0kgL0sUuShe5QyxJbpFEujLGkUvqlc9Q22pbpUE9rJFsYvm1c4wW6bb5AMXIGmBJ4HH0wAAAABJRU5ErkJggg==']
    .map(b => `data:image/png;base64,${b}`)[0];
const IMAGES = [{ src: PNG, alt: 'Front view', primary: true }, { src: PNG, alt: 'Back view', status: 'Staged' }, { src: PNG, alt: 'Detail' }];
const gallery = async (t, attrs = 'editable') => { const g = await t.mount(`<pk-image-gallery ${attrs}></pk-image-gallery>`); g.images = IMAGES.map(i => ({ ...i })); await t.settle(); await t.load(g.shadowRoot); return g; };
const tiles = g => [...g.part('grid').querySelectorAll('[data-index]')];

export const workspaceCases = [
    ['workspace (1200px): the nav, main and aside panes sit side by side, the phone strip is hidden, each pane holds its slot', async t => {
        const { doc } = await frame(t, WS, 1200);
        const ws = doc.querySelector('pk-workspace');
        t.ok(!shown(ws.part('strip')), 'no strip on a wide screen');
        const [n, m, a] = ['nav', 'main', 'aside'].map(p => pane(ws, p));
        t.ok(shown(n) && shown(m) && shown(a), 'all three panes show');
        const [rn, rm, ra] = [n, m, a].map(p => p.getBoundingClientRect());
        t.ok(rn.right <= rm.left + 1 && rm.right <= ra.left + 1, 'left to right: nav, main, aside');
        t.ok(Math.abs(rn.top - rm.top) < 2 && Math.abs(rm.top - ra.top) < 2, 'on one row');
        t.eq(ws.slotted('nav')[0].id, 'n'); t.eq(ws.slotted()[0].id, 'm'); t.eq(ws.slotted('aside')[0].id, 'a');
        t.eq(n.getAttribute('aria-label'), 'Files'); t.eq(a.getAttribute('role'), 'complementary');
        ws.asideOpen = false; await t.settle();
        t.ok(!shown(a), 'closing the aside removes its column'); t.ok(shown(n) && shown(m));
    }],

    ['workspace (375px, routed list and detail): the host sets the panes from the route, the tab carries the record name, the open row is marked and a tap on the list tab can be vetoed', async t => {
        const html = '<pk-workspace main-label="Things" aside-label="Thing"><pk-table label="Things" clickable columns=\'[{"key":"name","label":"Name"}]\' rows=\'[{"id":"1","name":"Blue"},{"id":"2","name":"Red"}]\'></pk-table><div slot="aside">Record</div></pk-workspace>';
        const { doc, win } = await frame(t, html, 375);
        await until(() => win.customElements.get('pk-table'), 'pk-table to be defined in the frame');
        const ws = doc.querySelector('pk-workspace'); const table = doc.querySelector('pk-table');
        const route = id => { ws.asideOpen = id !== null; ws.activePane = id !== null ? 'aside' : 'main'; ws.asideLabel = id === null ? 'Thing' : table.rows.find(r => r.id === id).name; table.currentRow = id ?? ''; };
        const rowOf = id => table.shadowRoot.querySelector(`tbody tr[data-id="${id}"]`);
        t.ok(!shown(tab(ws, 'aside')), 'no record: no record tab'); t.ok(shown(pane(ws, 'main')));
        route('2'); await t.settle();
        t.ok(shown(pane(ws, 'aside')) && !shown(pane(ws, 'main')), 'the record is its own pane on a phone'); t.eq(tab(ws, 'aside').textContent.trim(), 'Red', 'the tab names the record');
        t.eq(pane(ws, 'aside').getAttribute('aria-labelledby'), 'tab-aside'); t.eq(rowOf('2').getAttribute('aria-current'), 'true'); t.ok(!rowOf('1').hasAttribute('aria-current'));
        // A host that owns active-pane vetoes the tab and changes its own state instead; the event fires first and nothing moved yet.
        const seen = []; ws.addEventListener('pk-pane-change', e => { seen.push(e.detail); e.preventDefault(); route(null); });
        tab(ws, 'main').click(); await t.settle();
        t.eq(JSON.stringify(seen), JSON.stringify([{ pane: 'main', previous: 'aside' }])); t.ok(shown(pane(ws, 'main')) && !shown(tab(ws, 'aside')), 'the route closed the record'); t.eq(table.shadowRoot.querySelectorAll('tr[aria-current]').length, 0);
        t.eq(ws.activePane, 'main');
    }],

    ['workspace (375px): one pane at a time, the strip switches it, pk-pane-change reports it and can be cancelled', async t => {
        const { doc, win } = await frame(t, WS, 375);
        const ws = doc.querySelector('pk-workspace');
        t.ok(shown(ws.part('strip')), 'the strip shows on a phone');
        t.eq(['nav', 'main', 'aside'].filter(p => shown(pane(ws, p))).join(), 'main', 'only the main pane shows');
        t.eq(['nav', 'main', 'aside'].map(p => tab(ws, p).textContent.trim()).join(), 'Files,Content,Outline');
        t.eq(tab(ws, 'main').getAttribute('aria-selected'), 'true'); t.eq(tab(ws, 'nav').tabIndex, -1);
        t.ok(tab(ws, 'nav').getBoundingClientRect().height >= 43, 'a tab is a 44px touch target');
        t.eq(pane(ws, 'main').getAttribute('role'), 'tabpanel'); t.eq(pane(ws, 'main').getAttribute('aria-labelledby'), 'tab-main');
        const seen = []; ws.addEventListener('pk-pane-change', e => seen.push(e.detail));
        tab(ws, 'nav').click(); await t.settle();
        t.eq(['nav', 'main', 'aside'].filter(p => shown(pane(ws, p))).join(), 'nav', 'the nav pane replaced the main pane');
        t.eq(ws.activePane, 'nav'); t.eq(ws.getAttribute('active-pane'), 'nav', 'reflected');
        t.eq(JSON.stringify(seen), JSON.stringify([{ pane: 'nav', previous: 'main' }]));
        ws.addEventListener('pk-pane-change', e => e.preventDefault(), { once: true });
        tab(ws, 'aside').click(); await t.settle();
        t.eq(ws.activePane, 'nav', 'a cancelled change keeps the pane'); t.ok(shown(pane(ws, 'nav')) && !shown(pane(ws, 'aside')));
        tab(ws, 'aside').click(); await t.settle();
        t.ok(shown(pane(ws, 'aside')) && !shown(pane(ws, 'nav')), 'the aside is its own pane on a phone');
        const before = seen.length; ws.activePane = 'main'; await t.settle();
        t.eq(seen.length, before, 'setting the property raises no event'); t.ok(shown(pane(ws, 'main')));
        ws.asideOpen = false; ws.activePane = 'aside'; await t.settle();
        t.ok(shown(pane(ws, 'main')) && !shown(tab(ws, 'aside')), 'an aside that is not open falls back to the main pane');
        void win;
    }],

    ['workspace (375px): the strip is keyboard operable: roving tabindex, arrows, Home and End select and focus the tab', async t => {
        const { doc, win } = await frame(t, WS, 375);
        const ws = doc.querySelector('pk-workspace');
        const key = (el, k) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));
        tab(ws, 'main').focus(); key(tab(ws, 'main'), 'ArrowRight'); await t.settle();
        t.eq(ws.activePane, 'aside'); t.eq(ws.shadowRoot.activeElement, tab(ws, 'aside'), 'focus follows the selection');
        t.eq(tab(ws, 'aside').tabIndex, 0); t.eq(tab(ws, 'main').tabIndex, -1);
        key(tab(ws, 'aside'), 'ArrowRight'); await t.settle(); t.eq(ws.activePane, 'nav', 'wraps around');
        key(tab(ws, 'nav'), 'End'); await t.settle(); t.eq(ws.activePane, 'aside');
        key(tab(ws, 'aside'), 'Home'); await t.settle(); t.eq(ws.activePane, 'nav');
        key(tab(ws, 'nav'), 'ArrowLeft'); await t.settle(); t.eq(ws.activePane, 'aside');
        t.ok(shown(pane(ws, 'aside')) && !shown(pane(ws, 'nav')) && !shown(pane(ws, 'main')));
    }],

    ['workspace: without a nav there is no nav tab and no column; with no aside the strip is not needed', async t => {
        const { doc } = await frame(t, '<pk-workspace><div id="m">Only main</div></pk-workspace>', 375);
        const ws = doc.querySelector('pk-workspace');
        t.ok(!shown(ws.part('strip')), 'one pane needs no strip'); t.ok(shown(pane(ws, 'main')) && !shown(pane(ws, 'nav')));
        ws.activePane = 'nav'; await t.settle(); t.ok(shown(pane(ws, 'main')), 'a missing pane falls back to the main pane');
    }],

    ['workspace: fill takes the height of its parent and drops the frame; without it the height is a viewport share', async t => {
        const host = await t.mount('<div><pk-workspace fill><div slot="nav">Nav</div><div>Main</div></pk-workspace></div>');
        const parent = host; parent.style.display = 'flex'; parent.style.flexDirection = 'column'; parent.style.height = '333px';
        await t.settle();
        t.eq(Math.round(host.firstElementChild.getBoundingClientRect().height), 333, 'fills the parent');
        t.eq(getComputedStyle(host.firstElementChild.part('root')).borderTopWidth, '0px', 'no frame');
        host.firstElementChild.removeAttribute('fill'); await t.settle();
        t.ok(parseFloat(getComputedStyle(host.firstElementChild.part('root')).borderTopWidth) >= 1, 'framed again');
    }],

    ['image gallery: one tile per image, the primary one carries the Primary badge, status shows, read-only has no buttons or add tile', async t => {
        const g = await gallery(t, '');
        t.eq(tiles(g).length, 3);
        t.eq(g.shadowRoot.querySelectorAll('[part="badge"]').length, 1, 'one primary badge');
        t.ok(tiles(g)[0].hasAttribute('data-primary') && tiles(g)[0].querySelector('[part="badge"]').textContent.trim() === 'Primary');
        t.eq(tiles(g)[1].querySelector('[part="status"]').textContent.trim(), 'Staged');
        t.eq(tiles(g)[0].querySelector('img').alt, 'Front view');
        t.eq(g.shadowRoot.querySelectorAll('[data-action]').length, 0, 'no buttons when not editable');
        t.ok(!shown(g.part('add-tile')), 'no add tile');
        g.primary = 2; await t.settle();
        t.ok(tiles(g)[2].hasAttribute('data-primary') && !tiles(g)[0].hasAttribute('data-primary'), 'the primary property wins over the flag');
        g.images = [{ src: 'java' + 'script:alert(1)', alt: 'bad' }]; await t.settle();
        t.ok(!tiles(g)[0].querySelector('img').hasAttribute('src'), 'an unsafe source is never given to an image');
    }],

    ['image gallery: make primary moves the badge and raises pk-primary-change (cancelable); the primary has no make-primary button', async t => {
        const g = await gallery(t);
        t.eq(tiles(g)[0].querySelector('[data-action="primary"]'), null, 'the primary needs no button');
        const seen = []; g.addEventListener('pk-primary-change', e => seen.push(e.detail));
        tiles(g)[1].querySelector('[data-action="primary"]').click(); await t.settle();
        t.eq(JSON.stringify(seen), JSON.stringify([{ index: 1, src: PNG, previous: 0 }]));
        t.eq(g.primary, 1, 'primary reflects the choice'); t.eq(g.getAttribute('primary'), '1');
        t.ok(tiles(g)[1].hasAttribute('data-primary') && !tiles(g)[0].hasAttribute('data-primary'));
        t.eq(g.shadowRoot.querySelectorAll('[part="badge"]').length, 1);
        t.eq(g.images.filter(i => i.primary).length, 1, 'exactly one image flagged');
        g.addEventListener('pk-primary-change', e => e.preventDefault(), { once: true });
        tiles(g)[2].querySelector('[data-action="primary"]').click(); await t.settle();
        t.eq(g.primary, 1, 'a cancelled change keeps the primary');
        t.ok(/Make primary: Detail/.test(tiles(g)[2].querySelector('[data-action="primary"]').getAttribute('label')), 'the button names its image');
    }],

    ['image gallery: remove raises pk-remove (cancelable), drops the image, and removing the primary makes the first image primary', async t => {
        const g = await gallery(t);
        const seen = []; g.addEventListener('pk-remove', e => seen.push(e.detail));
        g.addEventListener('pk-remove', e => e.preventDefault(), { once: true });
        tiles(g)[2].querySelector('[data-action="remove"]').click(); await t.settle();
        t.eq(tiles(g).length, 3, 'a cancelled remove keeps the image');
        tiles(g)[1].querySelector('[data-action="remove"]').click(); await t.settle();
        t.eq(tiles(g).length, 2); t.eq(g.images.length, 2); t.eq(seen.length, 2); t.eq(seen[1].index, 1);
        t.ok(tiles(g)[0].hasAttribute('data-primary'), 'the primary is unchanged');
        g.primary = 1; await t.settle();
        tiles(g)[1].querySelector('[data-action="remove"]').click(); await t.settle();
        t.eq(tiles(g).length, 1); t.ok(tiles(g)[0].hasAttribute('data-primary'), 'the first image takes over');
        t.eq(g.primary, 0);
        tiles(g)[0].querySelector('[data-action="remove"]').click(); await t.settle();
        t.eq(tiles(g).length, 0); t.eq(g.primary, -1); t.ok(shown(g.part('add-tile')), 'the add tile remains');
    }],

    ['image gallery: the add tile is a real file input and raises pk-add with the chosen files', async t => {
        const g = await gallery(t);
        const input = g.part('file'); t.eq(input.type, 'file'); t.ok(input.multiple); t.eq(input.getAttribute('accept'), 'image/*');
        t.ok(shown(g.part('add-tile')) && g.part('add-text').textContent.trim() === 'Add image');
        let got = null; g.addEventListener('pk-add', e => { got = e.detail; });
        const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.png', { type: 'image/png' })); input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(got.names.join(), 'a.png'); t.eq(got.files.length, 1); t.eq(input.files.length, 0, 'the picker is reset for the next choice');
        g.addLabel = 'Upload photo'; await t.settle(); t.eq(g.part('add-text').textContent.trim(), 'Upload photo');
    }],

    ['image gallery: clicking a thumbnail opens the lightbox on that image', async t => {
        const g = await gallery(t);
        const box = tiles(g)[1].querySelector('pk-media').part('box');
        t.eq(box.getAttribute('role'), 'button', 'a thumbnail is a button');
        box.click(); const v = g.part('viewer'); await until(() => v.open, 'the lightbox to open');
        t.eq(v.index, 1); t.eq(v.items.length, 3); t.eq(v.items[1].alt, 'Back view');
        v.hide(); await t.settle();
    }],

    ['image gallery: columns fixes the count; min sets how many fit', async t => {
        const g = await gallery(t, 'columns="2"');
        const cols = () => getComputedStyle(g.part('grid')).gridTemplateColumns.split(' ').length;
        t.eq(cols(), 2, 'two fixed columns');
        g.columns = 0; g.min = '12rem'; await t.settle();
        const fit = cols();
        g.min = '6rem'; await t.settle();
        t.ok(cols() > fit, 'a smaller min fits more columns');
        g.min = 'calc(1px);x'; await t.settle(); t.ok(cols() >= 1, 'a bad length falls back to the default');
    }],

    ['image gallery (375px): three thumbnails fit a row, nothing overflows sideways, buttons and the add tile are touch sized', async t => {
        const { doc, win } = await frame(t, '<pk-image-gallery editable></pk-image-gallery>', 375, 700);
        const g = doc.querySelector('pk-image-gallery');
        g.images = IMAGES.map(i => ({ ...i })); await t.settle(); await wait(300);
        await until(() => win.customElements.get('pk-button') && g.shadowRoot.querySelector('[data-action]')?.shadowRoot, 'the buttons to upgrade');
        const rows = [...new Set(tiles(g).map(x => Math.round(x.getBoundingClientRect().top)))];
        t.eq(rows.length, 1, 'three tiles on one row at 375px');
        t.ok(doc.documentElement.scrollWidth <= 375, 'no horizontal scroll');
        const btn = tiles(g)[1].querySelector('[data-action="remove"]').part('control');
        t.ok(btn.getBoundingClientRect().height >= 43, 'a button is at least 44px high');
        t.ok(g.part('add').getBoundingClientRect().height >= 43, 'the add tile is at least 44px high');
    }],
];
