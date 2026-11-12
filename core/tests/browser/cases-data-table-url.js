// Browser cases for pk-data-table urlState (#1946, query mode): the view in the address, written with replaceState and read back on the first load.
// The fixture (url-state-frame.html) is a pk-data-table whose load records every query in window.calls; ?_us, ?_init and ?_two are its own controls.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 150; i++) { if (fn()) return; await wait(40); } throw new Error(`timed out waiting for ${what}`); };

async function open(t, search, hash = '', lists = 1) {
    const host = t.stage(''), fr = document.createElement('iframe');
    fr.title = 'list url state'; fr.style.cssText = 'width:1280px;height:800px;border:0;display:block';
    fr.src = new URL('./url-state-frame.html', import.meta.url).href + search + hash;
    await new Promise(resolve => { fr.addEventListener('load', resolve, { once: true }); host.append(fr); });
    const win = fr.contentWindow, d = win.document;
    await Promise.all(['pk-data-table', 'pk-table', 'pk-table-filters', 'pk-pagination'].map(tag => win.customElements.whenDefined(tag)));
    await until(() => win.calls.length >= lists, 'the first load');
    await wait(150);
    const dt = id => d.getElementById(id ?? 'list');
    const ev = (el, name, detail, bubbles = false) => el.dispatchEvent(new win.CustomEvent(name, { detail, bubbles }));
    return {
        fr, win, d, dt, params: () => new win.URL(win.location.href).searchParams, calls: () => win.calls,
        search: async (id, query) => { ev(dt(id).part('filters'), 'pk-search', { query }); await wait(120); },
        sort: async (id, key, direction) => { ev(dt(id).part('table'), 'pk-sort', { key, direction }); await wait(120); },
        page: async (id, page) => { ev(dt(id).part('pagination'), 'pk-page', { page }); await wait(120); },
        filter: async (id, key, value) => { ev(dt(id).shadowRoot.querySelector(`[data-key="${key}"]`), 'pk-value-change', { value }, true); await wait(120); },
    };
}

export const dataTableUrlCases = [
    ['data-table urlState: a search, filter, sort and page are written to the address; other parameters and the hash stay, no history entry is added (#1946)', async t => {
        const f = await open(t, '?_us=&x=1', '#frag'), before = f.win.history.length;
        await f.search(null, 'ebay'); await f.filter(null, 'channel', 'etsy'); await f.sort(null, 'name', 'descending'); await f.page(null, 3);
        const p = f.params();
        t.ok(p.get('q') === 'ebay' && p.get('sort') === 'name' && p.get('desc') === '1' && p.get('page') === '3' && p.get('f.channel') === 'etsy', `the view is in the address (${f.win.location.search})`);
        t.ok(p.get('x') === '1' && p.get('_us') === '' && f.win.location.hash === '#frag', 'other parameters and the hash are kept');
        t.ok(f.win.history.length === before, `no history entry is added (${before} -> ${f.win.history.length})`);
        await f.search(null, ''); await f.page(null, 1);
        t.ok(!f.params().has('q') && !f.params().has('page'), `defaults are omitted (${f.win.location.search})`);
        f.fr.remove();
    }],
    ['data-table urlState: the first load reads the address (search, sort, page, filter), seeds the controls, and wins over the initial props (#1946)', async t => {
        const f = await open(t, '?_us=&q=a&sort=name&desc=1&page=3&f.channel=etsy'), c = f.calls();
        t.ok(c.length === 1 && c[0].page === 3 && c[0].sort === 'name' && c[0].sortDir === 'descending' && c[0].search === 'a' && c[0].filters.channel === 'etsy', `the first load gets the address query exactly (${JSON.stringify(c)})`);
        t.eq(f.dt().part('filters').shadowRoot.querySelector('[part=search]').value, 'a', 'the search box shows it');
        t.eq(f.dt().shadowRoot.querySelector('[data-key="channel"]').value, 'etsy', 'the filter control shows it');
        f.fr.remove();
        const g = await open(t, '?_us=&_init=1&q=addr');
        t.ok(g.calls()[0].search === 'addr' && g.calls()[0].page === 2 && g.calls()[0].sort === 'channel', `the address wins for what it names, the initial props fill the rest (${JSON.stringify(g.calls()[0])})`);
        g.fr.remove();
        const h = await open(t, '?_us=&_init=1');
        t.ok(h.calls()[0].search === 'init' && h.calls()[0].page === 2, 'an empty address leaves the initial props');
        h.fr.remove();
    }],
    ['data-table urlState in a hash-routed app (#/path?query): the view is written inside the hash, search and the hash path stay, a reload restores it (#1946)', async t => {
        const f = await open(t, '?_us=&keep=1', '#/orders?x=1'), before = f.win.history.length;
        await f.search(null, 'ebay'); await f.sort(null, 'name', 'descending'); await f.page(null, 3);
        const h = f.win.location.hash, hp = new URLSearchParams(h.slice(h.indexOf('?') + 1));
        t.ok(h.startsWith('#/orders?') && hp.get('x') === '1' && hp.get('q') === 'ebay' && hp.get('sort') === 'name' && hp.get('desc') === '1' && hp.get('page') === '3', `the view is inside the hash, the route and x kept (${h})`);
        t.eq(f.win.location.search, '?_us=&keep=1', 'location.search is untouched');
        t.ok(f.win.history.length === before, 'no history entry is added');
        t.eq(f.win.urlEvents.at(-1), f.win.location.pathname + f.win.location.search + f.win.location.hash, 'pk-url-change carries the address');
        const loaded = new Promise(r => f.fr.addEventListener('load', r, { once: true })); f.win.location.reload(); await loaded;
        await until(() => f.fr.contentWindow.calls?.length >= 1, 'the load after the reload'); await wait(150);
        const c = f.fr.contentWindow.calls[0];
        t.ok(c.search === 'ebay' && c.page === 3 && c.sort === 'name' && c.sortDir === 'descending', `the reload restores the view from the hash (${JSON.stringify(c)})`);
        f.fr.remove();
    }],
    ['data-table urlState: two lists with prefixes a and b keep their own parameters, and urlState off writes nothing (#1946)', async t => {
        const f = await open(t, '?_two=1&a.page=2&b.q=x', '', 2), c = f.calls();
        t.ok(c.find(x => x.id === 'a').page === 2 && c.find(x => x.id === 'b').search === 'x', 'each list reads only its own prefix');
        await f.page('a', 4);
        t.ok(f.params().get('a.page') === '4' && f.params().get('b.q') === 'x' && !f.params().has('page') && !f.params().has('q'), `list a wrote a.page and left b alone (${f.win.location.search})`);
        f.fr.remove();
        const g = await open(t, '?x=1');
        await g.page(null, 2);
        t.eq(g.win.location.search, '?x=1', 'without urlState the address is untouched');
        g.fr.remove();
    }],
    ['data-table urlState: Clear filters and a page past the last settle the address, and pk-url-change carries it (#1946)', async t => {
        const f = await open(t, '?_us=&f.channel=etsy&page=99');
        await until(() => f.calls().at(-1).page === 12, 'the page clamp');
        await wait(150);
        t.eq(f.params().get('page'), '12', 'the clamped page is in the address');
        t.eq(f.win.urlEvents.at(-1), f.win.location.pathname + f.win.location.search + f.win.location.hash, 'pk-url-change carries the address as the browser shows it');
        f.dt().part('filters').dispatchEvent(new f.win.CustomEvent('pk-clear-filters')); await wait(200);
        t.ok(!f.params().has('f.channel'), `Clear filters removes the filter from the address (${f.win.location.search})`);
        f.fr.remove();
    }],
];
