// Browser cases for the data display and content elements. Same shape as cases.js: [name, async (t) => void].
const wait = ms => new Promise(r => setTimeout(r, ms));
const cols = '[{"key":"sku","label":"SKU","sortable":true},{"key":"price","label":"Price","type":"number","sortable":true}]';
const rows = '[{"id":1,"sku":"B","price":"$10"},{"id":2,"sku":"A","price":"$2"},{"id":3,"sku":"C","price":"$5"}]';
const bodyIds = el => [...el.shadowRoot.querySelectorAll('tbody tr')].map(r => r.dataset.id);

const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

export const dataDisplayCases = [
    ['skeleton: text variant sets the line count, circle and block take a size, the label is for assistive tech', async t => {
        const s = await t.mount('<pk-skeleton variant="text" lines="5"></pk-skeleton>');
        t.eq(s.style.getPropertyValue('--pk-skeleton-lines'), '5'); t.eq(s.part('label').textContent, 'Loading');
        s.variant = 'circle'; s.size = '3rem'; await t.settle(); t.eq(s.style.getPropertyValue('--pk-skeleton-size'), '3rem');
    }],

    ['spinner: is a status region with a label, and each variant shows only its own shape', async t => {
        const s = await t.mount('<pk-spinner label="Saving" variant="dots"></pk-spinner>');
        t.eq(s.internals.role, 'status'); t.eq(s.part('label').textContent, 'Saving');
        t.ok(getComputedStyle(s.part('dots')).display.endsWith('flex')); t.eq(getComputedStyle(s.part('ring')).display, 'none');
        s.variant = 'ring'; await t.settle(); t.eq(getComputedStyle(s.part('dots')).display, 'none');
    }],

    ['progress: native bar carries value and max, shows the percentage, goes indeterminate and colours by threshold', async t => {
        const p = await t.mount('<pk-progress label="Import" value="60" show-value level-thresholds="70,90"></pk-progress>');
        const bar = p.part('bar');
        t.eq(bar.value, 60); t.eq(bar.max, 100); t.eq(p.part('value').textContent, '60%'); t.eq(p.dataset.level, 'ok');
        p.value = 95; await t.settle(); t.eq(p.dataset.level, 'danger');
        p.indeterminate = true; await t.settle(); t.ok(!bar.hasAttribute('value'), 'no value while indeterminate'); t.ok(bar.matches(':indeterminate'));
    }],

    ['badge: caps a count, lets the slot win, and dot mode shows the dot', async t => {
        const b = await t.mount('<pk-badge count="120"></pk-badge>');
        t.eq(b.part('count').textContent, '99+'); b.max = 0; await t.settle(); t.eq(b.part('count').textContent, '120');
        const c = await t.mount('<pk-badge dot variant="ok">Online</pk-badge>');
        t.ok(!c.part('dot').hidden); t.eq(c.textContent, 'Online');
    }],

    ['tag: remove button fires a cancelable pk-remove with the value, and removes the tag unless cancelled', async t => {
        const host = t.stage('<pk-tag removable value="m">Green</pk-tag><pk-tag removable>DC</pk-tag>');
        await t.load(host);
        const [a, b] = host.querySelectorAll('pk-tag'); let detail = null;
        a.addEventListener('pk-remove', e => { detail = e.detail; e.preventDefault(); });
        a.part('remove').click(); await t.settle();
        t.eq(detail.value, 'm'); t.ok(a.isConnected, 'cancelled: the tag stays');
        t.eq(b.part('remove').getAttribute('aria-label'), 'Remove DC');
        b.part('remove').click(); await t.settle(); t.ok(!b.isConnected, 'not cancelled: the tag removes itself');
        const c = t.stage('<pk-tag removable controlled>Kept</pk-tag>').firstElementChild; await t.load(c.parentElement); let n = 0; c.addEventListener('pk-remove', () => n++);
        c.part('remove').click(); await t.settle(); t.eq(n, 1); t.ok(c.isConnected, 'controlled: only the host removes it');
    }],

    ['avatar: initials, a stable colour slot, an accessible name with status; the group hides overflow and shows +N', async t => {
        const host = t.stage('<pk-avatar name="Ada Lovelace" status="online"></pk-avatar><pk-avatar name="Ada Lovelace"></pk-avatar><pk-avatar-group max="2"><pk-avatar name="A B"></pk-avatar><pk-avatar name="C D"></pk-avatar><pk-avatar name="E F"></pk-avatar></pk-avatar-group>');
        await t.load(host);
        const [a, a2] = host.querySelectorAll(':scope > pk-avatar'); const g = host.querySelector('pk-avatar-group');
        t.eq(a.part('initials').textContent, 'AL'); t.eq(a.dataset.slot, a2.dataset.slot, 'same name, same colour');
        t.eq(a.internals.ariaLabel, 'Ada Lovelace, online'); t.eq(a.internals.role, 'img');
        const kids = g.querySelectorAll('pk-avatar');
        t.ok(!kids[1].hidden && kids[2].hidden, 'the third avatar is hidden'); t.eq(g.part('more').textContent, '+1'); t.ok(!g.part('more').hidden);
    }],

    ['pagination: renders a window with ellipses, next and page buttons emit a cancelable pk-page, and the select changes the size', async t => {
        const p = await t.mount('<pk-pagination page="1" pages="20" total="500" page-size="25" sizes="[10,25,50]"></pk-pagination>');
        const nums = () => [...p.part('numbers').children].map(c => c.textContent);
        t.eq(nums().join(','), '1,2,3,4,5,…,20'); t.eq(p.part('summary').textContent, '1–25 of 500'); t.ok(p.part('prev').disabled);
        const got = []; p.addEventListener('pk-page', e => got.push(e.detail.page));
        p.part('next').click(); await t.settle(); t.eq(p.page, 2); t.eq(got[0], 2);
        p.part('numbers').querySelector('[data-page="4"]').click(); await t.settle(); t.eq(p.page, 4);
        t.eq(p.part('numbers').querySelector('[aria-current="page"]').textContent, '4');
        p.addEventListener('pk-page', e => e.preventDefault(), { once: true }); p.part('next').click(); await t.settle(); t.eq(p.page, 4, 'cancelled: page unchanged');
        let size = 0; p.addEventListener('pk-page-size', e => { size = e.detail.pageSize; });
        const sel = p.part('size-select'); sel.value = '50'; sel.dispatchEvent(new Event('change', { bubbles: true })); await t.settle(); t.eq(size, 50); t.eq(p.pageSize, 50);
        const m = await t.mount('<pk-pagination mode="load-more"></pk-pagination>'); let more = 0; m.addEventListener('pk-load-more', () => more++);
        t.ok(getComputedStyle(m.part('more')).display !== 'none'); t.eq(getComputedStyle(m.part('pages')).display, 'none'); m.part('more').click(); t.eq(more, 1);
    }],

    ['table: current-row marks the open record with aria-current and a tint, follows the host, and the element never changes it', async t => {
        const el = await t.mount(`<pk-table label="P" clickable current-row="2" columns='${cols}' rows='${rows}'></pk-table>`);
        const row = id => el.shadowRoot.querySelector(`tbody tr[data-id="${id}"]`);
        t.eq(row('2').getAttribute('aria-current'), 'true'); t.ok(!row('1').hasAttribute('aria-current'), 'only the current row is marked');
        t.ok(getComputedStyle(row('2')).backgroundColor !== getComputedStyle(row('1')).backgroundColor, 'and tinted');
        row('3').querySelector('td').click(); await t.settle(); t.eq(el.currentRow, '2', 'a click reports pk-row-click; the host decides what is current');
        el.currentRow = '3'; await t.settle(); t.eq(row('3').getAttribute('aria-current'), 'true'); t.ok(!row('2').hasAttribute('aria-current'));
        el.currentRow = ''; await t.settle(); t.eq(el.shadowRoot.querySelectorAll('tr[aria-current]').length, 0, 'empty marks no row');
    }],

    ['table: renders rows from JSON attributes, sorts on a header click with aria-sort, and a cancelled pk-sort leaves the order', async t => {
        const el = await t.mount(`<pk-table label="P" columns='${cols}' rows='${rows}'></pk-table>`);
        t.eq(bodyIds(el).join(), '1,2,3'); t.eq(el.shadowRoot.querySelector('th[data-key="sku"]').getAttribute('aria-sort'), 'none');
        el.shadowRoot.querySelector('th[data-key="sku"] button').click(); await t.settle();
        t.eq(bodyIds(el).join(), '2,1,3'); t.eq(el.shadowRoot.querySelector('th[data-key="sku"]').getAttribute('aria-sort'), 'ascending');
        el.shadowRoot.querySelector('th[data-key="sku"] button').click(); await t.settle(); t.eq(bodyIds(el).join(), '3,1,2', 'descending');
        el.shadowRoot.querySelector('th[data-key="price"] button').click(); await t.settle(); t.eq(bodyIds(el).join(), '2,3,1', 'numbers sort as numbers');
        el.addEventListener('pk-sort', e => e.preventDefault(), { once: true });
        el.shadowRoot.querySelector('th[data-key="sku"] button').click(); await t.settle(); t.eq(el.sort, 'price', 'cancelled: sort unchanged');
    }],

    ['table: manual mode shows rows as given and only reports; selection, bulk bar, filter event, loading and empty states', async t => {
        const el = await t.mount(`<pk-table manual selectable filterable columns='${cols}' rows='${rows}'><span slot="bulk">bulk</span></pk-table>`);
        let sorted = null; el.addEventListener('pk-sort', e => { sorted = e.detail; });
        el.shadowRoot.querySelector('th[data-key="sku"] button').click(); await t.settle();
        t.eq(sorted.key, 'sku'); t.eq(bodyIds(el).join(), '1,2,3', 'the host owns the order');
        const all = el.shadowRoot.querySelector('[data-select-all]'); t.ok(el.part('bulk').hidden);
        const got = []; el.addEventListener('pk-select', e => got.push(e.detail.selected));
        all.checked = true; all.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(got.at(-1).join(), '1,2,3'); t.ok(!el.part('bulk').hidden); t.eq(el.part('bulk-count').textContent, '3 selected');
        const one = el.shadowRoot.querySelector('[data-select="2"]'); one.checked = false; one.dispatchEvent(new Event('change', { bubbles: true })); await t.settle();
        t.eq(got.at(-1).join(), '1,3'); t.eq(el.shadowRoot.querySelector('[data-select-all]').indeterminate, true);
        let f = null; el.addEventListener('pk-filter', e => { f = e.detail.filters; });
        const inp = el.shadowRoot.querySelector('[data-filter="sku"]'); inp.value = 'A'; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(330);
        t.eq(f.sku, 'A');
        el.loading = true; await t.settle(); t.eq(el.shadowRoot.querySelectorAll('tbody tr[data-skeleton]').length, 1); t.eq(el.part('table').getAttribute('aria-busy'), 'true');
        el.loading = false; el.rows = []; await t.settle(); t.ok(!el.part('empty').hidden, 'empty message shows');
    }],

    ['table: slotted-table mode frames a raw table, hides its own table, and flow drops the scroll container', async t => {
        const el = await t.mount('<pk-table label="Raw"><table><thead><tr><th>SKU</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table><button slot="toolbar">Add</button></pk-table>');
        t.ok(el.part('table').hidden, 'the data-driven table is hidden'); t.eq(el.part('scroll').querySelector('slot').assignedElements()[0].localName, 'table');
        t.ok(!el.part('toolbar').hidden); t.ok(el.part('bulk').hidden && el.part('empty').hidden);
        t.eq(getComputedStyle(el.part('scroll')).overflowX, 'auto'); el.flow = true; await t.settle(); t.eq(getComputedStyle(el.part('scroll')).overflowX, 'visible');
    }],

    ['table: filters and sorts locally when not manual, and a slotted cell replaces the text', async t => {
        const el = await t.mount(`<pk-table filterable columns='${cols}' rows='${rows}'><b slot="cell-1-sku">custom</b></pk-table>`);
        t.ok(el.shadowRoot.querySelector('tbody tr[data-id="1"] slot[name="cell-1-sku"]'), 'cell slot rendered');
        el.filters = { sku: 'a' }; await t.settle(); t.eq(bodyIds(el).join(), '2');
    }],

    ['table: one click on a select checkbox raises pk-select once (change and input both fire)', async t => {
        const el = await t.mount(`<pk-table selectable columns='${cols}' rows='${rows}'></pk-table>`);
        const got = []; el.addEventListener('pk-select', e => got.push(e.detail.selected.join()));
        const seen = []; for (const n of ['change', 'input']) el.shadowRoot.addEventListener(n, e => { if (e.target.matches('[data-select]')) seen.push(n); });
        el.shadowRoot.querySelector('[data-select="2"]').click(); await t.settle();
        t.eq(seen.sort().join(), 'change,input', 'the browser raised both events'); t.eq(got.join('|'), '2', 'one pk-select');
        el.shadowRoot.querySelector('[data-select-all]').click(); await t.settle(); t.eq(got.join('|'), '2|1,2,3', 'select all: one more');
    }],

    ['table: the same header cycles ascending, descending, cleared; pk-sort reports a null key, also in manual mode', async t => {
        const th = el => el.shadowRoot.querySelector('th[data-key="sku"]');
        const el = await t.mount(`<pk-table columns='${cols}' rows='${rows}'></pk-table>`);
        const seen = []; el.addEventListener('pk-sort', e => seen.push(`${e.detail.key}/${e.detail.direction}`));
        for (const want of ['2,1,3', '3,1,2', '1,2,3']) { th(el).querySelector('button').click(); await t.settle(); t.eq(bodyIds(el).join(), want); }
        t.eq(seen.join(), 'sku/ascending,sku/descending,null/null'); t.eq(th(el).getAttribute('aria-sort'), 'none'); t.eq(el.sort, '');
        th(el).querySelector('button').click(); await t.settle(); t.eq(th(el).getAttribute('aria-sort'), 'ascending', 'the cycle starts again');
        const m = await t.mount(`<pk-table manual columns='${cols}' rows='${rows}'></pk-table>`); const got = [];
        m.addEventListener('pk-sort', e => got.push(String(e.detail.key)));
        for (let i = 0; i < 3; i++) { th(m).querySelector('button').click(); await t.settle(); }
        t.eq(got.join(), 'sku,sku,null'); t.eq(th(m).getAttribute('aria-sort'), 'none'); t.eq(bodyIds(m).join(), '1,2,3');
    }],

    ['table: clickable rows are tab stops and Enter or Space on the row raises pk-row-click; controls inside the row do not', async t => {
        const el = await t.mount(`<pk-table clickable selectable columns='${cols}' rows='${rows}'></pk-table>`);
        const trs = await until(() => { const r = [...el.shadowRoot.querySelectorAll('tbody tr')]; return r.length === 3 && r.every(x => x.tabIndex === 0) && r; }, 'focusable rows');
        const got = []; el.addEventListener('pk-row-click', e => got.push(e.detail.id));
        trs[1].focus(); t.eq(el.shadowRoot.activeElement, trs[1], 'a row can take focus');
        key(trs[1], 'Enter'); key(trs[2], ' '); key(trs[0], 'a'); t.eq(got.join(), '2,3', 'Enter and Space, nothing for other keys');
        const box = trs[0].querySelector('input'); box.focus(); key(box, 'Enter'); box.click(); await t.settle(); t.eq(got.join(), '2,3', 'the checkbox keeps its keys and clicks');
        const plain = await t.mount(`<pk-table columns='${cols}' rows='${rows}'></pk-table>`); await t.settle();
        t.ok([...plain.shadowRoot.querySelectorAll('tbody tr')].every(x => !x.hasAttribute('tabindex')), 'a table that is not clickable adds no tab stops');
    }],

    ['table (375px): a hidePhone column is hidden in the table and in the cards layout; at 1200px it shows', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = `<pk-table cards label="P" columns='[{"key":"sku","label":"SKU"},{"key":"note","label":"Note","hidePhone":true}]' rows='[{"id":1,"sku":"A","note":"n1"}]'></pk-table>`;
        const at = async width => {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '320px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            const el = await until(() => f.contentWindow.customElements.get('pk-table') && f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td'), 'the table');
            const tb = f.contentDocument.querySelector('pk-table'), w = f.contentWindow;
            const shown = q => { const c = tb.shadowRoot.querySelector(q); return w.getComputedStyle(c).display !== 'none'; };
            return { td: shown('tbody td[data-hide-phone]'), other: shown('tbody td:not([data-hide-phone])'), w: w.innerWidth };
        };
        const phone = await at(375); t.eq(phone.w, 375); t.ok(phone.other, 'the SKU shows'); t.ok(!phone.td, 'the hidePhone cell is hidden in a card');
        const wide = await at(1200); t.ok(wide.td, 'shown on a wide screen');
    }],

    ['stat: shows the change with an arrow, sign, colour and spoken form; an href makes one link; a sparkline draws', async t => {
        const s = await t.mount('<pk-stat label="Sales" value="$18k" delta="12.5" versus="last month" values="[1,3,2,5]" href="#x"></pk-stat>');
        const d = s.part('delta');
        t.ok(!d.hidden); t.ok(d.textContent.includes('+12.5%')); t.eq(d.dataset.trend, 'good'); t.ok(d.querySelector('.sr').textContent.includes('up 12.5 percent versus last month'));
        s.invert = true; await t.settle(); t.eq(s.part('delta').dataset.trend, 'bad');
        t.ok(s.part('spark').querySelector('polyline'), 'sparkline drawn'); t.eq(s.part('link').getAttribute('href'), '#x');
        let hit = null; s.addEventListener('pk-activate', e => { hit = e.detail.href; e.preventDefault(); }); s.part('link').click(); t.eq(hit, '#x');
        const n = await t.mount('<pk-stat label="Open" value="3"></pk-stat>'); t.ok(n.part('delta').hidden); t.ok(n.part('link').hidden);
    }],

    ['stat: delta-unit points reads +4 pts and is spoken as points; the default stays percent', async t => {
        const s = await t.mount('<pk-stat label="Score" value="87" delta="4" delta-unit="points" versus="last run"></pk-stat>');
        t.ok(s.part('delta').textContent.includes('+4 pts')); t.ok(!s.part('delta').textContent.includes('%')); t.ok(s.part('delta').querySelector('.sr').textContent.includes('up 4 points versus last run'));
        s.deltaUnit = 'percent'; await t.settle(); t.ok(s.part('delta').textContent.includes('+4%'));
    }],

    ['empty-state: hides what is not given, exposes the heading level, and announces when asked', async t => {
        const e = await t.mount('<pk-empty-state heading="Nothing" level="2" announce></pk-empty-state>');
        t.ok(!e.part('heading').hidden); t.eq(e.part('heading').getAttribute('aria-level'), '2'); t.ok(e.part('description').hidden); t.eq(e.internals.role, 'status');
        const f = await t.mount('<pk-empty-state description="Only text"></pk-empty-state>'); t.ok(f.part('heading').hidden);
    }],

    ['field-list: hides an empty heading and lays dt and dd out as a grid', async t => {
        const l = await t.mount('<pk-field-list heading="IDs"><dt>SKU</dt><dd>X</dd></pk-field-list>');
        t.ok(!l.part('heading').hidden); t.eq(getComputedStyle(l.part('list')).display, 'grid');
        const m = await t.mount('<pk-field-list><dt>A</dt><dd>B</dd></pk-field-list>'); t.ok(m.part('heading').hidden);
    }],

    ['field-list: a page re-flows the columns through --pk-field-list-columns without touching the shadow root', async t => {
        const l = await t.mount('<pk-field-list><dt>A</dt><dd>B</dd></pk-field-list>');
        const cols = () => getComputedStyle(l.part('list')).gridTemplateColumns.split(' ').length;
        t.eq(cols(), matchMedia('(max-width: 640px)').matches ? 1 : 2); l.style.setProperty('--pk-field-list-columns', '1fr 1fr 1fr 1fr'); t.eq(cols(), 4);
    }],

    ['card: media slot shows only when used, horizontal lays out in a row, href adds one link', async t => {
        const c = await t.mount('<pk-card heading="H" orientation="horizontal" href="#c"><svg slot="media" viewBox="0 0 1 1"></svg>Body</pk-card>');
        t.ok(getComputedStyle(c.part('media')).display !== 'none'); t.eq(c.part('link').getAttribute('href'), '#c');
        const d = await t.mount('<pk-card heading="H">Body</pk-card>'); t.eq(getComputedStyle(d.part('media')).display, 'none'); t.ok(d.part('link').hidden);
    }],

    ['timeline: list role on the feed, listitem on each item, and a time element', async t => {
        const el = await t.mount('<pk-timeline label="Order"><pk-timeline-item heading="A" time="2026-09-18" status="done"></pk-timeline-item><pk-timeline-item heading="B"></pk-timeline-item></pk-timeline>');
        t.eq(el.internals.role, 'list'); t.eq(el.internals.ariaLabel, 'Order');
        const [a, b] = el.querySelectorAll('pk-timeline-item'); t.eq(a.internals.role, 'listitem'); t.eq(a.part('time').getAttribute('datetime'), '2026-09-18'); t.ok(b.part('time').hidden);
    }],

    ['list-group: rows become list items and an actionable row marks the current one', async t => {
        const el = await t.mount('<pk-list-group variant="action" label="Go"><a href="#a">A</a><a href="#b" aria-current="page">B</a></pk-list-group>');
        t.eq(el.internals.role, 'list'); t.ok([...el.children].every(c => c.getAttribute('role') === 'listitem'));
    }],

    ['accordion: an item toggles its details and reports it; exclusive closes the others', async t => {
        const el = await t.mount('<pk-accordion exclusive><pk-accordion-item heading="A" open>a</pk-accordion-item><pk-accordion-item heading="B">b</pk-accordion-item></pk-accordion>');
        const [a, b] = el.querySelectorAll('pk-accordion-item'); t.ok(a.part('details').open);
        let ev = null; b.addEventListener('pk-toggle', e => { ev = e.detail; });
        b.part('details').open = true; await wait(50); await t.settle();
        t.eq(b.open, true); t.eq(ev.open, true); t.eq(a.open, false, 'exclusive closed the first'); t.eq(a.part('details').open, false);
    }],

    ['tree: roving focus, arrow keys, expand and collapse, selection and aria attributes', async t => {
        const el = await t.mount('<pk-tree label="Cats"><pk-tree-item label="Books"><pk-tree-item label="Green"></pk-tree-item><pk-tree-item label="DC"></pk-tree-item></pk-tree-item><pk-tree-item label="Cards"></pk-tree-item></pk-tree>');
        await t.settle();
        const [books, green, , cards] = el.querySelectorAll('pk-tree-item');
        t.eq(el.internals.role, 'tree'); t.eq(books.internals.role, 'treeitem'); t.eq(books.internals.ariaExpanded, 'false'); t.eq(books.tabIndex, 0); t.eq(cards.tabIndex, -1);
        books.focus(); t.key(books, 'ArrowRight'); await t.settle(); t.eq(books.expanded, true); t.eq(books.internals.ariaExpanded, 'true');
        t.key(books, 'ArrowDown'); await t.settle(); t.eq(document.activeElement, green); t.eq(green.internals.ariaLevel, '2');
        t.key(green, 'Enter'); await t.settle(); t.eq(el.value, 'Green'); t.eq(green.selected, true); t.eq(green.internals.ariaSelected, 'true');
        t.key(green, 'ArrowLeft'); await t.settle(); t.eq(document.activeElement, books);
        t.key(books, 'ArrowLeft'); await t.settle(); t.eq(books.expanded, false);
        t.key(books, 'c'); await t.settle(); t.eq(document.activeElement, cards, 'type-ahead');
    }],

    ['chart: draws a labelled svg from the table, adds a legend for several series, keeps the table, and takes a data property', async t => {
        const c = await t.mount('<pk-chart kind="bar" caption="S"><table><thead><tr><th>M</th><th>A</th><th>B</th></tr></thead><tbody><tr><th>Jan</th><td>4</td><td>2</td></tr><tr><th>Feb</th><td>6</td><td>3</td></tr></tbody></table></pk-chart>');
        const svg = c.part('plot').querySelector('svg');
        t.eq(svg.getAttribute('role'), 'img'); t.ok(svg.getAttribute('aria-label').startsWith('Bar chart')); t.eq(svg.querySelectorAll('rect').length, 4);
        t.eq(c.part('legend').children.length, 2); t.ok(!c.part('data').hidden, 'the data table is offered');
        const d = await t.mount('<pk-chart kind="donut"></pk-chart>'); d.data = { labels: ['a', 'b'], series: [{ name: 'S', values: [1, 3] }] }; await t.settle();
        t.eq(d.part('plot').querySelectorAll('.chart-donut-seg').length, 2); t.ok(d.part('data').hidden);
    }],

    ['code-block: one line per source line with numbers, wrap toggle and a copy result', async t => {
        const c = await t.mount('<pk-code-block label="a.js" line-numbers>const a = 1;\nconst b = 2;</pk-code-block>');
        t.eq(c.part('code').querySelectorAll('.line').length, 2); t.eq(c.part('body').getAttribute('aria-label'), 'a.js');
        c.part('wrap').click(); await t.settle(); t.eq(c.wrap, true); t.eq(c.part('wrap').getAttribute('aria-pressed'), 'true');
        let ok = null; c.addEventListener('pk-copy', e => { ok = e.detail.ok; });
        const orig = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
        c.part('copy').click(); await wait(20); await t.settle();
        Object.defineProperty(navigator, 'clipboard', { value: orig, configurable: true });
        t.eq(ok, true); t.eq(c.part('status').textContent, 'Copied');
    }],

    ['calendar: shows the month, selects a day with a cancelable event, moves with keys and pages months', async t => {
        const c = await t.mount('<pk-calendar value="2026-09-19" week-start="1" marks=\'["2026-09-05"]\'></pk-calendar>');
        t.eq(c.part('title').textContent, 'September 2026'); t.eq(c.part('days').querySelectorAll('.day').length % 7, 0);
        t.eq(c.part('days').querySelector('[aria-selected="true"]').textContent, '19'); t.ok(c.part('days').querySelector('[data-mark]'));
        let v = null; c.addEventListener('pk-select', e => { v = e.detail.value; });
        c.part('days').querySelector('[data-date="2026-09-21"]').click(); await t.settle(); t.eq(v, '2026-09-21'); t.eq(c.value, '2026-09-21');
        const day = c.part('days').querySelector('[data-date="2026-09-21"]'); day.focus();
        t.ok(day.tabIndex === 0);
        day.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, composed: true, cancelable: true })); await t.settle();
        t.eq(c.part('title').textContent, 'October 2026'); t.eq(c.shadowRoot.activeElement?.dataset.date, '2026-10-21');
        c.part('prev').click(); await t.settle(); t.eq(c.part('title').textContent, 'September 2026');
    }],

    ['divider, media and hint: separator role, ratio and lightbox event, and a hint that toggles in flow', async t => {
        const d = await t.mount('<pk-divider vertical>or</pk-divider>'); t.eq(d.internals.role, 'separator'); t.eq(d.internals.ariaOrientation, 'vertical'); t.eq(d.hasAttribute('data-labelled'), true);
        const m = await t.mount('<pk-media ratio="4/3" lightbox caption="C"><img alt="cover" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></pk-media>');
        t.eq(m.style.getPropertyValue('--_r'), '4 / 3'); t.eq(m.part('box').getAttribute('role'), 'button');
        let open = null; m.addEventListener('pk-open', e => { open = e.detail; }); m.part('box').click(); t.eq(open.alt, 'cover'); t.eq(open.caption, 'C');
        const h = await t.mount('<pk-hint label="Why?">Because.</pk-hint>'); t.ok(h.part('panel').hidden); t.eq(h.part('toggle').getAttribute('aria-expanded'), 'false');
        h.part('toggle').click(); await t.settle(); t.ok(!h.part('panel').hidden); t.eq(h.part('toggle').getAttribute('aria-expanded'), 'true');
    }],

    ['gallery: attributes narrow the framed view, theme and width apply, a changed attribute reloads it, the frame follows the content height', async t => {
        const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
        const el = await t.mount('<pk-gallery kind="elements" group="Form controls" theme="light" width="phone" filter="tag"></pk-gallery>');
        const frame = el.part('frame');
        frame.loading = 'eager'; // The stage sits off-screen, where a lazy frame may never be asked to load; the element keeps loading=lazy for real pages, the test forces it.
        t.ok(/[?&]chrome=none\b/.test(frame.getAttribute('src')) && /group=form-controls/.test(frame.getAttribute('src')), 'the attributes are in the frame address');
        const doc = await until(() => frame.contentDocument?.querySelectorAll('#gx-view pk-page-header[level="1"]').length && frame.contentDocument, 'the gallery view');
        t.eq([...doc.querySelectorAll('#gx-view pk-page-header[level="1"]')].map(h => h.getAttribute('heading')).join(), 'Tag input', 'the filter narrows the group to one element');
        t.eq(doc.documentElement.dataset.theme, 'light');
        t.ok(!doc.querySelector('#gx-nav'), 'no chrome: no nav');
        t.eq(doc.documentElement.dataset.width, 'phone', 'phone width');
        await until(() => /^\d+px$/.test(el.style.getPropertyValue('--pk-gallery-height')), 'the reported height');
        el.setAttribute('theme', 'dark'); el.setAttribute('width', 'desktop'); el.setAttribute('filter', '');
        await until(() => frame.contentDocument?.documentElement.dataset.theme === 'dark' && frame.contentDocument.documentElement.dataset.width === 'desktop' && frame.contentDocument.querySelectorAll('#gx-view pk-page-header[level="1"]').length > 3 && frame.contentDocument, 'the reloaded, wider view');
        el.setAttribute('height', '300'); await t.settle();
        t.eq(Math.round(frame.getBoundingClientRect().height), 300, 'a fixed height wins over the content height');
    }],

    ['gallery: chrome full keeps the contents nav, cut down to the requested control', async t => {
        const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
        const el = await t.mount('<pk-gallery chrome="full" control="button" height="420"></pk-gallery>');
        el.part('frame').loading = 'eager'; // The stage sits off-screen, where a lazy frame may never be asked to load; the element keeps loading=lazy for real pages, the test forces it.
        const doc = await until(() => el.part('frame').contentDocument?.querySelector('#gx-nav pk-nav-item') && el.part('frame').contentDocument, 'the nav');
        t.eq([...doc.querySelectorAll('#gx-nav pk-nav-item[slot][href]')].map(a => a.textContent.trim()).join(), 'Button');
        t.ok(doc.querySelector('.gx-bar'), 'the toolbar is there');
        t.ok(doc.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'it opens on the control');
        t.ok(doc.querySelector('#gx-inspector-body pk-code-block'), 'the Details inspector shows the live markup of the element page');
    }],
    ['log: role=log with a name, rows from append() and rows, level words, the cap trims the oldest, it sticks to the bottom until the user scrolls up, then a 44px resume button jumps back and pk-pause is raised', async t => {
        const el = await t.mount('<pk-log label="Build output" max="50" style="--pk-log-height: 8rem">Nothing yet.</pk-log>');
        const sc = el.part('scroller'); const rowsIn = () => el.part('list').children.length; const seen = [];
        t.eq(sc.getAttribute('role'), 'log'); t.eq(sc.getAttribute('aria-label'), 'Build output'); t.eq(sc.tabIndex, 0); t.eq(sc.getAttribute('aria-live'), 'polite');
        t.ok(!el.part('empty').hidden, 'the empty text shows while there are no rows'); t.ok(el.part('resume').hidden);
        el.addEventListener('pk-pause', e => seen.push(e.detail.paused));
        el.append({ level: 'error', text: 'Build failed', time: '12:00:01' }, 'plain'); await t.settle();
        t.eq(rowsIn(), 2); t.ok(el.part('empty').hidden);
        const first = el.part('list').firstElementChild; t.eq(first.classList.contains("error"), true); t.eq(first.querySelector('.lvl').textContent, 'error'); t.eq(first.querySelector('.time').textContent, '12:00:01'); t.eq(first.querySelector('.msg').textContent, 'Build failed');
        t.ok(getComputedStyle(first).fontFamily.includes('mono'), 'monospace rows');
        for (let i = 0; i < 80; i++) el.append(`line ${i}`);
        await t.settle();
        t.eq(rowsIn(), 50, 'the cap drops the oldest rows'); t.eq(el.part('list').lastElementChild.textContent, 'line 79');
        t.ok(sc.scrollHeight > sc.clientHeight, 'the rows overflow'); t.ok(sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4, 'it sticks to the bottom');
        const kept = el.part('list').firstElementChild;
        el.append('more'); await t.settle(); t.ok(kept.isConnected === false, 'an old row went'); t.ok(sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4, 'still at the bottom');
        sc.scrollTop = 0; await until(() => el.paused, 'the log to pause');
        t.ok(el.paused && seen.join() === 'true', 'scrolling up pauses and says so once'); t.ok(!el.part('resume').hidden, 'the resume button shows');
        const top = sc.scrollTop; el.append('while paused'); await t.settle();
        t.ok(el.part('list').lastElementChild.textContent === 'while paused' && Math.abs(sc.scrollTop - top) < 2, 'new rows arrive without moving the view');
        const r = el.part('resume'); r.click(); await t.settle(); await t.settle();
        t.ok(!el.paused && !el.hasAttribute('paused') && r.hidden, 'the button resumes'); t.eq(seen.join(), 'true,false'); t.ok(sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4, 'and jumps to the newest row');
        el.paused = true; await t.settle(); t.eq(seen.length, 2, 'a host change raises nothing'); el.paused = false; await t.settle(); t.ok(sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4);
        el.rows = ['x', { text: 'y', level: 'warn' }]; await t.settle(); t.eq(rowsIn(), 2, 'rows replaces the rows'); el.live = 'off'; await t.settle(); t.eq(sc.getAttribute('aria-live'), 'off');
        el.clear(); await t.settle(); t.eq(rowsIn(), 0);
        el.paused = true; await t.settle(); const b = el.part('resume').getBoundingClientRect(); t.ok(b.height >= 44 || innerWidth > 640, 'the resume button is 44px tall on a phone'); t.ok(b.width > 0);
    }],
];
