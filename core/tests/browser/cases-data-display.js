// Browser cases for the data display and content elements. Same shape as cases.js: [name, async (t) => void].
import { mediaBelow } from '../../js/breakpoints.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
const cols = '[{"key":"sku","label":"SKU","sortable":true},{"key":"price","label":"Price","type":"number","sortable":true}]';
const rows = '[{"id":1,"sku":"B","price":"$10"},{"id":2,"sku":"A","price":"$2"},{"id":3,"sku":"C","price":"$5"}]';
const bodyIds = el => [...el.shadowRoot.querySelectorAll('tbody tr')].map(r => r.dataset.pkContext);

// A pk-data-table draws pk-table, pk-pagination and pk-table-filters, which it loads on demand: wait for them, so a case also passes on its own (--filter / --elements), not only after earlier cases loaded them.
const mountDataTable = async (t, html) => { const el = await t.mount(html); await Promise.all(['pk-table', 'pk-pagination', 'pk-table-filters'].map(n => customElements.whenDefined(n))); await t.settle(); return el; };
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await wait(50); } throw new Error(`timed out waiting for ${what}`); };
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

// The gallery, drawn without chrome (so a pattern shows inline, not as a full page), in a frame of the given width. sample(n) is the n-th sample
// frame of the view (0 = desktop, 1 = phone); go(id) opens another pattern; logged(sample) is the warnings and errors the SDK logger holds
// inside that sample frame, as text (empty when the log is clean).
async function inlineGallery(t, id, width) {
    const embed = new URL('../../site/gallery/embed.html', import.meta.url).href;
    const host = t.stage(''), f = document.createElement('iframe');
    f.title = 'gallery'; f.style.width = `${width}px`; f.style.height = '900px'; f.style.border = '0';
    const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
    // The gallery draws a sample frame only when its slot is on screen, and the stage sits off-screen: pin this frame into the window (the next stage() removes it).
    f.style.position = 'fixed'; f.style.left = '0'; f.style.top = '0'; f.style.zIndex = '10';
    host.append(f);
    f.src = `${embed}?chrome=none#/samples/patterns/${id}`; await loaded;
    const win = f.contentWindow;
    const sample = n => { const fr = win.document.querySelectorAll('iframe.gx-frame')[n]; return fr && { frame: fr, win: fr.contentWindow, doc: fr.contentDocument }; };
    const ready = name => until(() => { const s = sample(0); return s?.doc?.body?.firstElementChild && s.doc.documentElement.dataset.pattern === `${name}/${name}.js` && [...s.doc.querySelectorAll('*')].every(e => !e.localName.startsWith('pk-') || s.win.customElements.get(e.localName)) && s; }, `the ${name} sample frame`);
    await ready(id);
    await wait(400); // the script mounts right after the frame boots: let its module load and the behaviours settle
    return {
        win, sample,
        async go(next) { win.location.hash = `#/samples/patterns/${next}`; await wait(200); await ready(next); await wait(400); },
        async logged(s) {
            const log = await s.win.eval(`import(${JSON.stringify(new URL('../../js/log.js', import.meta.url).href)})`);
            return log.getLogBuffer().filter(e => e.level === 'error' || e.level === 'warn').map(e => `${e.level} ${e.scope}: ${e.message}`).join('; ');
        },
    };
}

export const dataDisplayCases = [
    // ---- the gallery's inline pattern views run the pattern's script inside the sample frame -------------------------------------------------
    ['gallery inline patterns: notifications, unsaved settings and onboarding respond to clicks and edits in the sample frame, at desktop and phone width, with nothing in the log', async t => {
        for (const width of [1200, 375]) {
            const g = await inlineGallery(t, 'notifications', width);
            const view = g.sample(0);
            const doc = view.doc;
            t.eq(doc.documentElement.getAttribute('data-pattern'), 'notifications/notifications.js', 'the frame names the script');
            const badge = doc.querySelector('[data-unread]');
            t.eq(badge.getAttribute('count'), '3');
            doc.querySelector('[data-toast="saved"]').click();
            await until(() => doc.querySelector('pk-toast'), 'a toast');
            t.eq(badge.getAttribute('count'), '4', `${width}px: the bell counts the toast`);
            doc.querySelector('[data-bell]').click(); await t.settle();
            t.ok(badge.hidden, 'the bell clears the count');
            t.eq(await g.logged(view), '', `${width}px notifications: nothing in the log`);

            await g.go('unsaved-settings');
            const u = g.sample(0).doc;
            const bar = u.querySelector('[data-bar]');
            t.ok(bar.hidden, 'the bar starts hidden');
            const name = u.querySelector('pk-input'); name.value = 'A new name'; name.dispatchEvent(new u.defaultView.Event('input', { bubbles: true, composed: true }));
            await until(() => !bar.hidden, 'the unsaved bar');
            u.querySelector('[data-discard]').click(); await until(() => bar.hidden, 'the bar to hide after Discard');
            t.eq(await g.logged(g.sample(0)), '', `${width}px unsaved-settings: nothing in the log`);

            await g.go('onboarding');
            const o = g.sample(0).doc;
            const done = o.querySelector('[data-done]'); const before = done.textContent;
            o.querySelector('[data-start]').click(); await until(() => done.textContent !== before, 'the step to advance');
            t.ok(/^\d+ of \d+ done$/.test(done.textContent), done.textContent);
            t.eq(await g.logged(g.sample(0)), '', `${width}px onboarding: nothing in the log`);
        }
    }],

    ['gallery inline patterns: live search and the data-table filter pattern respond to typing and clicks in the sample frame, with nothing in the log', async t => {
        const type = (win, el, text) => { el.value = text; el.dispatchEvent(new win.Event('input', { bubbles: true, composed: true })); };
        const g = await inlineGallery(t, 'search-results', 1200);
        let s = g.sample(0); const shown = () => [...s.doc.querySelectorAll('pk-list-group > button')].filter(b => !b.hidden).length;
        const all = shown(); t.ok(all > 1, 'the results start listed');
        const q = s.doc.querySelector('[data-query]'); const empty = s.doc.querySelector('[data-empty]');
        type(s.win, q, 'zzqq'); await until(() => shown() === 0 && !empty.hidden, 'the empty state');
        type(s.win, q, ''); await until(() => shown() >= all && empty.hidden, 'the full list again'); // the sample opens with the query "item", so clearing shows at least as many rows
        t.eq(await g.logged(s), '', 'search-results: nothing in the log');

        await g.go('filter-table');
        s = g.sample(0);
        const dt = s.doc.querySelector('[data-table]'); const rowsIn = () => dt.part('table')?.shadowRoot?.querySelectorAll('tbody tr[data-pk-context]').length ?? 0;
        await until(() => rowsIn() === 5, 'the first page of five rows');
        const box = dt.part('filters').shadowRoot.querySelector('[part="search"]'); type(s.win, box, 'Item 7'); await until(() => rowsIn() === 1, 'the search to narrow the rows');
        type(s.win, box, ''); await until(() => rowsIn() === 5, 'clearing the search to bring the page back');
        t.eq(await g.logged(s), '', 'filter-table: nothing in the log');
    }],

    ['gallery inline patterns: drawing another view ends the old frame\'s script and starts the new one, a theme change keeps the state, and views do not pile up', async t => {
        const g = await inlineGallery(t, 'notifications', 1200);
        const old = g.sample(0); let destroyed = 0;
        old.win.addEventListener('pk-sample-destroy', () => { destroyed += 1; });
        old.doc.querySelector('[data-toast="saved"]').click(); await until(() => old.doc.querySelector('pk-toast'), 'a toast');
        g.win.document.documentElement.setAttribute('data-theme', 'light'); await t.settle(); // the host page's theme changes: the frames follow
        t.eq(old.doc.documentElement.dataset.theme, 'light', 'the theme follows');
        t.eq(old.doc.querySelector('[data-unread]').getAttribute('count'), '4', 'the frame was not redrawn: the script keeps its state');
        await g.go('onboarding');
        t.eq(destroyed, 1, 'the old frame was told to end its script, once');
        t.ok(!old.frame.isConnected, 'and the frame is gone');
        for (const id of ['search-results', 'notifications', 'search-results']) await g.go(id);
        t.eq(g.win.document.querySelectorAll('iframe.gx-frame').length, 2, 'the desktop and the phone frame, no leftovers');
    }],

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

    ['table: each data-driven row carries data-pk-context, so one wrapping pk-context-menu can name which row was right-clicked', async t => {
        const el = await t.mount(`<pk-context-menu><pk-table label="P" columns='${cols}' rows='${rows}'></pk-table><pk-menu-item slot="menu">Row menu</pk-menu-item></pk-context-menu>`);
        const table = el.querySelector('pk-table'); await t.settle();
        const row2 = table.shadowRoot.querySelector('tbody tr[data-pk-context="2"]');
        let opened; el.addEventListener('pk-open', e => { opened = e.detail; });
        row2.querySelector('td').dispatchEvent(new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        t.ok(el.open); t.eq(opened.context, '2', 'the context field names the row id from data-pk-context, not internal cell markup');
    }],

    ['table: wireContextMenu (js/context-actions.js, issue #586) paints Select/Deselect per row from its own selection state, and dispatches through the same run(action) a toolbar uses', async t => {
        const { wireContextMenu } = await import('../../js/context-actions.js');
        const el = await t.mount(`<pk-context-menu><pk-table label="P" selectable columns='${cols}' rows='${rows}'></pk-table></pk-context-menu>`);
        const table = el.querySelector('pk-table'); await t.settle();
        const calls = [];
        const select = id => { table.selected = table.selected.includes(id) ? table.selected.filter(x => x !== id) : [...table.selected, id]; };
        const run = (action, id) => { calls.push([action, id]); if (action === 'select' || action === 'deselect') select(id); };
        wireContextMenu(el, { items: id => id ? [{ action: 'select', label: 'Select row', disabled: table.selected.includes(id) }, { action: 'deselect', label: 'Deselect row', disabled: !table.selected.includes(id) }] : [], run });

        const rowAt = id => table.shadowRoot.querySelector(`tbody tr[data-pk-context="${id}"]`);
        rowAt('2').querySelector('td').dispatchEvent(new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        const items = [...el.querySelectorAll('pk-menu-item[slot="menu"]')];
        t.eq(items.length, 2); t.ok(!items[0].disabled, 'row 2 is not selected: Select is enabled'); t.ok(items[1].disabled, 'Deselect is disabled while unselected');
        items[0].dispatchEvent(new CustomEvent('pk-select', { bubbles: true, composed: true }));
        await t.settle();
        t.eq(calls.length, 1); t.eq(calls[0][0], 'select'); t.eq(calls[0][1], '2');
        t.ok(table.selected.includes('2'), 'run() drove the same selection the row checkbox would');

        // A disabled row never dispatches: opening again after selecting flips which item is disabled, and clicking the now-disabled Select does nothing.
        rowAt('2').querySelector('td').dispatchEvent(new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, composed: true, cancelable: true }));
        await t.settle();
        const items2 = [...el.querySelectorAll('pk-menu-item[slot="menu"]')];
        t.ok(items2[0].disabled, 'Select is now disabled (row 2 is selected)'); t.ok(!items2[1].disabled);
        items2[0].dispatchEvent(new CustomEvent('pk-select', { bubbles: true, composed: true }));
        await t.settle();
        t.eq(calls.length, 1, 'a disabled item never runs an action');
    }],

    ['table: current-row marks the open record with aria-current and a tint, follows the host, and the element never changes it', async t => {
        const el = await t.mount(`<pk-table label="P" clickable current-row="2" columns='${cols}' rows='${rows}'></pk-table>`);
        const row = id => el.shadowRoot.querySelector(`tbody tr[data-pk-context="${id}"]`);
        t.eq(row('2').getAttribute('aria-current'), 'true'); t.ok(!row('1').hasAttribute('aria-current'), 'only the current row is marked');
        t.ok(getComputedStyle(row('2')).backgroundColor !== getComputedStyle(row('1')).backgroundColor, 'and tinted');
        row('3').querySelector('td').click(); await t.settle(); t.eq(el.currentRow, '2', 'a click reports pk-row-click; the host decides what is current');
        el.currentRow = '3'; await t.settle(); t.eq(row('3').getAttribute('aria-current'), 'true'); t.ok(!row('2').hasAttribute('aria-current'));
        el.currentRow = ''; await t.settle(); t.eq(el.shadowRoot.querySelectorAll('tr[aria-current]').length, 0, 'empty marks no row');
    }],

    ['table: with a total, selecting the loaded rows offers a named "Select all N rows" button in the bulk status; it widens the scope (pk-select-all, no ids), survives a page change, and clearing resets it (#801)', async t => {
        const el = await t.mount(`<pk-table label="P" manual selectable total="112" columns='${cols}' rows='${rows}'></pk-table>`);
        const r = el.shadowRoot, btn = () => r.querySelector('[part="bulk-all"]'), events = [];
        el.addEventListener('pk-select-all', e => events.push(e.detail));
        await until(() => el.$s, 'the scope module (it loads on demand, once total is set)');
        t.ok(btn().hidden, 'no button while the page is not selected');
        r.querySelector('[data-select-all]').click(); await t.settle(); await until(() => !btn().hidden, 'the select-all button (its module loads on demand)');
        t.ok(!btn().hidden, 'the whole page is selected and the query has more rows: the button shows');
        t.eq(btn().textContent, 'Select all 112 rows', 'its name includes the count');
        t.ok(btn().closest('[role="status"]') === r.querySelector('[part="bulk"]'), 'it sits inside the polite status region');
        t.eq(JSON.stringify(events), JSON.stringify([{ scope: 'page', count: 3 }]));
        btn().focus(); t.ok(r.activeElement === btn(), 'a real button: it takes focus');
        btn().click(); await t.settle();
        t.eq(el.selectScope, 'all'); t.eq(r.querySelector('[part="bulk-count"]').textContent, 'All 112 selected');
        t.eq(JSON.stringify(events[1]), JSON.stringify({ scope: 'all', count: 112 })); t.eq(el.selected.length, 3, 'only the loaded ids travel');
        el.rows = [{ id: 4, sku: 'D', price: '$1' }, { id: 5, sku: 'E', price: '$1' }]; await t.settle();
        t.ok([...r.querySelectorAll('[data-select]')].every(b => b.checked), 'the next page reads as selected too');
        t.eq(el.selected.join(), '1,2,3', 'the ids are kept, not matched against the new rows');
        btn().click(); await t.settle();
        t.eq(el.selectScope, 'page'); t.eq(el.selected.length, 0); t.ok(r.querySelector('[part="bulk"]').hidden && btn().hidden, 'cleared: scope reset, bar hidden');
    }],

    ['data-table: pages and searches through load(query), keeps the selection across pages, offers Select all N rows, and a new search narrows scope all back to page (#801)', async t => {
        const el = await mountDataTable(t, `<pk-data-table selectable columns='[{"key":"sku","label":"SKU"}]' page-size="5"></pk-data-table>`);
        const all = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), queries = [], events = [];
        el.load = async q => { queries.push(q); const rs = all.filter(r => r.sku.includes(q.search)); return { rows: rs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rs.length }; };
        el.addEventListener('pk-select', e => events.push(e.detail));
        el.refresh();
        const table = el.part('table'), tr = () => table.shadowRoot.querySelectorAll('tbody tr').length, btn = () => table.shadowRoot.querySelector('[part="bulk-all"]');
        await until(() => tr() === 5, 'the first page of five rows');
        t.ok(!table.hidden && el.part('state').children.length === 0, 'the table shows, no state');
        table.shadowRoot.querySelector('[data-select="2"]').click(); await t.settle();
        t.eq(events.length, 1, 'one pk-select reaches the host (the inner event stops inside)'); t.eq(events[0].selected.join(), '2'); t.eq(events[0].scope, 'page');
        el.part('pagination').shadowRoot.querySelector('[part~="next"]').click();
        await until(() => queries.at(-1).page === 2 && table.shadowRoot.querySelector('[data-select="7"]'), 'page two');
        t.eq(el.selected.join(), '2', 'the selection survives paging'); t.eq(table.selected.join(), '2');
        table.shadowRoot.querySelector('[data-select-all]').click(); await t.settle();
        await until(() => btn() && !btn().hidden, 'the select-all button'); t.eq(btn().textContent, 'Select all 40 rows');
        btn().click(); await t.settle();
        const last = events.at(-1); t.eq(last.scope, 'all'); t.eq(el.selectScope, 'all'); t.eq(last.query.search, ''); t.eq(last.query.page, 2, 'the host gets the query to run its bulk action on');
        const box = el.part('filters').shadowRoot.querySelector('[part="search"]'); box.value = 'SKU-1'; box.dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => queries.at(-1).search === 'SKU-1', 'the search to reach load');
        t.eq(queries.at(-1).page, 1, 'a search goes back to page 1'); t.eq(el.selectScope, 'page', 'the scope narrowed'); t.eq(events.at(-1).scope, 'page');
        await until(() => tr() === 5, 'the searched rows'); t.ok(el.selected.length > 1, 'the ids stay selected');
    }],

    ['data-table: a multiselect filter is a checklist whose chosen values reach load(query).filters as an array, count once, and Clear filters unticks them (#1025)', async t => {
        const el = await mountDataTable(t, `<pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5" filters='[{"key":"status","type":"multiselect","label":"Status","options":["Open","Paid",{"value":"void","label":"Void"}]}]'></pk-data-table>`);
        const queries = [];
        el.load = async q => { queries.push(q); return { rows: [{ id: 1, sku: 'A' }], total: 1 }; };
        el.refresh();
        const filters = el.part('filters'), boxes = () => [...filters.querySelectorAll('[data-key="status"] pk-checkbox')];
        await until(() => boxes().length === 3 && boxes().every(b => typeof b.toggle === 'function'), 'the three checkboxes');
        t.eq(boxes().map(b => b.label).join(), 'Open,Paid,Void');
        boxes()[0].toggle(); await t.settle(); boxes()[2].toggle(); await t.settle();
        await until(() => queries.at(-1).filters.status?.join() === 'Open,void', 'both values in one array');
        t.eq(filters.filterCount, 1, 'one filter, however many values');
        filters.shadowRoot.querySelector('[part="clear"]').click(); await t.settle();
        await until(() => Object.keys(queries.at(-1).filters).length === 0, 'cleared');
        t.ok(boxes().every(b => !b.checked), 'every box unticked'); t.eq(filters.filterCount, 0);
    }],

    ['data-table: search presets the search box and the first load; typing replaces it; the host changing it later loads page 1 with the new term (#865)', async t => {
        const el = await mountDataTable(t, `<pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5" search-debounce="20" search="SKU-3"></pk-data-table>`);
        const all = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), queries = [];
        el.load = async q => { queries.push(q); const rs = all.filter(r => r.sku.includes(q.search)); return { rows: rs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rs.length }; };
        el.refresh();
        const box = () => el.part('filters').shadowRoot.querySelector('[part="search"]'), rowsShown = () => el.part('table').shadowRoot.querySelectorAll('tbody tr').length;
        await until(() => rowsShown() === 5, 'the searched first page');
        t.eq(queries[0].search, 'SKU-3', 'the first load already carries the term'); t.eq(box().value, 'SKU-3', 'the visible input shows it');
        el.part('pagination').shadowRoot.querySelector('[part~="next"]').click();
        await until(() => queries.at(-1).page === 2, 'page two of the preset search'); t.eq(queries.at(-1).search, 'SKU-3', 'paging keeps the term');
        box().value = 'SKU-1'; box().dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => queries.at(-1).search === 'SKU-1', 'typing replaces the preset'); t.eq(queries.at(-1).page, 1);
        el.search = 'SKU-2';
        await until(() => queries.at(-1).search === 'SKU-2' && box().value === 'SKU-2', 'the host changed the term: the query and the box follow'); t.eq(queries.at(-1).page, 1);
    }],

    ['data-table: add-label draws a primary button after the search box and the actions slot, and pressing it raises pk-add (#805)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]'><button slot="actions" id="own">Export</button></pk-data-table>`);
        const add = el.part('add'); let added = 0; el.addEventListener('pk-add', () => added++);
        t.ok(add.hidden, 'no add-label, no button');
        el.addLabel = '+ Add SKU'; await t.settle();
        t.ok(!add.hidden && add.textContent === '+ Add SKU', 'the label shows the button');
        const own = el.querySelector('#own').getBoundingClientRect(), b = add.getBoundingClientRect();
        t.ok(b.left >= own.right - 1, `after the actions slot (add ${Math.round(b.left)}, own ${Math.round(own.right)})`); t.ok(Math.abs((b.top + b.height / 2) - (own.top + own.height / 2)) < b.height, 'on the same row');
        t.eq(add.getAttribute('collapse'), 'phone', 'the add button folds to its icon on a phone (#993)'); t.ok(add.iconName === 'plus' || add.getAttribute('icon-name') === 'plus', 'the add button has a plus icon (#993)');
        t.ok(b.width > 60, `icon and text at desktop width (${Math.round(b.width)}px, window ${innerWidth})`);
        add.click(); await t.settle(); t.eq(added, 1, 'one pk-add per press');
    }],

    ['data-table: focus() puts focus in the search box (the first row when the search is hidden), and focus(\'next\' | \'previous\' | \'first\' | \'last\') walks the rows from the host (#885)', async t => {
        const el = await mountDataTable(t, `<pk-data-table clickable columns='[{"key":"sku","label":"SKU"}]' page-size="5"></pk-data-table>`);
        const all = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` }));
        el.load = async q => ({ rows: all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: all.length });
        el.refresh();
        const rows = () => [...el.part('table').shadowRoot.querySelectorAll('tbody tr[data-pk-context]')];
        const deep = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
        await until(() => rows().length === 5 && rows().every(r => r.hasAttribute('tabindex')) && el.part('filters').shadowRoot?.querySelector('[part="search"]')?.getBoundingClientRect().width > 0, 'five focusable rows and the search box');
        t.ok(el.focus() === true, 'focus() says it moved focus'); t.eq(deep(), el.part('filters').shadowRoot.querySelector('[part="search"]'), 'the search box has focus');
        t.ok(el.focus('previous') === false && el.focus('first') === false && el.focus('last') === false, 'previous, first and last leave the search box alone (Home and the arrows are the caret\'s there)');
        t.eq(deep(), el.part('filters').shadowRoot.querySelector('[part="search"]'), 'and focus stayed');
        t.ok(el.focus('next'), 'next enters the rows'); t.eq(deep(), rows()[0], 'the first row has focus');
        el.focus('next'); t.eq(deep(), rows()[1], 'next again: the second');
        el.focus('previous'); t.eq(deep(), rows()[0], 'previous: back to the first'); el.focus('previous'); t.eq(deep(), rows()[0], 'and it stops at the first');
        el.focus('last'); t.eq(deep(), rows()[4], 'last'); el.focus('next'); t.eq(deep(), rows()[4], 'and next stops at the last');
        el.focus('first'); t.eq(deep(), rows()[0], 'first');
        t.ok(el.focus('search') === true, "'search' is the search box");
        el.hideSearch = true; await t.settle(); await wait(100);
        t.ok(el.focus('search') === false, "'search' does nothing while the search is hidden");
        el.focus('next'); el.focus('next'); t.ok(el.focus(), 'with the search hidden focus() lands on the first row'); t.eq(deep(), rows()[0]);
        t.ok(el.focus({ preventScroll: true }) === true, 'the standard options argument still means focus()');
    }],

    ['data-table: plain props set the columns, page size, labels, search term and empty states (#805)', async t => {
        const el = await mountDataTable(t, `<pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5" page-size-options="[5,10]" search="SKU-3" search-label="Find SKU" search-debounce="20" pager-label="SKU pages" label="SKUs" caption="All SKUs" no-results='{"heading":"No SKU matches"}' empty='{"heading":"No SKUs yet"}'></pk-data-table>`);
        const all = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), queries = [];
        el.load = async q => { queries.push(q); const rs = all.filter(r => r.sku.includes(q.search)); return { rows: rs.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: rs.length }; };
        el.refresh();
        const box = () => el.part('filters').shadowRoot.querySelector('[part="search"]'), rowsShown = () => el.part('table').shadowRoot.querySelectorAll('tbody tr').length;
        await until(() => rowsShown() === 5, 'the first page of five');
        t.eq(queries[0].pageSize, 5, 'page-size sets the first page size'); t.eq(queries[0].search, 'SKU-3', 'the first load carries the term');
        t.eq(box().value, 'SKU-3'); t.eq(box().getAttribute('aria-label'), 'Find SKU', 'search-label names the box');
        t.eq(el.part('table').label, 'SKUs', 'label names the table'); t.eq(el.part('table').caption, 'All SKUs');
        t.eq(el.part('pagination').label, 'SKU pages'); t.eq(el.part('pagination').sizes.join(), '5,10');
        box().value = 'nothing-like-this'; box().dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => queries.at(-1).search === 'nothing-like-this', 'a search that matches nothing');
        await until(() => el.part('state').querySelector('pk-empty-state')?.getAttribute('heading') === 'No SKU matches', 'the no-results heading from the plain prop');
        el.hideSearch = true; await t.settle(); t.ok(el.part('filters').hasAttribute('data-nosearch'), 'hide-search hides the box');
    }],

    ['table and data-table: selectPageOnly keeps the header checkbox on the page and never offers "Select all N rows" (#865)', async t => {
        const el = await t.mount(`<pk-table label="P" manual selectable select-page-only total="112" columns='${cols}' rows='${rows}'></pk-table>`);
        const r = el.shadowRoot, btn = () => r.querySelector('[part="bulk-all"]'), events = [];
        el.addEventListener('pk-select-all', e => events.push(e.detail));
        await until(() => el.$s, 'the scope module');
        r.querySelector('[data-select-all]').click(); await t.settle();
        t.eq(el.selected.length, 3, 'the page is selected'); t.ok(btn().hidden, 'no Select all offer although the query has more rows'); t.eq(el.selectScope, 'page');
        el.selectPageOnly = false; await t.settle(); t.ok(!btn().hidden, 'without it the offer shows (the default is unchanged)');
        const dt = await t.mount(`<pk-data-table selectable select-page-only columns='[{"key":"sku","label":"SKU"}]' page-size="5"></pk-data-table>`);
        dt.load = async q => ({ rows: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), total: 40 });
        dt.refresh();
        const table = dt.part('table');
        await until(() => table.shadowRoot.querySelector('[data-select-all]'), 'the rows');
        table.shadowRoot.querySelector('[data-select-all]').click(); await t.settle();
        await until(() => table.$s, 'the scope module'); await t.settle();
        t.eq(dt.selected.length, 5); t.eq(dt.selectScope, 'page'); t.ok(table.shadowRoot.querySelector('[part="bulk-all"]').hidden, 'data-table passes it on');
    }],

    ['data-table: the search box keeps focus and its text across the debounce and the load, and a search with no results keeps the toolbar with a clearable search (#836)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]' search-debounce="20" no-results='{"heading":"Nothing matches"}'><pk-button slot="actions" id="add">Add</pk-button></pk-data-table>`);
        const all = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), queries = [];
        el.load = async q => { queries.push(q.search); await wait(120); const rows = all.filter(r => r.sku.includes(q.search)); return { rows, total: rows.length }; };
        el.refresh();
        const root = el.part('table').shadowRoot, filters = el.part('filters'), box = () => filters.shadowRoot.querySelector('[part="search"]');
        const focused = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
        const type = ch => { box().value += ch; box().dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: ch })); };
        await until(() => root.querySelector('tbody tr'), 'the rows');
        box().focus(); t.ok(focused() === box(), 'the search box takes focus');
        type('S'); await until(() => queries.at(-1) === 'S', 'the first search to load');
        t.ok(box().getBoundingClientRect().width > 0 && focused() === box(), 'a load in flight keeps the search box shown and focused');
        type('K'); await until(() => queries.at(-1) === 'SK' && root.querySelector('tbody tr'), 'the second search');
        t.ok(focused() === box(), 'focus is still on the search box after the load'); t.eq(box().value, 'SK', 'no keystroke is lost');
        for (const ch of 'U-9') type(ch);
        await until(() => queries.at(-1) === 'SKU-9' && el.part('state').children.length, 'no results');
        const shown = e => e.getBoundingClientRect().width > 0;
        t.ok(shown(box()) && shown(el.part('actions')) && shown(el.querySelector('#add')), 'the search box and the actions stay shown when nothing matches');
        t.ok(focused() === box() && box().value === 'SKU-9', 'the search keeps its focus and text');
        box().value = ''; box().dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        await until(() => queries.at(-1) === '' && root.querySelector('tbody tr'), 'the cleared search to bring the rows back');
        t.ok(focused() === box(), 'still focused after clearing');
    }],

    ['data-table: in a container of fixed height it fills it, the header row stays pinned and the footer (pager) stays in view while only the rows scroll (#1006)', async t => {
        const box = await t.mount(`<div style="display:flex;flex-direction:column;block-size:400px;inline-size:100%"><pk-data-table sticky-header selectable columns='[{"key":"sku","label":"SKU"}]' page-size="100" page-size-options="[25,100]"></pk-data-table></div>`);
        const el = box.firstElementChild;
        await Promise.all(['pk-table', 'pk-pagination', 'pk-table-filters'].map(n => customElements.whenDefined(n)));
        el.load = async () => ({ rows: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })), total: 100 });
        el.refresh();
        const table = el.part('table'), sr = table.shadowRoot;
        await until(() => sr.querySelectorAll('tbody tr').length > 5, 'the rows');
        await t.settle();
        const scroll = sr.querySelector('[part="scroll"]'), pager = el.part('pagination'), head = () => sr.querySelector('thead th').getBoundingClientRect();
        const within = () => { const b = box.getBoundingClientRect(), p = pager.getBoundingClientRect(); return p.bottom <= b.bottom + 1 && p.top >= b.top; };
        t.ok(el.getBoundingClientRect().height <= 401, 'the data table fits its container instead of growing with 100 rows');
        t.ok(scroll.scrollHeight > scroll.clientHeight + 100, 'the rows overflow the scroll region');
        t.ok(within(), 'the pager is inside the container before scrolling');
        const h0 = head().top, p0 = pager.getBoundingClientRect().top;
        scroll.scrollTop = 600; await wait(50);
        t.ok(scroll.scrollTop > 0, 'the rows scrolled');
        t.ok(Math.abs(head().top - h0) <= 1, 'the header row stays where it was');
        t.ok(Math.abs(pager.getBoundingClientRect().top - p0) <= 1 && within(), 'the pager stays where it was, in view');
        t.ok(pager.getBoundingClientRect().top >= scroll.getBoundingClientRect().bottom - 1, 'the pager sits below the scrolling rows, not over them');
    }],
    ['data-table: a page past the last one (rows deleted) settles on the last page with one more load, and total 0 still shows the empty state (#829)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]' page-size="5"></pk-data-table>`);
        let n = 12; const pages = [];
        el.load = async q => { pages.push(q.page); const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, sku: `SKU-${i + 1}` })).slice((q.page - 1) * q.pageSize, q.page * q.pageSize); return { rows, total: n }; };
        el.refresh();
        const table = el.part('table'), tr = () => table.shadowRoot.querySelectorAll('tbody tr').length;
        await until(() => tr() === 5, 'the first page');
        el.part('pagination').shadowRoot.querySelector('[part~="next"]').click();
        await until(() => pages.at(-1) === 2 && tr() === 5, 'page two');
        el.part('pagination').shadowRoot.querySelector('[part~="next"]').click();
        await until(() => pages.at(-1) === 3 && tr() === 2, 'page three');
        n = 10; el.refresh();
        await until(() => pages.slice(-2).join() === '3,2' && tr() === 5, 'one more load lands on page two');
        t.ok(!table.hidden && el.part('state').children.length === 0, 'rows show, not the empty state');
        n = 0; el.refresh();
        await until(() => table.hidden && el.part('state').children.length > 0, 'total 0 shows the empty state'); t.eq(pages.at(-1), 2, 'no further correction');
    }],
    ['data-table: cell-<id>-<key> slots reach the inner table cell (also one added later), and column align and hidePhone pass through (#817)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty","type":"number"},{"key":"note","label":"Note","hidePhone":true}]'><b slot="cell-1-sku">Custom one</b></pk-data-table>`);
        el.load = async () => ({ rows: [{ id: 1, sku: 'A', qty: 3, note: 'n' }, { id: 2, sku: 'B', qty: 4, note: 'm' }], total: 2 });
        el.refresh();
        const root = el.part('table').shadowRoot, td = (id, key) => root.querySelector(`tbody tr[data-pk-context="${id}"] td[data-key="${key}"]`);
        await until(() => td(2, 'sku'), 'the rows');
        const inside = (cell, node) => { const a = node.getBoundingClientRect(), b = cell.getBoundingClientRect(); return a.width > 0 && a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
        t.ok(inside(td(1, 'sku'), el.querySelector('b')), 'the slotted node renders inside its cell');
        t.eq(td(2, 'sku').textContent, 'B', 'a row with no slot keeps the plain text');
        const late = document.createElement('i'); late.slot = 'cell-2-sku'; late.textContent = 'Late'; el.append(late);
        await until(() => inside(td(2, 'sku'), late), 'the later slot to render in its cell');
        t.eq(td(1, 'qty').dataset.align, 'end', 'a number column aligns to the end'); t.ok(td(1, 'note').hasAttribute('data-hide-phone'), 'hidePhone reaches the cell');
    }],

    ['data-table: a cell slot added while the inner pk-table is not upgraded yet raises no error and shows once it is (#1187)', async t => {
        const el = await mountDataTable(t, `<pk-data-table columns='[{"key":"sku","label":"SKU"}]'></pk-data-table>`);
        const table = el.part('table'), errors = [], onError = e => { errors.push(e.message); e.preventDefault(); };
        window.addEventListener('error', onError);
        Object.defineProperty(table, 'requestUpdate', { value: undefined, configurable: true }); // what an element that is not defined yet looks like
        try {
            const late = document.createElement('i'); late.slot = 'cell-1-sku'; el.append(late);
            await wait(50);
        } finally { window.removeEventListener('error', onError); delete table.requestUpdate; }
        t.eq(errors.join(), '', 'no uncaught error from the observer');
        t.ok(table.querySelector('slot[name="cell-1-sku"]'), 'the slot is forwarded all the same');
    }],
    ['data-table: clickable rows are tab stops, Enter or a click raises pk-row-click on the host with the row id, and currentRow marks the open row (#817)', async t => {
        const el = await t.mount(`<pk-data-table clickable current-row="2" columns='[{"key":"sku","label":"SKU"}]'></pk-data-table>`);
        el.load = async () => ({ rows: [{ id: 1, sku: 'A' }, { id: 2, sku: 'B' }], total: 2 });
        el.refresh();
        const root = el.part('table').shadowRoot, rows = () => [...root.querySelectorAll('tbody tr')];
        await until(() => rows().length === 2 && rows().every(r => r.tabIndex === 0), 'focusable rows');
        t.ok(!rows()[0].hasAttribute('aria-current') && rows()[1].getAttribute('aria-current') === 'true', 'only the current row is marked');
        const got = []; el.addEventListener('pk-row-click', e => got.push([e.detail.id, e.detail.row.sku]));
        rows()[0].focus(); t.eq(root.activeElement, rows()[0], 'a row can take focus');
        key(rows()[0], 'Enter'); rows()[1].click(); await t.settle();
        t.eq(JSON.stringify(got), '[["1","A"],["2","B"]]', 'the host hears the id and the row');
        el.currentRow = '1'; await until(() => rows()[0].hasAttribute('aria-current') && !rows()[1].hasAttribute('aria-current'), 'the mark to follow currentRow');
    }],

    ['data-table: plain props set the initial sort, page size options, pager/search/table labels and the caption, and hide-search hides the search box (#817)', async t => {
        const cfg = { columns: [{ key: 'sku', label: 'SKU', sortable: true }], sort: 'sku', sortDir: 'descending', pageSizeOptions: [5, 10], pagerLabel: 'Order pages', searchLabel: 'Find orders', searchDebounce: 20, label: 'Orders', caption: 'All orders' };
        const el = await t.mount(`<pk-data-table></pk-data-table>`), queries = [];
        Object.assign(el, cfg);
        el.load = async q => { queries.push(q); return { rows: [{ id: 1, sku: 'A' }], total: 30 }; };
        el.refresh();
        const root = el.part('table').shadowRoot, pager = el.part('pagination').shadowRoot, search = () => el.part('filters').shadowRoot.querySelector('[part="search"]');
        await until(() => root.querySelector('tbody tr'), 'the row');
        t.eq(queries[0].sort, 'sku'); t.eq(queries[0].sortDir, 'descending', 'load gets the initial sort');
        t.eq(root.querySelector('th[data-key="sku"]').getAttribute('aria-sort'), 'descending', 'the header shows it');
        t.eq(root.querySelector('caption').textContent.trim(), 'All orders'); t.eq(root.querySelector('[part="scroll"]').getAttribute('aria-label'), 'Orders');
        t.eq(pager.querySelector('nav').getAttribute('aria-label'), 'Order pages');
        const sel = pager.querySelector('[part="size-select"]'); t.eq([...sel.options].map(o => o.value).join(), '5,10', 'the page size options');
        t.eq(search().getAttribute('aria-label'), 'Find orders'); t.eq(search().placeholder, 'Find orders');
        t.ok(search().getBoundingClientRect().width > 0, 'the search box shows');
        el.hideSearch = true; await until(() => search().getBoundingClientRect().width === 0, 'the search box to hide');
    }],

    ['data-table: the empty slot replaces the built-in empty state (not while searching), loadError words the error and pk-load-error reaches the host (#817)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]' no-results='{"heading":"Nothing matches"}' load-error="Orders failed"><p slot="empty" id="mine">Add your first order</p></pk-data-table>`);
        let mode = 'none'; const errs = [];
        el.load = async () => { if (mode === 'fail') throw new Error('Server said no'); return { rows: [], total: 0 }; };
        el.addEventListener('pk-load-error', e => errs.push(e.detail.error.message));
        el.refresh();
        const mine = el.querySelector('#mine'), box = el.part('empty');
        await until(() => !box.hidden && mine.getBoundingClientRect().height > 0, 'the empty slot to show');
        t.ok(!el.part('state').querySelector('pk-empty-state'), 'no built-in empty state beside it');
        el.$query = { ...el.query, search: 'zz' }; el.refresh();
        await until(() => el.part('state').querySelector('pk-empty-state'), 'the no-results state');
        t.eq(el.part('state').querySelector('pk-empty-state').getAttribute('heading'), 'Nothing matches'); t.ok(box.hidden, 'the slot is hidden while searching');
        mode = 'fail'; el.refresh();
        const alert = await until(() => el.part('state').querySelector('pk-alert'), 'the error');
        t.eq(alert.getAttribute('heading'), 'Orders failed'); t.ok(alert.textContent.includes('Server said no')); t.eq(errs.join(), 'Server said no');
    }],

    ['data-table: bulk slot content shows in the selection bar beside the count, only while rows are selected (#817)', async t => {
        const el = await t.mount(`<pk-data-table selectable columns='[{"key":"sku","label":"SKU"}]'><button slot="bulk" id="del">Delete</button></pk-data-table>`);
        el.load = async () => ({ rows: [{ id: 1, sku: 'A' }, { id: 2, sku: 'B' }], total: 2 });
        el.refresh();
        const root = el.part('table').shadowRoot, bar = () => root.querySelector('[part="bulk"]'), btn = el.querySelector('#del');
        await until(() => root.querySelectorAll('tbody tr').length === 2, 'the rows');
        t.ok(bar().hidden && btn.getBoundingClientRect().width === 0, 'hidden with nothing selected');
        root.querySelector('[data-select="1"]').click(); await t.settle();
        const b = btn.getBoundingClientRect(), r = bar().getBoundingClientRect(), c = root.querySelector('[part="bulk-count"]').getBoundingClientRect();
        t.ok(b.width > 0 && b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom, 'the button sits inside the bar');
        t.ok(b.left >= c.right - 1 || b.top >= c.bottom - 1, 'and does not overlap the count');
    }],

    ['data-table: pk-query-change reaches the host for a reader search and page-size change (#1420)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]'></pk-data-table>`), seen = [];
        el.load = async () => ({ rows: [{ id: 1, sku: 'A' }], total: 1 });
        el.addEventListener('pk-query-change', e => seen.push(e.detail));
        el.refresh();
        await until(() => !el.part('table').hidden, 'the table');
        t.eq(seen.length, 0, 'loading alone raises nothing');
        const box = el.part('filters').shadowRoot.querySelector('[part="search"]'); box.value = 'abc'; box.dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => seen.length === 1, 'the search change');
        t.eq(seen[0].search, 'abc'); t.eq(seen[0].page, 1); t.eq(seen[0].pageSize, 25); t.eq(seen[0].descending, false);
    }],

    ['data-table: load receives an AbortSignal, a newer query aborts the request in flight, and the aborted one draws no error (#817)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"}]'></pk-data-table>`), signals = [], errs = [];
        el.addEventListener('pk-load-error', () => errs.push(1));
        el.load = (q, { signal }) => new Promise((ok, no) => { signals.push(signal); signal.addEventListener('abort', () => no(signal.reason)); if (q.search) ok({ rows: [{ id: 1, sku: 'A' }], total: 1 }); });
        el.refresh();
        await until(() => signals.length === 1, 'the first request');
        const box = el.part('filters').shadowRoot.querySelector('[part="search"]'); box.value = 'a'; box.dispatchEvent(new Event('input', { bubbles: true }));
        await until(() => signals.length === 2 && !el.part('table').hidden, 'the second request to draw');
        t.ok(signals[0].aborted && !signals[1].aborted, 'the first was aborted by the second');
        t.ok(!el.part('state').querySelector('pk-alert') && errs.length === 0, 'the abort shows no error');
    }],

    ['data-table: striped, density, cards, maxHeight and stickyHeader reach the table; maxHeight makes the rows scroll inside it and the header sticks (#817)', async t => {
        const el = await t.mount(`<pk-data-table striped cards density="compact" max-height="8rem" sticky-header columns='[{"key":"sku","label":"SKU"}]' page-size="20"></pk-data-table>`);
        el.load = async () => ({ rows: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, sku: `S${i}` })), total: 20 });
        el.refresh();
        const tb = el.part('table'), scroll = () => tb.shadowRoot.querySelector('[part="scroll"]');
        await until(() => tb.shadowRoot.querySelectorAll('tbody tr').length === 20, 'the rows');
        t.ok(tb.hasAttribute('striped') && tb.hasAttribute('cards') && tb.hasAttribute('sticky-header') && tb.getAttribute('density') === 'compact', 'the attributes reach pk-table');
        t.ok(scroll().clientHeight <= 8 * 16 + 40 && scroll().scrollHeight > scroll().clientHeight, 'the rows scroll inside the capped height');
        scroll().scrollTop = 100; await t.settle();
        const th = tb.shadowRoot.querySelector('thead th').getBoundingClientRect(), box = scroll().getBoundingClientRect();
        t.ok(Math.abs(th.top - box.top) < 2, 'the header stays at the top of the scroll area');
    }],

    ['data-table: an error shows pk-alert with Retry, which loads again; zero rows show the configured empty state (#801)', async t => {
        const el = await t.mount('<pk-data-table></pk-data-table>');
        let n = 0;
        el.columns = JSON.parse(cols); el.empty = { heading: 'Nothing here' };
        el.load = async () => { if (++n === 1) throw new Error('Server said no'); return n === 2 ? { rows: [], total: 0 } : { rows: [{ id: 1, sku: 'A' }], total: 1 }; };
        el.refresh();
        const alert = await until(() => el.part('state').querySelector('pk-alert'), 'the error alert');
        t.ok(alert.textContent.includes('Server said no')); t.ok(el.part('table').hidden, 'the table is hidden');
        (await until(() => alert.querySelector('pk-button'), 'Retry')).click();
        await until(() => el.part('state').querySelector('pk-empty-state'), 'the empty state'); t.eq(el.part('state').querySelector('pk-empty-state').getAttribute('heading'), 'Nothing here');
        el.refresh(); await until(() => !el.part('table').hidden, 'the table');
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

    ['table: header-<key> slots render beside the title in their own header cell; the text title and sort button stay, and the action neither sorts nor leaves the keyboard (#1217)', async t => {
        const many = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, sku: 'S' + i, price: '$' + i }));
        for (const [name, data] of [['plain', JSON.parse(rows)], ['windowed', many]]) {
            const el = await t.mount(`<pk-table label="H" columns='${cols}'><button slot="header-sku" type="button" aria-label="About SKU">?</button></pk-table>`);
            el.rows = data; await t.settle();
            const th = k => el.shadowRoot.querySelector(`thead th[data-key="${k}"]`), btn = el.querySelector('button'), sorts = [];
            el.addEventListener('pk-sort', e => sorts.push(e.detail.key));
            const a = btn.getBoundingClientRect(), b = th('sku').getBoundingClientRect();
            t.ok(a.width > 0 && a.left >= b.left - 1 && a.right <= b.right + 1, name + ': the slotted button renders inside the SKU header cell');
            t.eq(th('sku').querySelector('button').textContent, 'SKU', name + ': the text title is still the sort button');
            t.eq(th('sku').getAttribute('aria-sort'), 'none', name + ': aria-sort stays'); t.ok(th('price').querySelector('slot[name="header-price"]').assignedNodes().length === 0, name + ': a column with no slot has an empty slot');
            t.eq(th('price').textContent.trim(), 'Price', name + ': and its title');
            btn.focus(); t.ok(btn.matches(':focus'), name + ': the action takes keyboard focus'); t.eq(btn.tabIndex, 0, name + ': and is a tab stop');
            btn.click(); await t.settle(); t.eq(sorts.length, 0, name + ': clicking the action raises no pk-sort'); t.eq(th('sku').getAttribute('aria-sort'), 'none', name + ': the column is not sorted');
            th('sku').querySelector('button').click(); await t.settle(); t.eq(sorts.join(), 'sku', name + ': the title button still sorts');
            const late = document.createElement('i'); late.slot = 'header-price'; late.textContent = 'late'; el.append(late); await t.settle();
            t.ok(late.getBoundingClientRect().width > 0, name + ': a header slot added later renders');
        }
    }],
    ['data-table: header-<key> slots reach the inner table header (#1217)', async t => {
        const el = await t.mount(`<pk-data-table columns='[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty"}]'><button slot="header-qty" type="button" aria-label="About Qty">?</button></pk-data-table>`);
        el.load = async () => ({ rows: [{ id: 1, sku: 'A', qty: 3 }], total: 1 }); el.refresh();
        const th = () => el.part('table').shadowRoot.querySelector('thead th[data-key="qty"]');
        await until(() => th(), 'the header');
        await until(() => { const a = el.querySelector('button').getBoundingClientRect(), b = th().getBoundingClientRect(); return a.width > 0 && a.left >= b.left - 1 && a.right <= b.right + 1; }, 'the slotted button in the Qty header');
    }],

    ['table: filters and sorts locally when not manual, and a slotted cell replaces the text', async t => {
        const el = await t.mount(`<pk-table filterable columns='${cols}' rows='${rows}'><b slot="cell-1-sku">custom</b></pk-table>`);
        t.ok(el.shadowRoot.querySelector('tbody tr[data-pk-context="1"] slot[name="cell-1-sku"]'), 'cell slot rendered');
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

    ['table: a click on slotted cell content raises pk-row-click; a slotted button keeps its click', async t => {
        const el = await t.mount(`<pk-table clickable columns='[{"key":"a","label":"A"},{"key":"b","label":"B"},{"key":"c","label":"C"}]' rows='[{"id":1,"a":"plain","b":"","c":""},{"id":2,"a":"x","b":"","c":""}]'><span slot="cell-1-b">badge</span><button slot="cell-1-c" type="button">go</button></pk-table>`);
        await until(() => [...el.shadowRoot.querySelectorAll('tbody tr')].filter(x => x.tabIndex === 0).length === 2, 'focusable rows');
        const got = []; el.addEventListener('pk-row-click', e => got.push(e.detail.id));
        el.shadowRoot.querySelector('tbody td').click(); t.eq(got.join(), '1', 'a plain text cell');
        el.querySelector('span').click(); t.eq(got.join(), '1,1', 'a slotted span');
        el.querySelector('button').click(); t.eq(got.join(), '1,1', 'a slotted button keeps its click');
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
    ['table: a column with shed drops out by its own width (24, 36, 48rem), highest number first, at any viewport; windowed rows align (the phone cards layout is the table-shed UI scenario) (#1218)', async t => {
        const cols = '[{"key":"a","label":"A"},{"key":"b","label":"B","shed":1},{"key":"c","label":"C","shed":2},{"key":"d","label":"D","shed":3}]';
        const shown = el => ['a', 'b', 'c', 'd'].filter(k => { const c = el.shadowRoot.querySelector(`tbody td[data-key="${k}"]`); return c && getComputedStyle(c).display !== 'none'; }).join('');
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), at = async (width, extra = '', rows = '[{"id":1,"a":"1","b":"2","c":"3","d":"4"}]') => {
            const box = await t.mount(`<div style="width:${width}px"><pk-table label="S" ${extra} columns='${cols}' rows='${rows}'></pk-table></div>`);
            const el = box.querySelector('pk-table'); await until(() => el.shadowRoot?.querySelector('tbody td'), 'the table'); await t.settle(); return el;
        };
        t.eq(shown(await at(60 * rem)), 'abcd', 'a 60rem container shows every column');
        t.eq(shown(await at(40 * rem)), 'abc', 'under 48rem the shed 3 column goes');
        t.eq(shown(await at(30 * rem)), 'ab', 'under 36rem shed 2 goes too');
        t.eq(shown(await at(20 * rem)), 'a', 'under 24rem only the unmarked column stays');
        t.ok(innerWidth > 20 * rem, 'decided by the table, not the viewport');
        const rows = JSON.stringify(Array.from({ length: 600 }, (_, i) => ({ id: i, a: `a${i}`, b: 'b', c: 'c', d: 'd' })));
        const big = await at(30 * rem, 'max-height="12rem"', rows), heads = [...big.shadowRoot.querySelectorAll('thead tr:first-child th')].filter(h => getComputedStyle(h).display !== 'none');
        const cells = [...big.shadowRoot.querySelector('tbody tr[data-pk-context]').children].filter(c => getComputedStyle(c).display !== 'none');
        t.eq(big.$virtual, true, 'the table windows'); t.eq(cells.length, heads.length, 'a windowed row has as many cells as headers');
        t.ok(cells.every((c, i) => Math.abs(c.getBoundingClientRect().left - heads[i].getBoundingClientRect().left) < 2), 'windowed cells line up with their headers');
    }],
    ['table (375px): a slotted pk-card in a cell keeps a real width in the cards layout, and the row does not grow absurdly (#1146)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = `<pk-table cards label="C" columns='[{"key":"name","label":"Name"},{"key":"c","label":"Colour in the dark theme scope"}]' rows='[{"id":1,"name":"Primary"}]'><pk-card slot="cell-1-c" data-theme="dark"><span style="display:inline-block;width:2rem;height:1rem;background:red"></span> <code>#336699</code></pk-card></pk-table>`;
        const at = async width => {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '480px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            await until(() => f.contentWindow.customElements.get('pk-table') && f.contentWindow.customElements.get('pk-card') && f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td'), 'the table');
            await new Promise(r => setTimeout(r, 300));
            const d = f.contentDocument, card = d.querySelector('pk-card').getBoundingClientRect(), tr = d.querySelector('pk-table').shadowRoot.querySelector('tbody tr').getBoundingClientRect();
            return { card: card.width, row: tr.height, rowW: tr.width };
        };
        const phone = await at(375); t.ok(phone.card >= phone.rowW / 2, `the card is not squeezed by the long label beside it (${phone.card}px of a ${phone.rowW}px row)`); t.ok(phone.row < 400, `the row stays a sensible height (${phone.row}px)`);
        const wide = await at(1200); t.ok(wide.card > 40, `the card has a width on desktop (${wide.card}px)`);
    }],

    ['table (375px): a title column in the cards layout has no label, starts at the start edge, wraps, and an empty label omits data-label; at 1200px it is an ordinary cell (#1445)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = `<pk-table cards label="T" columns='[{"key":"name","label":"Product","title":true},{"key":"sku","label":""},{"key":"qty","label":"Qty","type":"number"}]' rows='[{"id":1,"name":"A rather long product title that has to wrap onto a second line on a phone","sku":"AC-1000","qty":3}]'></pk-table>`;
        const at = async width => {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '420px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            const tb = await until(() => f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td') && f.contentDocument.querySelector('pk-table'), 'the table');
            await new Promise(r => setTimeout(r, 200));
            const r = tb.shadowRoot, w = f.contentWindow, cell = r.querySelector('td[data-key="name"]'), row = r.querySelector('tbody tr').getBoundingClientRect(), box = cell.getBoundingClientRect();
            const text = w.document.createRange(); text.selectNodeContents(cell.firstChild);
            return { title: cell.hasAttribute('data-title'), label: cell.hasAttribute('data-label'), before: w.getComputedStyle(cell, '::before').content, align: w.getComputedStyle(cell).textAlign, weight: +w.getComputedStyle(cell).fontWeight, left: text.getClientRects()[0].left - row.left, boxW: box.width, rowW: row.width, lines: text.getClientRects().length, skuLabel: r.querySelector('td[data-key="sku"]').hasAttribute('data-label'), qtyLabel: r.querySelector('td[data-key="qty"]').getAttribute('data-label') };
        };
        const phone = await at(375);
        t.ok(phone.title && !phone.label, 'the title cell carries data-title and no data-label');
        t.ok(phone.before === 'none' || phone.before === 'normal', `no label is drawn before the title (${phone.before})`);
        t.eq(phone.align, 'start', 'the title is start-aligned'); t.ok(phone.weight >= 600, `the title has heading weight (${phone.weight})`);
        t.ok(phone.left < 24, `the title starts at the start edge of the card (${phone.left}px in)`); t.ok(phone.boxW >= phone.rowW - 40, `the title spans the card (${phone.boxW}px of ${phone.rowW}px)`);
        t.ok(phone.lines >= 2, 'a long title wraps onto more than one line'); t.ok(!phone.skuLabel, 'an empty label omits data-label'); t.eq(phone.qtyLabel, 'Qty', 'other columns keep their label');
        const wide = await at(1200); t.ok(wide.title, 'the flag reaches the cell on a wide screen'); t.eq(wide.align, 'start', 'a wide table is unchanged');
    }],

    ['table: the foot slot is a tfoot cell spanning every column after the rows on a desktop, and a full-width trailing card on a phone (#1020)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const html = `<pk-table cards selectable label="F" columns='[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty","type":"number"}]' rows='[{"id":1,"sku":"A","qty":1},{"id":2,"sku":"B","qty":2}]'><span slot="foot">Total 3</span></pk-table>`;
        const at = async width => {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '420px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            const tb = await until(() => f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td') && f.contentDocument.querySelector('pk-table'), 'the table');
            await new Promise(r => setTimeout(r, 200));
            const q = s => tb.shadowRoot.querySelector(s), rect = e => e.getBoundingClientRect(), foot = q('tfoot td'), rows = [...tb.shadowRoot.querySelectorAll('tbody tr')];
            return { foot, rect: rect(foot), last: rect(rows.at(-1)), table: rect(q('table')), head: q('thead tr').children.length, span: foot.colSpan, label: foot.querySelector('slot').assignedNodes()[0]?.textContent };
        };
        const wide = await at(1000);
        t.eq(wide.span, wide.head, 'the foot cell spans every column, the checkbox column included'); t.ok(wide.rect.top >= wide.last.bottom - 1, 'the foot sits after the last row'); t.ok(Math.abs(wide.rect.width - wide.table.width) < 2, 'the foot is as wide as the table'); t.eq(wide.label, 'Total 3');
        const phone = await at(375);
        t.ok(phone.rect.top >= phone.last.bottom - 1, 'the trailing card follows the last card'); t.ok(phone.rect.width >= phone.last.width - 24, `the trailing card is as wide as a row card (${phone.rect.width} vs ${phone.last.width})`);
    }],

    ['table (data mode): with no foot there is no trailing tfoot row or card, with a foot slotted it shows (#1103)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const rows = '[{"id":1,"sku":"A"},{"id":2,"sku":"B"}]', cols = '[{"key":"sku","label":"SKU"}]';
        const at = async (width, html) => {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = `${width}px`; f.style.height = '420px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            const tb = await until(() => f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td') && f.contentDocument.querySelector('pk-table'), 'the table');
            await new Promise(r => setTimeout(r, 200));
            const foot = tb.shadowRoot.querySelector('tfoot'), r = foot.getBoundingClientRect();
            return { shown: getComputedStyle(foot).display !== 'none' && r.height > 0 };
        };
        for (const width of [1280, 375]) {
            t.ok(!(await at(width, `<pk-table cards label="F" columns='${cols}' rows='${rows}'></pk-table>`)).shown, `no foot, no trailing tfoot at ${width}px`);
            t.ok((await at(width, `<pk-table cards label="F" columns='${cols}' rows='${rows}'><span slot="foot">Total</span></pk-table>`)).shown, `a slotted foot shows at ${width}px`);
        }
    }],

    ['table and data-table (375px): a toolbar with long controls and an action wraps inside the width, the page does not scroll sideways and the action stays visible (#1016)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const tableHtml = `<pk-table cards label="T" columns='[{"key":"sku","label":"SKU"}]' rows='[{"id":1,"sku":"A"}]'><pk-cluster slot="toolbar"><select aria-label="Status"><option>All statuses of every kind</option></select><pk-button variant="ghost">Export the filtered rows</pk-button></pk-cluster><pk-button slot="toolbar" data-end variant="primary">Add a new product</pk-button></pk-table>`;
        const dataHtml = `<pk-data-table label="D" add-label="Add a new product" columns='[{"key":"sku","label":"SKU"}]'><pk-button slot="actions" variant="ghost">Export the filtered rows</pk-button><pk-button slot="actions" variant="ghost">Import from a file</pk-button></pk-data-table>`;
        for (const [name, html] of [['pk-table', tableHtml], ['pk-data-table', dataHtml]]) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = '375px'; f.style.height = '420px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
            const W = () => f.contentWindow, D = () => f.contentDocument; await until(() => W().customElements.get(name) && D().querySelector(name)?.shadowRoot?.querySelector('[part="toolbar"]'), `the ${name}`); const w = W(), d = D();
            await new Promise(r => setTimeout(r, 300));
            t.eq(w.innerWidth, 375);
            const root = d.documentElement; t.ok(root.scrollWidth <= root.clientWidth, `${name}: the page does not scroll sideways (scrollWidth ${root.scrollWidth}, clientWidth ${root.clientWidth})`);
            const bar = d.querySelector(name).shadowRoot.querySelector('[part="toolbar"]').getBoundingClientRect();
            t.ok(bar.right <= 375 + 1, `${name}: the toolbar ends inside the viewport (right ${Math.round(bar.right)})`);
            const btns = [...d.querySelectorAll('pk-button')].concat([...d.querySelector(name).shadowRoot.querySelectorAll('pk-button')]).filter(b => b.getBoundingClientRect().width > 0);
            t.ok(btns.length > 0 && btns.every(b => b.getBoundingClientRect().right <= 375 + 1), `${name}: every button is inside the viewport (${btns.map(b => Math.round(b.getBoundingClientRect().right)).join(', ')})`);
        }
    }],

    ['table-filters: the search box and filter trigger are pills (a length radius, never a percentage that draws an ellipse) at a wide and a narrow width', async t => {
        for (const width of ['40rem', '12rem']) {
            const host = t.stage('<pk-table-filters label="Search products" filter-count="1"><pk-select label="Category"><option>A</option></pk-select></pk-table-filters>');
            host.style.inlineSize = width;
            const el = host.firstElementChild; await t.load(host);
            for (const name of ['search', 'trigger']) {
                const part = el.part(name), r = getComputedStyle(part).borderTopLeftRadius;
                t.ok(!/%|\s/.test(r), `${name} at ${width}: one length radius, equal horizontally and vertically (got "${r}")`);
                t.ok(parseFloat(r) >= part.getBoundingClientRect().height / 2, `${name} at ${width}: rounded at least half the height (${r})`);
            }
        }
    }],

    ['table-filters: typing debounces pk-search; the trigger only shows once the default slot has content, opens/closes the panel and reports pk-toggle; Clear filters raises pk-clear-filters; the badge reflects filterCount', async t => {
        const bare = await t.mount('<pk-table-filters debounce="10" label="Search products"></pk-table-filters>');
        t.ok(bare.part('trigger').hidden, 'no filter fields slotted: no trigger');
        const el = await t.mount('<pk-table-filters debounce="10" label="Search products" filter-count="2"><pk-select label="Category"><option>A</option></pk-select></pk-table-filters>');
        let queries = 0, lastQuery = null; el.addEventListener('pk-search', e => { queries++; lastQuery = e.detail.query; });
        const search = el.part('search');
        search.value = 'w'; search.dispatchEvent(new Event('input', { bubbles: true }));
        search.value = 'wi'; search.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 40));
        t.eq(queries, 1, 'one debounced pk-search, not one per keystroke'); t.eq(lastQuery, 'wi');
        t.ok(!el.part('trigger').hidden, 'a slotted filter field shows the trigger'); t.ok(!el.part('count').hidden); t.eq(el.part('count').textContent, '2');
        t.ok(el.part('panel').hidden, 'closed by default');
        let toggles = [];
        el.addEventListener('pk-toggle', e => toggles.push(e.detail.open));
        el.part('trigger').click(); await t.settle();
        t.ok(el.open); t.ok(!el.part('panel').hidden); t.eq(el.part('trigger').getAttribute('aria-expanded'), 'true'); t.eq(JSON.stringify(toggles), '[true]');
        el.part('close').click(); await t.settle();
        t.ok(!el.open); t.ok(el.part('panel').hidden); t.eq(JSON.stringify(toggles), '[true,false]');
        let cleared = 0; el.addEventListener('pk-clear-filters', () => cleared++);
        el.part('trigger').click(); await t.settle();
        el.part('clear').click();
        t.eq(cleared, 1, 'Clear filters raises pk-clear-filters; the host owns clearing its own slotted fields');
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

    ['empty-state: a description prop shows beside indented markup, and the actions sit centred under it (wide, narrow, rtl)', async t => {
        const markup = '<pk-empty-state heading="Nothing here" description="No items yet.">' + String.fromCharCode(10) + '  <span slot="actions"><a href="#back">Back to list</a></span>' + String.fromCharCode(10) + '  <pk-button slot="actions">Add item</pk-button>' + String.fromCharCode(10) + '</pk-empty-state>';
        for (const [label, width, dir] of [['wide', 900, 'ltr'], ['narrow', 280, 'ltr'], ['rtl', 360, 'rtl']]) {
            const e = await t.mount(markup); e.style.width = width + 'px'; e.setAttribute('dir', dir); await t.settle();
            const r = n => n.getBoundingClientRect(), desc = r(e.part('description')), head = r(e.part('heading')), act = r(e.part('actions')), host = r(e);
            t.ok(desc.width > 0 && e.part('description').textContent.includes('No items yet.'), label + ': the description prop shows');
            t.ok(desc.top >= head.bottom - 1 && act.top >= desc.bottom - 1, label + ': heading, description and actions stack in order');
            t.ok(act.left >= host.left - 1 && act.right <= host.right + 1, label + ': the actions stay inside the host');
            t.ok(Math.abs((act.left + act.right) / 2 - (host.left + host.right) / 2) < 3, label + ': the actions are centred');
        }
    }],

    ['field-list: hides an empty heading and lays dt and dd out as a grid', async t => {
        const l = await t.mount('<pk-field-list heading="IDs"><dt>SKU</dt><dd>X</dd></pk-field-list>');
        t.ok(!l.part('heading').hidden); t.eq(getComputedStyle(l.part('list')).display, 'grid');
        const m = await t.mount('<pk-field-list><dt>A</dt><dd>B</dd></pk-field-list>'); t.ok(m.part('heading').hidden);
    }],

    ['field-list: a long unbreakable value wraps inside a narrow host instead of clipping (issue 1245)', async t => {
        const l = await t.mount('<pk-field-list layout="stacked"><dt>Email</dt><dd id="v"><a href="mailto:user@example.com">averyveryverylongunbreakableaddress85030521@example.com</a></dd></pk-field-list>');
        l.style.inlineSize = '180px';
        const dd = l.querySelector('#v'); t.ok(dd.scrollWidth <= dd.clientWidth + 1 && dd.getBoundingClientRect().right <= l.getBoundingClientRect().right + 1);
    }],

    ['field-list: a slotted dt/dd pair with an empty dd hides itself, shows again when a value appears, and showEmpty keeps it (issue 801)', async t => {
        const l = await t.mount('<pk-field-list><dt id="a">Number</dt><dd id="b">AC-1</dd><dt id="c">Note</dt><dd id="d"></dd><dt id="e">Tag</dt><dd id="f"><span>x</span></dd></pk-field-list>');
        t.ok(!l.querySelector('#a').hidden && !l.querySelector('#b').hidden, 'a pair with a value shows');
        t.ok(l.querySelector('#c').hidden && l.querySelector('#d').hidden, 'a pair with an empty dd is hidden together');
        t.ok(!l.querySelector('#e').hidden, 'a dd holding an element is not empty');
        t.eq(l.querySelector('#c').getBoundingClientRect().height, 0, 'and takes no room');
        l.querySelector('#d').textContent = 'later'; await t.settle(); await new Promise(r => setTimeout(r, 50));
        t.ok(!l.querySelector('#c').hidden && !l.querySelector('#d').hidden, 'a value that arrives shows the pair again');
        l.querySelector('#d').textContent = ''; await t.settle(); await new Promise(r => setTimeout(r, 50));
        t.ok(l.querySelector('#c').hidden, 'and emptying it hides it again');
        l.showEmpty = true; await t.settle(); t.ok(!l.querySelector('#c').hidden, 'showEmpty keeps empty pairs');
    }],

    ['field-list: a page re-flows the columns through --pk-field-list-columns without touching the shadow root', async t => {
        const l = await t.mount('<pk-field-list><dt>A</dt><dd>B</dd></pk-field-list>');
        const cols = () => getComputedStyle(l.part('list')).gridTemplateColumns.split(' ').length;
        t.eq(cols(), mediaBelow('phone').matches ? 1 : 2); l.style.setProperty('--pk-field-list-columns', '1fr 1fr 1fr 1fr'); t.eq(cols(), 4);
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

    ['list-group dense: rows sit at text height with their children inline from the start and an indent step per depth, and a 375px phone still gets the touch target', async t => {
        const markup = '<pk-list-group variant="action" dense label="Outline"><button type="button"><span>a</span><span>1</span></button><button type="button" data-depth="1">b</button><button type="button" data-depth="3">c</button></pk-list-group>';
        const el = await t.mount(markup);
        const rows = [...el.children], rect = n => n.getBoundingClientRect();
        t.ok(rows.every(r => rect(r).height < 44), `dense rows are under the 44px touch target on desktop (${rect(rows[0]).height}px)`);
        const kids = [...rows[0].children];
        t.ok(rect(kids[1]).left - rect(kids[0]).right < 40, 'the children sit together from the start, not pushed apart');
        const pad = r => parseFloat(getComputedStyle(r).paddingInlineStart);
        t.ok(pad(rows[1]) > pad(rows[0]) && pad(rows[2]) > pad(rows[1]), 'data-depth indents each step further');
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '240px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc(markup); await loaded;
        const lg = await until(() => { const g = f.contentDocument.querySelector('pk-list-group'); return g?.shadowRoot && f.contentWindow.customElements.get('pk-list-group') && g; }, 'the list group');
        await wait(100);
        t.ok([...lg.children].every(r => r.getBoundingClientRect().height >= 44), 'on a phone every dense actionable row keeps the 44px touch target');
    }],

    ['accordion-item: an actions button is outside the summary and does not toggle', async t => {
        const el = await t.mount('<pk-accordion-item heading="A"><button slot="actions">Go</button>a</pk-accordion-item>');
        const btn = el.querySelector('button'); btn.click();
        t.ok(!el.part('details').open, 'clicking an action leaves the item closed');
        t.ok(!el.part('summary').contains(el.part('actions')), 'the actions are not inside the summary');
    }],
    ['accordion-item: on a 375px phone each action is at least the touch target and clear of the heading label', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '360px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc('<pk-accordion-item heading="Shipping and returns policy for orders placed over the phone" open><pk-button slot="actions" size="mini" variant="ghost">Edit</pk-button><pk-button slot="actions" size="mini" variant="ghost">Copy</pk-button>a</pk-accordion-item>'); await loaded;
        const win = () => f.contentWindow, docu = () => f.contentDocument;
        await until(() => win().customElements.get('pk-accordion-item') && win().customElements.get('pk-button') && docu().querySelector('pk-accordion-item')?.shadowRoot?.querySelector('summary'), 'the item');
        const w = win(), doc = docu();
        const el = doc.querySelector('pk-accordion-item'), touch = parseFloat(w.getComputedStyle(doc.documentElement).getPropertyValue('--touch-target')) || 44;
        await wait(300); t.eq(w.innerWidth, 375);
        const label = el.part('heading'), range = doc.createRange(); range.selectNodeContents(label.querySelector('slot') || label);
        const lines = [...range.getClientRects()].filter(c => c.width > 0 && c.height > 0);
        t.ok(lines.length > 0, 'the heading has text lines to measure');
        for (const b of el.querySelectorAll('[slot=actions]')) {
            const r = b.getBoundingClientRect();
            t.ok(r.width >= touch - 0.5 && r.height >= touch - 0.5, `an action is ${Math.round(r.width)}x${Math.round(r.height)}, at least ${touch}px`);
            for (const c of lines) t.ok(r.right <= c.left + 0.5 || r.left >= c.right - 0.5 || r.bottom <= c.top + 0.5 || r.top >= c.bottom - 0.5, 'an action does not overlap a line of the heading text');
        }
    }],
    ['accordion-item: Tab goes summary then actions; Enter and Space on an action do not toggle the item', async t => {
        const el = await t.mount('<pk-accordion-item heading="A"><button slot="actions" id="a1">One</button><button slot="actions" id="a2">Two</button>a</pk-accordion-item>');
        t.ok(el.part('summary').compareDocumentPosition(el.part('actions')) & Node.DOCUMENT_POSITION_FOLLOWING, 'the actions follow the summary, so Tab reaches the summary first');
        const a1 = el.querySelector('#a1'); a1.focus(); t.eq(el.querySelector(':focus'), a1, 'an action takes focus');
        for (const k of ['Enter', ' ']) for (const type of ['keydown', 'keyup']) a1.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, composed: true }));
        a1.click(); t.ok(!el.part('details').open, 'the action did not toggle the item');
    }],
    ['accordion-item: no interactive element is inside the summary', async t => {
        const el = await t.mount('<pk-accordion-item heading="A"><button slot="actions">Go</button><a slot="actions" href="#x">Link</a>a</pk-accordion-item>');
        const s = el.part('summary');
        t.ok(!s.querySelector('button, a, input, select, [tabindex]'), 'nothing focusable in the summary');
        t.ok(!s.querySelector('slot[name=actions]') && !s.contains(el.part('actions')), 'the actions slot is not in the summary');
    }],
    ['accordion-item: the chevron and the actions do not overlap, in LTR and RTL', async t => {
        for (const dir of ['ltr', 'rtl']) {
            const el = await t.mount(`<div dir="${dir}"><pk-accordion-item heading="A long heading that needs the room"><button slot="actions">Re-check now</button>a</pk-accordion-item></div>`);
            const item = el.querySelector('pk-accordion-item'), c = item.part('chevron').getBoundingClientRect(), a = item.querySelector('button').getBoundingClientRect();
            t.ok(c.right <= a.left || a.right <= c.left, `${dir}: the chevron and the actions side by side`);
        }
    }],
    ['accordion: an item toggles its details and reports it; exclusive closes the others', async t => {
        const el = await t.mount('<pk-accordion exclusive><pk-accordion-item heading="A" open>a</pk-accordion-item><pk-accordion-item heading="B">b</pk-accordion-item></pk-accordion>');
        const [a, b] = el.querySelectorAll('pk-accordion-item'); t.ok(a.part('details').open);
        let ev = null; b.addEventListener('pk-toggle', e => { ev = e.detail; });
        b.part('details').open = true; await wait(50); await t.settle();
        t.eq(b.open, true); t.eq(ev.open, true); t.eq(a.open, false, 'exclusive closed the first'); t.eq(a.part('details').open, false);
    }],

    ['tree: a tree built in a detached tree (template content moved in is not upgraded until it is connected) does not re-queue updates forever', async t => {
        const el = await t.mount('<pk-tree label="Cats"><pk-tree-item label="Books"></pk-tree-item></pk-tree>'); await t.settle();
        const loose = document.createElement('pk-tree'); const tpl = document.createElement('template'); tpl.innerHTML = '<pk-tree-item label="A"></pk-tree-item>'; loose.append(tpl.content);
        let n = 0; const real = loose.requestUpdate; loose.requestUpdate = function () { n++; return real.call(this); };
        loose.requestUpdate();
        await new Promise(r => setTimeout(r, 100));
        t.ok(n < 50, 'the loose tree asked for ' + n + ' updates in 100 ms');
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
        t.eq(c.part('code').querySelectorAll('[part="line"]').length, 2); t.eq(c.part('body').getAttribute('aria-label'), 'a.js');
        c.part('wrap').click(); await t.settle(); t.eq(c.wrap, true); t.eq(c.part('wrap').getAttribute('aria-pressed'), 'true');
        let ok = null; c.addEventListener('pk-copy', e => { ok = e.detail.ok; });
        const orig = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
        c.part('copy').click(); await wait(20); await t.settle();
        Object.defineProperty(navigator, 'clipboard', { value: orig, configurable: true });
        t.eq(ok, true); t.eq(c.part('status').textContent, 'Copied');
    }],

    ['code-view fill (#1523): takes the container height, ignores max-height and scrolls its body inside', async t => {
        const text = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');
        const box = await t.mount(`<div style="display:flex;flex-direction:column;block-size:300px;inline-size:100%"><pk-code-view fill max-height="5rem" label="f.txt">${text}</pk-code-view></div>`);
        const el = box.querySelector('pk-code-view'); await t.settle();
        const body = el.part('body');
        t.eq(Math.round(el.getBoundingClientRect().height), 300, 'the host takes the 300px of its container (max-height ignored)');
        t.ok(body.scrollHeight > body.clientHeight + 100, 'the lines overflow the body');
        body.scrollTop = 500; await wait(50);
        t.ok(body.scrollTop > 0, 'the body scrolled');
        t.eq(Math.round(el.getBoundingClientRect().height), 300, 'the host did not grow while scrolling');
        el.fill = false; await t.settle();
        t.ok(el.getBoundingClientRect().height < 300, 'without fill it is capped by max-height again');
    }],

    ['code-view header (#1523): hidden without header; label, language, derived count and slots with it; slotted text is not code; fits at 375px', async t => {
        const box = await t.mount('<div style="inline-size:375px"><pk-code-view label="a.cs">one\ntwo\nthree</pk-code-view></div>');
        const el = box.querySelector('pk-code-view'); await t.settle();
        t.eq(el.shadowRoot.querySelector('.header').getBoundingClientRect().height, 0, 'no header without the header attribute');
        el.language = 'C#'; el.header = true; el.innerHTML = '<span slot="header-start">hs</span><button slot="actions">Outline</button><button slot="actions">Usages of a very long symbol name</button>one\ntwo\nthree'; await t.settle(); await wait(50);
        t.ok(el.shadowRoot.querySelector('.header').getBoundingClientRect().height > 0, 'the header shows');
        t.eq(el.shadowRoot.querySelector('.title').textContent, 'a.cs'); t.eq(el.shadowRoot.querySelector('.language').textContent, 'C#'); t.eq(el.part('count').textContent, '3 lines');
        t.eq(el.part('rows').children.length, 3, 'slotted header content is not a code line');
        const h = el.shadowRoot.querySelector('.header').getBoundingClientRect(), hs = el.querySelector('[slot=header-start]').getBoundingClientRect(), a = el.querySelector('[slot=actions]').getBoundingClientRect();
        t.ok(hs.height > 0 && a.height > 0, 'the slots are placed');
        t.ok(a.right <= h.right + 1 && a.left >= h.left - 1, 'the actions stay inside the header at 375px');
        t.ok(el.shadowRoot.querySelector('.header').scrollWidth <= el.shadowRoot.querySelector('.header').clientWidth + 1, 'the header does not overflow');
        el.lines = ['x']; await t.settle(); t.eq(el.part('count').textContent, '1 line');
    }],

    ['code-view copy (#1523): opt-in header button writes the joined lines, fires pk-copy, announces in the status region and works from the keyboard', async t => {
        const box = await t.mount('<div style="inline-size:375px"><pk-code-view header label="a.js">one\ntwo\nthree</pk-code-view></div>');
        const el = box.querySelector('pk-code-view'); await t.settle();
        const btn = el.part('copy');
        t.eq(btn.getBoundingClientRect().height, 0, 'no Copy button without copy');
        el.copy = true; await t.settle();
        t.ok(btn.getBoundingClientRect().height > 0, 'the Copy button shows with copy');
        let written = null, ev = null; el.addEventListener('pk-copy', e => { ev = e.detail; });
        const orig = navigator.clipboard; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { written = s; } }, configurable: true });
        try {
            btn.focus(); t.eq(el.shadowRoot.activeElement, btn, 'the button takes focus');
            btn.click(); await wait(20); await t.settle();
            t.eq(written, 'one\ntwo\nthree', 'the lines joined by newlines, no line numbers');
            t.eq(ev?.ok, true, 'pk-copy detail ok'); t.eq(el.part('status').textContent, 'Copied', 'the status announces');
            t.eq(el.part('status').getAttribute('role'), 'status');
            Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('no'); } }, configurable: true });
            btn.click(); await wait(20); await t.settle();
            t.eq(ev?.ok, false, 'a refused write reports ok false'); t.eq(el.part('status').textContent, 'Copy failed');
        } finally { Object.defineProperty(navigator, 'clipboard', { value: orig, configurable: true }); }
        const h = el.shadowRoot.querySelector('.header');
        t.ok(h.scrollWidth <= h.clientWidth + 1, 'the header does not overflow at 375px');
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

    ['calendar: arrow, Home/End and Page keys clamp at min and max and focus stays on an enabled day, across months, in single and range mode', async t => {
        for (const range of ['', ' range']) {
            const c = await t.mount(`<pk-calendar${range} month="2026-09-01" min="2026-09-05" max="2026-10-02"></pk-calendar>`);
            const press = async (key, shiftKey = false) => { c.shadowRoot.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true, cancelable: true })); await t.settle(); };
            const at = () => c.shadowRoot.activeElement;
            c.part('days').querySelector('[data-date="2026-09-06"]').focus();
            await press('ArrowLeft'); t.eq(at()?.dataset.date, '2026-09-05'); await press('ArrowLeft'); t.eq(at()?.dataset.date, '2026-09-05'); t.ok(!at().disabled);
            await press('ArrowUp'); t.eq(at()?.dataset.date, '2026-09-05'); await press('Home'); t.eq(at()?.dataset.date, '2026-09-05'); await press('PageUp'); t.eq(at()?.dataset.date, '2026-09-05');
            await press('PageDown'); t.eq(c.part('title').textContent, 'October 2026'); t.eq(at()?.dataset.date, '2026-10-02'); t.ok(!at().disabled);
            await press('ArrowRight'); t.eq(at()?.dataset.date, '2026-10-02'); await press('ArrowDown'); t.eq(at()?.dataset.date, '2026-10-02'); await press('End'); t.eq(at()?.dataset.date, '2026-10-02');
            await press('PageDown', true); t.eq(at()?.dataset.date, '2026-10-02'); t.ok(c.shadowRoot.contains(at()), 'focus is still inside the calendar');
        }
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

    ['gallery: a frame that loads but never says it is ready (the gallery files are absent from the install) shows the notice that names src; a gallery that answers keeps it hidden (#1253)', async t => {
        const el = await t.mount('<pk-gallery src="about:blank"></pk-gallery>');
        t.ok(el.part('notice').hidden, 'no notice while the frame is still loading');
        el.missing();
        t.ok(!el.part('notice').hidden && /src attribute/.test(el.part('notice').textContent), 'the notice shows and names the src attribute');
        el.part('notice').hidden = true; el.$ready = true; el.missing(); // a gallery that answered is never reported missing
        t.ok(el.part('notice').hidden, 'a ready gallery keeps the notice hidden');
    }],

    ['gallery: chrome full keeps the contents nav, cut down to the requested control', async t => {
        const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
        const el = await t.mount('<pk-gallery chrome="full" control="button" height="420"></pk-gallery>');
        el.part('frame').loading = 'eager'; // The stage sits off-screen, where a lazy frame may never be asked to load; the element keeps loading=lazy for real pages, the test forces it.
        const doc = await until(() => el.part('frame').contentDocument?.querySelector('#gx-nav pk-nav-item') && el.part('frame').contentDocument, 'the nav');
        t.eq([...doc.querySelectorAll('#gx-nav pk-nav-item[slot][href]')].map(a => a.textContent.trim()).join(), 'Button');
        t.ok(doc.querySelector('#gx-bar'), 'the toolbar is there');
        // The element page is drawn asynchronously (elementSlot loads the element's API data first), later than the nav: wait for the page and the inspector it feeds.
        await until(() => doc.querySelector('#gx-view pk-page-header')?.getAttribute('heading') === 'Button', 'the page to open on the control');
        await until(() => doc.querySelector('#gx-inspector-body pk-code-block'), 'the Details inspector to show the live markup of the element page');
    }],
    ['log: role=log with a name, rows from append() and rows, level words, the cap trims the oldest, it sticks to the bottom until the user scrolls up, then a 44px resume button jumps back and pk-pause is raised', async t => {
        const el = await t.mount('<pk-log label="Build output" max="50" style="--pk-log-height: 8rem">Nothing yet.</pk-log>');
        const sc = el.part('scroller'); const rowsIn = () => el.part('list').children.length; const seen = [];
        t.eq(sc.getAttribute('role'), 'log'); t.eq(sc.getAttribute('aria-label'), 'Build output'); t.eq(sc.tabIndex, 0); t.eq(sc.getAttribute('aria-live'), 'polite');
        t.ok(!el.part('empty').hidden, 'the empty text shows while there are no rows'); t.ok(el.part('resume').hidden);
        el.addEventListener('pk-pause', e => seen.push(e.detail.paused));
        el.append({ level: 'error', text: 'Build failed', time: '12:00:01' }, 'plain'); await t.settle();
        t.eq(rowsIn(), 2); await until(() => el.part('empty').hidden, 'the empty text to hide'); t.ok(el.part('empty').hidden);
        const first = el.part('list').firstElementChild; t.eq(first.classList.contains("error"), true); t.eq(first.querySelector('.lvl').textContent, 'error'); t.eq(first.querySelector('.time').textContent, '12:00:01'); t.eq(first.querySelector('.msg').textContent, 'Build failed');
        t.ok(getComputedStyle(first).fontFamily.includes('mono'), 'monospace rows');
        for (let i = 0; i < 80; i++) el.append(`line ${i}`);
        await t.settle();
        t.eq(rowsIn(), 50, 'the cap drops the oldest rows'); t.eq(el.part('list').lastElementChild.textContent, 'line 79');
        // The scroll-to-bottom is deferred to the next animation frame (so a stream of separate-tick appends pays for one layout
        // per frame, not per row), so wait for it rather than assume two message-channel hops span a frame.
        const atBottom = () => sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4;
        t.ok(sc.scrollHeight > sc.clientHeight, 'the rows overflow'); await until(atBottom, 'the log to settle at the bottom');
        const kept = el.part('list').firstElementChild;
        el.append('more'); await t.settle(); t.ok(kept.isConnected === false, 'an old row went'); await until(atBottom, 'still at the bottom');
        sc.scrollTop = 0; await until(() => el.paused, 'the log to pause');
        t.ok(el.paused && seen.join() === 'true', 'scrolling up pauses and says so once'); t.ok(!el.part('resume').hidden, 'the resume button shows');
        const top = sc.scrollTop; el.append('while paused'); await t.settle();
        t.ok(el.part('list').lastElementChild.textContent === 'while paused' && Math.abs(sc.scrollTop - top) < 2, 'new rows arrive without moving the view');
        const r = el.part('resume'); r.click(); await until(() => !el.paused && r.hidden, 'the button to resume');
        t.ok(!el.paused && !el.hasAttribute('paused') && r.hidden, 'the button resumes'); t.eq(seen.join(), 'true,false'); await until(atBottom, 'and jumps to the newest row');
        el.paused = true; await t.settle(); t.eq(seen.length, 2, 'a host change raises nothing'); el.paused = false; await until(atBottom, 'follows again');
        el.rows = ['x', { text: 'y', level: 'warn' }]; await t.settle(); t.eq(rowsIn(), 2, 'rows replaces the rows'); el.live = 'off'; await t.settle(); t.eq(sc.getAttribute('aria-live'), 'off');
        el.clear(); await t.settle(); t.eq(rowsIn(), 0);
        el.append(...Array.from({ length: 40 }, (_, i) => 'again ' + i)); await until(() => sc.scrollHeight > sc.clientHeight && atBottom(), 'the new rows to reach the bottom'); sc.scrollTop = 0; await until(() => el.paused && !el.part('resume').hidden && el.part('resume').getBoundingClientRect().width > 0, 'the resume button to show'); const b = el.part('resume').getBoundingClientRect(); t.ok(b.height >= 44 || innerWidth > 640, 'the resume button is 44px tall on a phone'); t.ok(b.width > 0);
    }],
    ['log: the scroll event of the programmatic jump to the bottom is not the reader scrolling, even when the host pauses before it is delivered', async t => {
        const el = await t.mount('<pk-log label="Stream" style="--pk-log-height: 6rem"></pk-log>');
        const sc = el.part('scroller'), seen = []; el.addEventListener('pk-pause', e => seen.push(e.detail.paused));
        const frame = () => new Promise(r => requestAnimationFrame(r));
        el.append(...Array.from({ length: 60 }, (_, i) => 'line ' + i));
        // The jump runs in a frame callback; the scroll event for it is delivered with the next frame's rendering steps. Pause as soon as the
        // jump has happened (still before that event), so the event meets a host-paused log sitting at the bottom.
        while (!(sc.scrollHeight > sc.clientHeight && sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4)) await frame();
        el.paused = true;
        for (let i = 0; i < 4; i++) await frame();
        t.eq(seen.length, 0, 'a host pause raises nothing, and the late scroll event of the jump does not resume it'); t.ok(el.paused, 'it stays paused');
    }],
    ['log: a burst of separate-tick appends settles once per frame, not once per row, and keeps following across frames', async t => {
        const el = await t.mount('<pk-log label="Stream" style="--pk-log-height: 6rem"></pk-log>');
        const sc = el.part('scroller'); const atBottom = () => sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 4;
        await until(() => !el.$raf, 'the frame requested by mounting to have run, before counting'); // a clean slate to count from
        let frames = 0; const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (...a) => { frames++; return raf(...a); };
        try {
            // Separate microtask ticks (as a socket message or a SignalR line would arrive), all inside the same task: one frame.
            for (let i = 0; i < 200; i++) { el.append('line ' + i); await Promise.resolve(); }
        } finally { window.requestAnimationFrame = raf; }
        t.eq(frames, 1, 'a burst of separate-tick appends inside one task asks for exactly one frame, not one per append');
        await until(atBottom, 'the log to settle at the bottom after a burst of separate-tick appends');
        // Appends that really do land in separate frames (a slow stream) must still end up following, not stuck paused.
        for (let f = 0; f < 5; f++) { el.append('frame ' + f); await new Promise(r => requestAnimationFrame(r)); await new Promise(r => requestAnimationFrame(r)); }
        await until(atBottom, 'the log keeps following across separate frames');
        t.ok(!el.paused, 'never paused itself while it was the one scrolling');
    }],
    ['table (editable): Ctrl+Z undoes the last committed cell edit and Ctrl+Y redoes it, each through pk-cell-edit, and the value shows in the cell', async t => {
        const el = await t.mount(`<pk-table editable label="Stock" columns='[{"key":"name","label":"Name","editor":"text"},{"key":"qty","label":"Qty","type":"number","editor":"number"}]' rows='[{"id":1,"name":"Widget","qty":4},{"id":2,"name":"Gadget","qty":9}]'></pk-table>`);
        await t.settle();
        const cell = (r, k) => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`);
        const seen = []; el.addEventListener('pk-cell-edit', e => seen.push(`${e.detail.key}:${e.detail.previous}>${e.detail.value}`));
        const press = (n, k, mods = {}) => n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...mods }));
        await until(() => cell(1, 'name')?.tabIndex === 0, 'the grid');
        cell(1, 'name').focus(); press(cell(1, 'name'), 'Enter');
        const input = await until(() => cell(1, 'name').querySelector('input'), 'the editor');
        input.value = 'Widget XL'; press(input, 'Enter');
        await until(() => cell(1, 'name').textContent === 'Widget XL', 'the edit to show');
        cell(2, 'qty').focus(); press(cell(2, 'qty'), 'Enter');
        const q = await until(() => cell(2, 'qty').querySelector('input'), 'the number editor');
        q.value = '11'; press(q, 'Enter');
        await until(() => cell(2, 'qty').textContent === '11', 'the number edit to show');
        press(cell(2, 'qty'), 'z', { ctrlKey: true });
        await until(() => cell(2, 'qty').textContent === '9', 'undo to restore 9');
        t.eq(el.rows[1].qty, 9, 'undo went into the rows');
        press(cell(2, 'qty'), 'z', { ctrlKey: true });
        await until(() => cell(1, 'name').textContent === 'Widget', 'a second undo to restore the first edit');
        press(cell(1, 'name'), 'y', { ctrlKey: true });
        await until(() => cell(1, 'name').textContent === 'Widget XL', 'redo to reapply it');
        t.eq(seen.join(), 'name:Widget>Widget XL,qty:9>11,qty:11>9,name:Widget XL>Widget,name:Widget>Widget XL', 'every step raised pk-cell-edit with its previous value');
        el.addEventListener('pk-cell-edit', e => e.preventDefault());
        press(cell(1, 'name'), 'z', { ctrlKey: true }); await t.settle();
        t.eq(cell(1, 'name').textContent, 'Widget XL', 'a refused undo keeps the value');
    }],
    ['table (editable): pasting tab-separated text fills a block from the active cell through pk-cell-edit, skips read-only and off-grid cells, flags invalid ones only, and one Ctrl+Z reverts it all', async t => {
        const el = await t.mount(`<pk-table editable label="Stock" columns='[{"key":"sku","label":"SKU"},{"key":"name","label":"Name","editor":"text"},{"key":"qty","label":"Qty","type":"number","editor":"number","min":0}]' rows='[{"id":1,"sku":"A","name":"Widget","qty":4},{"id":2,"sku":"B","name":"Gadget","qty":9}]'></pk-table>`);
        await t.settle();
        const cell = (r, k) => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`);
        const seen = [], sum = []; el.addEventListener('pk-cell-edit', e => seen.push(`${e.detail.key}:${e.detail.value}:${e.detail.source}`)); el.addEventListener('pk-cells-paste', e => sum.push(e.detail));
        const paste = (n, text) => n.dispatchEvent(Object.assign(new Event('paste', { bubbles: true, composed: true, cancelable: true }), { clipboardData: { getData: () => text } }));
        await until(() => cell(1, 'sku')?.tabIndex === 0, 'the grid');
        cell(1, 'sku').focus(); cell(1, 'name').click(); await t.settle();
        const rowsBefore = el.rows.map(r => ({ ...r }));
        paste(cell(1, 'name'), 'Bolt\t-3\textra\r\nNut\t7\r\nBeyond\t1\n');
        await until(() => cell(2, 'qty').textContent === '7', 'the paste to show');
        t.eq(el.rows[0].name, 'Bolt', 'the first cell took its text'); t.eq(el.rows[1].name, 'Nut'); t.eq(el.rows[0].qty, 4, 'the invalid -3 (min 0) was not committed');
        t.eq(cell(1, 'qty').getAttribute('aria-invalid'), 'true', 'only the invalid cell is aria-invalid'); t.ok(!cell(2, 'qty').hasAttribute('aria-invalid'));
        t.eq(el.rows[0].sku, 'A', 'a read-only column is not overwritten');
        t.eq(seen.join(), 'name:Bolt:paste,name:Nut:paste,qty:7:paste', 'each accepted cell raised pk-cell-edit with source paste');
        t.eq(sum[0].cells.length, 3); t.eq(sum[0].rejected[0].reason, 'At least 0', 'the invalid cell is listed with its message');
        t.ok(sum[0].rejected.some(r => r.reason === 'outside'), 'cells beyond the grid are listed as outside');
        cell(1, 'name').focus(); cell(1, 'name').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true, cancelable: true }));
        await until(() => cell(1, 'name').textContent === 'Widget', 'undo');
        t.eq(JSON.stringify(el.rows), JSON.stringify(rowsBefore), 'one undo reverted the whole paste');
        el.addEventListener('pk-cell-edit', e => e.preventDefault()); seen.length = 0; paste(cell(1, 'name'), 'Refused');
        await t.settle(); t.eq(el.rows[0].name, 'Widget', 'a cancelled pk-cell-edit leaves the cell unchanged'); t.eq(sum.at(-1).rejected[0].reason, 'refused');
    }],
    // Issue 331: async commit state (detail.wait), the date editor, and a message that stays readable in a narrow column.
    ['table (editable): detail.wait marks the cell aria-busy while the host saves; a rejection puts the value back, shows the message with aria-invalid, announces it and leaves the undo history; a fulfilment clears the busy state', async t => {
        const el = await t.mount(`<pk-table editable label="Stock" columns='[{"key":"name","label":"Name","editor":"text"}]' rows='[{"id":1,"name":"Widget"},{"id":2,"name":"Gadget"}]'></pk-table>`);
        await t.settle();
        const cell = r => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=name]`), live = () => el.shadowRoot.querySelector('[role=status].sr')?.textContent ?? '';
        const jobs = []; el.addEventListener('pk-cell-edit', e => e.detail.wait(new Promise((ok, no) => jobs.push({ ok, no, id: e.detail.id }))));
        await until(() => cell(1)?.tabIndex === 0, 'the grid');
        const edit = async (r, text) => { cell(r).focus(); cell(r).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true })); const i = await until(() => cell(r).querySelector('input'), 'the editor'); i.value = text; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true })); };
        await edit(1, 'Bolt'); await until(() => cell(1).textContent === 'Bolt', 'the value to show at once');
        t.eq(cell(1).getAttribute('aria-busy'), 'true', 'the cell is busy while the host has not answered'); t.eq(el.rows[0].name, 'Bolt');
        jobs[0].no(new Error('Name taken'));
        await until(() => cell(1).textContent.includes('Name taken'), 'the rejection message');
        t.eq(el.rows[0].name, 'Widget', 'a rejection puts the previous value back'); t.ok(!cell(1).hasAttribute('aria-busy'), 'no longer busy');
        t.eq(cell(1).getAttribute('aria-invalid'), 'true'); t.ok(cell(1).getAttribute('aria-describedby') && cell(1).querySelector('[data-cell-error]').id === cell(1).getAttribute('aria-describedby'), 'the message is tied to the cell');
        t.ok(/not saved, Name taken/.test(live()), `announced: ${live()}`);
        cell(1).focus(); cell(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true, cancelable: true }));
        await until(() => /Nothing to undo/.test(live()), 'a rejected edit is not in the undo history');
        await edit(2, 'Nut'); await until(() => cell(2).getAttribute('aria-busy') === 'true', 'busy'); jobs[1].ok();
        await until(() => !cell(2).hasAttribute('aria-busy'), 'the busy state to clear'); t.eq(el.rows[1].name, 'Nut', 'a fulfilment keeps the value'); t.ok(!cell(2).hasAttribute('aria-invalid')); t.ok(/saved/.test(live()), live());
    }],
    ['table (editable): a date editor is a native date input holding the ISO value, checks min and max, and a pasted non-date is flagged', async t => {
        const el = await t.mount(`<pk-table editable label="Orders" columns='[{"key":"po","label":"PO"},{"key":"due","label":"Due","type":"date","editor":"date","min":"2026-01-01","max":"2026-12-31","required":true}]' rows='[{"id":1,"po":"A","due":"2026-03-05"},{"id":2,"po":"B","due":"2026-04-01"}]'></pk-table>`);
        await t.settle();
        const cell = (r, k = 'due') => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`), key = (n, k, mods = {}) => n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...mods }));
        const seen = []; el.addEventListener('pk-cell-edit', e => seen.push(`${e.detail.value}`));
        await until(() => cell(1, 'po')?.tabIndex === 0, 'the grid');
        cell(1).focus(); key(cell(1), 'Enter'); const i = await until(() => cell(1).querySelector('input'), 'the editor');
        t.eq(i.type, 'date'); t.eq(i.value, '2026-03-05', 'the editor holds the ISO value'); t.eq(i.min, '2026-01-01'); t.eq(i.max, '2026-12-31'); t.eq(i.getAttribute('aria-label'), 'Due, row 1');
        i.value = '2027-01-01'; key(i, 'Enter'); await until(() => cell(1).querySelector('[data-cell-error]'), 'the message');
        t.eq(cell(1).querySelector('[data-cell-error]').textContent, 'On or before 2026-12-31'); t.ok(cell(1).querySelector('input'), 'the editor stays open'); t.eq(seen.length, 0, 'no event for a value out of range');
        const j = cell(1).querySelector('input'); j.value = '2025-12-31'; key(j, 'Enter'); await until(() => /On or after 2026-01-01/.test(cell(1).textContent), 'the minimum message');
        const k = cell(1).querySelector('input'); k.value = '2026-06-30'; key(k, 'Enter'); await until(() => el.rows[0].due === '2026-06-30', 'the commit');
        t.eq(seen.join(), '2026-06-30', 'the event carries the ISO string'); t.eq(cell(1).textContent, '2026-06-30');
        cell(2).focus(); key(cell(2), '7'); const q = await until(() => cell(2).querySelector('input'), 'typing opens the editor'); t.eq(q.value, '2026-04-01', 'typing a character opens a date editor on its value instead of replacing it');
        key(q, 'Escape'); await until(() => !cell(2).querySelector('input'), 'closed');
        cell(2).focus(); cell(2).dispatchEvent(Object.assign(new Event('paste', { bubbles: true, composed: true, cancelable: true }), { clipboardData: { getData: () => 'next week' } }));
        await until(() => cell(2).getAttribute('aria-invalid') === 'true', 'flagged'); t.eq(el.rows[1].due, '2026-04-01', 'a non-date was not committed');
    }],
    ['table (editable): an error on a cell that is not being edited stays readable in a narrow column: one short line below the cell, hidden until the cell is focused, and no column reflows', async t => {
        const host = t.stage(`<div><pk-table editable label="Stock" columns='[{"key":"name","label":"Product","editor":"text"},{"key":"qty","label":"Qty","type":"number","editor":"number","min":0}]' rows='[{"id":1,"name":"Widget number one","qty":4},{"id":2,"name":"Gadget number two","qty":9}]'></pk-table></div>`);
        host.firstElementChild.style.inlineSize = '240px'; await t.load(host);
        const el = host.querySelector('pk-table'); await t.settle();
        const cell = (r, k) => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`), widths = () => [...el.shadowRoot.querySelectorAll('thead th')].map(h => Math.round(h.getBoundingClientRect().width)).join();
        await until(() => cell(1, 'name')?.tabIndex === 0, 'the grid'); const before = widths();
        cell(1, 'name').focus(); cell(1, 'qty').click(); await t.settle();
        cell(1, 'qty').dispatchEvent(Object.assign(new Event('paste', { bubbles: true, composed: true, cancelable: true }), { clipboardData: { getData: () => '-3' } }));
        const m = await until(() => cell(1, 'qty').querySelector('[data-cell-error]'), 'the message'); await t.settle();
        t.eq(widths(), before, 'the message reflowed a column');
        cell(1, 'qty').focus(); await t.settle(); const r = m.getBoundingClientRect(), frame = el.part('scroll').getBoundingClientRect();
        t.ok(r.width > 55 && r.height < 32, `the message is ${Math.round(r.width)}x${Math.round(r.height)}: wrapped in a narrow column`);
        t.ok(r.left >= frame.left - 1 && r.right <= frame.right + 1, 'the message is inside the frame');
    }],
    // Issue 1474: an editable table windows at 500+ rows. The helpers below build a 1000+ row grid and read it by id, never by position in the DOM.
    ...(() => {
        const COLS = '[{"key":"sku","label":"SKU","editor":"text"},{"key":"name","label":"Name","editor":"text","sortable":true},{"key":"qty","label":"Qty","type":"number","editor":"number","min":0}]';
        const rowsOf = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i + 1, sku: `S${i + 1}`, name: `Item ${i + 1}`, qty: i % 50 })));
        const grid = async (t, n = 5000, width = 1200) => {
            const box = await t.mount(`<div style="width:${width}px"><pk-table editable sticky-header max-height="20rem" label="Stock" columns='${COLS}' rows='${rowsOf(n)}'></pk-table></div>`);
            const el = box.querySelector('pk-table'); await until(() => el.shadowRoot?.querySelector('td[tabindex="0"]') && el.$e, 'the editable grid'); await t.settle();
            const sr = el.shadowRoot, frame = el.part('scroll');
            const g = {
                el, sr, frame,
                drawn: () => [...sr.querySelectorAll('tbody tr[data-pk-context]')],
                cell: (id, k) => sr.querySelector(`tr[data-pk-context="${id}"] td[data-key=${k}]`),
                active: () => sr.querySelector('td[data-key][tabindex="0"]')?.closest('tr').dataset.pkContext,
                press: (k, mods = {}, n = sr.activeElement) => n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...mods })),
                rowH: () => g.drawn()[0].getBoundingClientRect().height,
                headH: () => sr.querySelector('thead').getBoundingClientRect().height,
                visible: c => { const r = c.getBoundingClientRect(), f = frame.getBoundingClientRect(); return r.top >= f.top + g.headH() - 1 && r.bottom <= f.bottom + 1; },
                scroll: async y => { frame.scrollTop = y; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await t.settle(); },
                pick: async (id, k = 'name') => { g.cell(id, k).click(); await t.settle(); await until(() => g.active() === String(id) && sr.activeElement === g.cell(id, k), `cell ${id}:${k} active and focused`); },
            };
            return g;
        };
        const paste = (n, text) => n.dispatchEvent(Object.assign(new Event('paste', { bubbles: true, composed: true, cancelable: true }), { clipboardData: { getData: () => text } }));
        return [
            ['table (editable, 5000 rows): only a window of rows is drawn, aria-rowcount is the full count and each drawn row has its aria-rowindex (#1474)', async t => {
                const g = await grid(t);
                t.ok(g.drawn().length < 60, `drawn ${g.drawn().length} rows`); t.eq(g.el.$virtual, true, 'the editable table windows');
                t.eq(g.sr.querySelector('table').getAttribute('aria-rowcount'), '5001', 'rowcount is the view length plus the header');
                t.eq(g.sr.querySelector('thead tr').getAttribute('aria-rowindex'), '1');
                await g.scroll(3000 * g.rowH());
                const first = g.drawn().find(r => r.dataset.pkContext !== '1');
                t.ok(Math.abs(Number(first.dataset.pkContext) - 3000) < 40, 'the window followed the scroll');
                t.eq(first.getAttribute('aria-rowindex'), String(Number(first.dataset.pkContext) + 1), 'aria-rowindex is the position in the whole view, header first');
                t.ok(g.sr.querySelector('tr[data-spacer]').getAttribute('aria-hidden') === 'true', 'spacer rows are hidden from assistive technology');
            }],
            ['table (editable, 5000 rows): an open editor keeps its row, draft and focus while the table is scrolled far away and back (#1474)', async t => {
                const g = await grid(t);
                await g.pick(5); g.press('Enter'); await until(() => g.cell(5, 'name').querySelector('input'), 'the editor');
                const input = g.cell(5, 'name').querySelector('input'); input.value = 'Draft'; input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                await g.scroll(5000);
                const e = g.cell(5, 'name')?.querySelector('input'); t.ok(e, 'the edited row is still in the DOM while scrolled away'); t.eq(e.value, 'Draft', 'the draft survived the re-render');
                await until(() => g.sr.activeElement === g.cell(5, 'name')?.querySelector('input'), 'focus stays in the editor'); t.ok(g.drawn().length < 70, 'still windowed');
                await g.scroll(0); t.ok(g.cell(5, 'name').querySelector('input'), 'the editor is still open after scrolling back');
            }],
            ['table (editable, 5000 rows): ArrowDown past the window edge, PageDown and Ctrl+End/Home move by row id and keep the cell visible and focused (#1474)', async t => {
                const g = await grid(t);
                const last = g.drawn().at(-1).dataset.pkContext; await g.pick(last);
                g.press('ArrowDown'); await until(() => g.active() === String(Number(last) + 1) && g.sr.activeElement === g.cell(Number(last) + 1, 'name'), 'ArrowDown reached the next undrawn row');
                t.ok(g.visible(g.cell(Number(last) + 1, 'name')), 'the cell is inside the scroll frame, below the sticky header');
                const vis = Math.floor((g.frame.clientHeight - g.headH()) / g.rowH()), from = Number(g.active());
                g.press('PageDown'); await until(() => Number(g.active()) === from + vis, `PageDown moved by ${vis} rows`); t.ok(g.visible(g.sr.activeElement), 'the PageDown target is visible');
                g.press('PageUp'); await until(() => Number(g.active()) === from, 'PageUp moved back');
                g.press('End', { ctrlKey: true }); await until(() => g.active() === '5000' && g.sr.activeElement === g.cell(5000, 'name'), 'Ctrl+End reached the last row'); t.ok(g.visible(g.sr.activeElement));
                g.press('Enter'); const i = await until(() => g.cell(5000, 'name').querySelector('input'), 'the last row opens'); i.value = 'Last'; g.press('Enter', {}, i);
                await until(() => g.el.rows[4999].name === 'Last', 'the last row committed');
                g.press('Home', { ctrlKey: true }); await until(() => g.active() === '1' && g.sr.activeElement === g.cell(1, 'name'), 'Ctrl+Home reached the first row');
            }],
            ['table (editable, 5000 rows): Enter commits and moves down across the window edge, and the new cell is focused and visible (#1474)', async t => {
                const g = await grid(t);
                const last = Number(g.drawn().at(-1).dataset.pkContext); await g.pick(last); g.press('Enter');
                const i = await until(() => g.cell(last, 'name').querySelector('input'), 'the editor'); i.value = 'Edge'; g.press('Enter', {}, i);
                await until(() => g.el.rows[last - 1].name === 'Edge' && g.active() === String(last + 1) && g.sr.activeElement === g.cell(last + 1, 'name'), 'committed and moved down');
                t.ok(g.visible(g.cell(last + 1, 'name')), 'the next cell is visible');
            }],
            ['table (editable, 5000 rows): the sticky header stays at the top of the scroll frame after scrolling 10000px (#1474)', async t => {
                const g = await grid(t); await g.scroll(10000);
                t.ok(g.frame.scrollTop >= 9000, 'it scrolled');
                t.ok(Math.abs(g.sr.querySelector('thead th').getBoundingClientRect().top - g.frame.getBoundingClientRect().top) < 2, 'the header is flush with the frame top');
            }],
            ['table (editable, 5000 rows): a 2000x3 paste commits through pk-cell-edit for rows never drawn, announces the count, and one Ctrl+Z reverts every cell (#1474)', async t => {
                const g = await grid(t); g.cell(1, 'sku').focus(); let n = 0; const srcs = new Set(); g.el.addEventListener('pk-cell-edit', e => { n++; srcs.add(e.detail.source); });
                paste(g.sr.activeElement, Array.from({ length: 2000 }, (_, i) => `P${i}\tQ${i}\t${1000 + i}`).join('\n'));
                await until(() => g.el.rows[1999].qty === 2999, 'the paste to commit', 15000);
                t.eq(n, 6000, 'one pk-cell-edit per cell'); t.eq([...srcs].join(), 'paste'); t.eq(g.el.rows[1999].name, 'Q1999', 'a row that was never drawn took its value');
                await until(() => /^6000 cells updated/.test(g.sr.querySelector('[role=status].sr')?.textContent ?? ''), 'the live region');
                g.press('z', { ctrlKey: true }, g.sr.activeElement); await until(() => g.el.rows[1999].name === 'Item 2000' && g.el.rows[0].sku === 'S1', 'one undo reverted the whole paste', 15000);
                t.eq(g.el.rows[1500].qty, 1500 % 50, 'including an undrawn row');
            }],
            ['table (editable, 5000 rows): undoing an edit on an off-screen row scrolls it into view and focuses it (#1474)', async t => {
                const g = await grid(t); await g.pick(1); g.press('End', { ctrlKey: true }); await until(() => g.active() === '5000', 'last row');
                g.press('Enter'); const i = await until(() => g.cell(5000, 'name')?.querySelector('input'), 'editor'); i.value = 'Far'; g.press('Enter', {}, i); await until(() => g.el.rows[4999].name === 'Far', 'committed');
                g.press('Home', { ctrlKey: true }); await until(() => g.active() === '1' && !g.cell(5000, 'name'), 'back at the top, the far row no longer drawn');
                g.press('z', { ctrlKey: true }, g.sr.activeElement);
                await until(() => g.el.rows[4999].name === 'Item 5000' && g.active() === '5000' && g.sr.activeElement === g.cell(5000, 'name'), 'undo focused the far row'); t.ok(g.visible(g.cell(5000, 'name')), 'and it is in view');
            }],
            ['table (editable, 5000 rows): sort and filter keep the active row by id, and a cellError for an undrawn row shows once it is drawn (#1474)', async t => {
                const g = await grid(t); await g.pick(7);
                g.el.sort = 'name'; g.el.sortDir = 'desc'; await t.settle(); await until(() => g.cell(7, 'name'), 'row 7 stays drawn after the sort'); t.eq(g.active(), '7', 'the active row is still 7');
                g.el.sort = ''; await t.settle();
                g.el.cellErrors = { '4000:name': 'Bad name' }; await t.settle(); t.ok(!g.cell(4000, 'name'), 'row 4000 is not drawn');
                await g.scroll(3990 * g.rowH()); await until(() => g.cell(4000, 'name'), 'row 4000 drawn');
                t.eq(g.cell(4000, 'name').getAttribute('aria-invalid'), 'true', 'its error shows'); t.eq(g.cell(4000, 'name').textContent.includes('Bad name'), true);
                g.el.filters = { name: 'Item 1' }; await until(() => g.el.view.length === 1111, 'the filter narrowed the view'); await t.settle(); t.ok(g.drawn().length < 70, 'still windowed');
                t.eq(g.sr.querySelector('table').getAttribute('aria-rowcount'), String(g.el.view.length + 1), 'aria-rowcount follows the filtered view');
            }],
            ['table (editable, 1200 rows): opening an editor does not change the row height or the scroll height, at 375 and 1200 wide (#1474)', async t => {
                for (const w of [375, 1200]) {
                    const g = await grid(t, 1200, w); await g.scroll(300); const id = g.drawn()[12].dataset.pkContext; await g.pick(id);
                    const before = { h: g.cell(id, 'name').closest('tr').getBoundingClientRect().height, sh: g.frame.scrollHeight };
                    g.press('Enter'); await until(() => g.cell(id, 'name').querySelector('input'), 'editor'); await t.settle();
                    t.ok(Math.abs(g.cell(id, 'name').closest('tr').getBoundingClientRect().height - before.h) < 1.5, `row height unchanged at ${w}`); t.ok(Math.abs(g.frame.scrollHeight - before.sh) < 2, `scroll height unchanged at ${w}`);
                }
            }],
            ['table (editable, 5000 rows): 200 scroll frames never draw more than a window of rows (#1474)', async t => {
                const g = await grid(t); let most = 0; const max = g.frame.scrollHeight - g.frame.clientHeight;
                for (let i = 0; i < 200; i++) { g.frame.scrollTop = (i * 7919) % max; await new Promise(r => requestAnimationFrame(r)); most = Math.max(most, g.drawn().length); }
                await t.settle(); most = Math.max(most, g.drawn().length); t.ok(most < 70, `at most ${most} rows drawn`);
            }],
            // Issue 331: multi-cell selection (Shift+arrows / Shift+click), fill-down (Ctrl+D) and copy as TSV, all by row id so they reach rows that are not drawn.
            ['table (editable, 1200 rows): Shift+arrows and Shift+click extend a rectangular selection across rows that are not drawn; selected cells are aria-selected and a plain move collapses it', async t => {
                const g = await grid(t, 1200); await g.pick(3, 'sku');
                g.press('ArrowDown', { shiftKey: true }); await t.settle(); g.press('ArrowRight', { shiftKey: true }, g.sr.activeElement);
                await until(() => g.cell(4, 'name')?.getAttribute('aria-selected') === 'true' && g.sr.activeElement === g.cell(4, 'name'), 'a 2x2 block selected, focus on its moving corner');
                t.eq(g.cell(3, 'sku').getAttribute('aria-selected'), 'true', 'the anchor stays selected'); t.eq(g.cell(3, 'qty').getAttribute('aria-selected'), 'false', 'outside the block');
                t.eq(g.sr.querySelector('table').getAttribute('aria-multiselectable'), 'true', 'the grid says it holds a range');
                g.press('PageDown', { shiftKey: true }, g.sr.activeElement); await until(() => Number(g.active()) > 8, 'Shift+PageDown moved the corner');
                await g.scroll(0); t.eq(g.cell(10, 'name').getAttribute('aria-selected'), 'true', 'rows between were selected though never focused'); t.ok(g.drawn().length < 70, 'still windowed');
                g.press('ArrowDown', {}, g.sr.activeElement); await until(() => g.cell(10, 'name')?.getAttribute('aria-selected') === 'false', 'a plain move collapsed the range');
                await g.pick(5, 'sku'); g.cell(8, 'name').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, composed: true, cancelable: true }));
                await until(() => g.cell(8, 'name').getAttribute('aria-selected') === 'true' && g.cell(6, 'sku').getAttribute('aria-selected') === 'true' && g.active() === '8', 'Shift+click selected the block from the active cell');
                t.ok(!g.cell(8, 'name').querySelector('input'), 'a shift-click does not open an editor');
            }],
            ['table (editable, 1200 rows): Ctrl+D fills the top cell of the selection down through pk-cell-edit (source fill) and one Ctrl+Z reverts every cell including undrawn rows', async t => {
                const g = await grid(t, 1200); await g.pick(1, 'name'); const seen = []; g.el.addEventListener('pk-cell-edit', e => seen.push(`${e.detail.id}:${e.detail.key}:${e.detail.source}`));
                g.press('ArrowRight', { shiftKey: true }); await t.settle(); g.press('End', { ctrlKey: true, shiftKey: true }, g.sr.activeElement);
                await until(() => g.active() === '1200', 'the selection reaches the last row');
                g.press('d', { ctrlKey: true }, g.sr.activeElement);
                await until(() => g.el.rows[1199].name === 'Item 1' && g.el.rows[1199].qty === 0, 'fill-down committed in a row that was never drawn', 15000);
                t.eq(seen.length, 1199 + 1176, 'one pk-cell-edit per changed cell (23 rows already hold qty 0)'); t.ok(seen.every(s => s.endsWith(':fill')), 'source is fill');
                t.eq(g.el.rows[600].name, 'Item 1'); t.eq(g.el.rows[600].qty, 0); t.eq(g.el.rows[600].sku, 'S601', 'the column outside the selection is untouched');
                await until(() => /cells filled/.test(g.sr.querySelector('[role=status].sr')?.textContent ?? ''), 'the live region');
                g.press('z', { ctrlKey: true }, g.sr.activeElement);
                await until(() => g.el.rows[1199].name === 'Item 1200' && g.el.rows[600].qty === 600 % 50 && g.el.rows[1].name === 'Item 2', 'one undo restored every cell', 15000);
            }],
            ['table (editable): fill-down honours a cancelled pk-cell-edit and a read-only column, and a single cell has nothing to fill', async t => {
                const g = await grid(t, 30); await g.pick(1, 'name'); g.press('ArrowDown', { shiftKey: true }); await t.settle(); g.press('ArrowDown', { shiftKey: true }, g.sr.activeElement);
                await until(() => g.active() === '3', 'a 3-row block');
                g.el.addEventListener('pk-cell-edit', e => { if (String(e.detail.id) === '2') e.preventDefault(); });
                g.press('d', { ctrlKey: true }, g.sr.activeElement); await until(() => g.el.rows[2].name === 'Item 1', 'filled');
                t.eq(g.el.rows[1].name, 'Item 2', 'the cancelled cell is unchanged');
                await g.pick(10, 'name'); const before = JSON.stringify(g.el.rows); g.press('d', { ctrlKey: true }, g.sr.activeElement); await t.settle(); t.eq(JSON.stringify(g.el.rows), before, 'a single cell has nothing to fill');
            }],
            ['table (editable, 1200 rows): copy puts the selection on the clipboard as tab-separated text, rows never drawn included', async t => {
                const g = await grid(t, 1200); await g.pick(2, 'name'); g.press('ArrowRight', { shiftKey: true }); await t.settle(); g.press('End', { ctrlKey: true, shiftKey: true }, g.sr.activeElement);
                await until(() => g.active() === '1200', 'selection to the end');
                let out = ''; const copy = () => { const ev = Object.assign(new Event('copy', { bubbles: true, composed: true, cancelable: true }), { clipboardData: { setData: (m, v) => { out = v; } } }); g.sr.activeElement.dispatchEvent(ev); return ev; };
                t.ok(copy().defaultPrevented, 'the table took the copy');
                const lines = out.split('\n'); t.eq(lines.length, 1199); t.eq(lines[0], 'Item 2\t1'); t.eq(lines.at(-1), 'Item 1200\t' + (1199 % 50));
                await g.scroll(0); await g.pick(4, 'name'); copy(); t.eq(out, 'Item 4', 'a single cell copies its value');
            }],
            ['table (editable, 1200 rows): a paste saved with detail.wait is busy while pending, and a rejection for a row never drawn reverts it, shows its message when drawn, and announces once (#331)', async t => {
                const g = await grid(t, 1200); await g.pick(1, 'name'); const jobs = [];
                g.el.addEventListener('pk-cell-edit', e => e.detail.wait(new Promise((ok, no) => jobs.push({ ok, no, id: e.detail.id }))));
                paste(g.sr.activeElement, Array.from({ length: 1000 }, (_, i) => `New ${i + 1}`).join('\n'));
                await until(() => jobs.length === 1000, 'every cell offered through pk-cell-edit', 15000);
                await until(() => g.cell(1, 'name')?.getAttribute('aria-busy') === 'true', 'the drawn cell is busy');
                for (const j of jobs) j.id === '900' ? j.no(new Error('Locked')) : j.ok();
                await until(() => g.el.rows[0].name === 'New 1' && g.el.rows[899].name === 'Item 900', 'the rejected row reverted and the others kept their value', 15000);
                t.eq(g.el.rows[998].name, 'New 999'); await until(() => !g.cell(1, 'name').hasAttribute('aria-busy'), 'busy cleared');
                await g.scroll(895 * g.rowH()); const c = await until(() => g.cell(900, 'name'), 'row 900 drawn');
                t.eq(c.getAttribute('aria-invalid'), 'true'); t.ok(c.textContent.includes('Locked'), 'the message shows once the row is drawn');
                t.ok(/not saved, Locked/.test(g.sr.querySelector('[role=status].sr').textContent), g.sr.querySelector('[role=status].sr').textContent);
            }],
            ['table (editable, 1200 rows): a date column edits on a row reached by scrolling, committing the ISO value, and the editor does not change the row height (#331)', async t => {
                const cols = '[{"key":"sku","label":"SKU","editor":"text"},{"key":"due","label":"Due","type":"date","editor":"date","min":"2026-01-01"}]', data = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, sku: `S${i + 1}`, due: '2026-02-03' })));
                const box = await t.mount(`<div style="width:375px"><pk-table editable sticky-header max-height="20rem" label="Due" columns='${cols}' rows='${data}'></pk-table></div>`), el = box.querySelector('pk-table');
                await until(() => el.shadowRoot?.querySelector('td[tabindex="0"]') && el.$e, 'the grid'); await t.settle(); const sr = el.shadowRoot, frame = el.part('scroll');
                frame.scrollTop = 600 * 33; await t.settle(); const ids = [...sr.querySelectorAll('tbody tr[data-pk-context]')].map(r => r.dataset.pkContext), id = ids[Math.floor(ids.length / 2)];
                const c = () => sr.querySelector(`tr[data-pk-context="${id}"] td[data-key=due]`), h0 = c().closest('tr').getBoundingClientRect().height; c().click(); await t.settle(); c().click();
                const i = await until(() => c().querySelector('input[type=date]'), 'the date editor'); t.eq(i.value, '2026-02-03'); t.ok(Math.abs(c().closest('tr').getBoundingClientRect().height - h0) < 1.5, 'the editor changed the row height');
                i.value = '2026-09-09'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
                await until(() => el.rows[Number(id) - 1].due === '2026-09-09', 'the commit');
            }],
        ];
    })(),
    ['table (editable): arrow keys move the active cell, Enter commits and moves down, Tab moves right within the row and leaves the grid at its last cell, and typing a character starts editing with it', async t => {
        const el = await t.mount(`<pk-table editable label="Stock" columns='[{"key":"name","label":"Name","editor":"text"},{"key":"qty","label":"Qty","type":"number","editor":"number"}]' rows='[{"id":1,"name":"Widget","qty":4},{"id":2,"name":"Gadget","qty":9}]'></pk-table>`);
        await t.settle();
        // The render re-draws the cells on every change (a fresh td instance each time), so a moved-to cell is found again by selector, never held onto.
        const cell = (r, k) => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`);
        const active = () => el.shadowRoot.querySelector('td[data-key][tabindex="0"]');
        const press = (n, k, mods = {}) => n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...mods }));
        const isActive = (r, k) => cell(r, k)?.getAttribute('aria-selected') === 'true';
        await until(() => cell(1, 'name')?.tabIndex === 0, 'the grid');
        cell(1, 'name').focus();
        press(active(), 'ArrowRight');
        await until(() => isActive(1, 'qty'), 'ArrowRight did not move the active cell to the next column');
        press(active(), 'ArrowDown');
        await until(() => isActive(2, 'qty'), 'ArrowDown did not move the active cell to the next row');
        press(active(), 'ArrowLeft');
        await until(() => isActive(2, 'name'), 'ArrowLeft did not move the active cell back a column');
        press(active(), 'ArrowUp');
        await until(() => isActive(1, 'name'), 'ArrowUp did not move the active cell back a row');
        // Enter opens the cell, commits the draft, and moves the active cell down one row.
        press(active(), 'Enter');
        const input = await until(() => cell(1, 'name').querySelector('input'), 'the editor');
        input.value = 'Widget XL'; press(input, 'Enter');
        await until(() => cell(1, 'name').textContent === 'Widget XL', 'the edit to show');
        await until(() => isActive(2, 'name'), 'Enter did not move the active cell down a row after committing');
        // Tab moves right within the row without opening an editor; at the row's last cell it is left alone so focus leaves the grid.
        press(active(), 'Tab');
        await until(() => isActive(2, 'qty'), 'Tab did not move the active cell right within the row');
        t.ok(!cell(2, 'qty').hasAttribute('data-editing'), 'a non-editing Tab opened an editor');
        const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true });
        cell(2, 'qty').dispatchEvent(tabEvent);
        t.ok(!tabEvent.defaultPrevented, 'Tab at the last cell of the row was intercepted instead of leaving the grid');
        // Typing a printable character on the active (non-editing) cell starts editing it, replacing its content.
        press(active(), '7');
        const q = await until(() => cell(2, 'qty').querySelector('input'), 'the editor opened by typing');
        t.eq(q.value, '7', 'typing a character did not replace the cell content with it');
    }],
    // Issue 765: the built-in `switch` editor was removed (a table renders no other pk-* element); a switch is a pk-switch the host slots into a cell, which the table treats as read-only and host-owned.
    ['table (editable): a host-slotted pk-switch column is read-only to the table, adds no tab stop, toggles from the keyboard and reports its change to the host, and an edited cell with a validation message keeps every column width on a narrow frame', async t => {
        const host = t.stage(`<div><pk-table editable label="Stock" columns='[{"key":"name","label":"Product","editor":"text"},{"key":"qty","label":"Qty","type":"number","editor":"number"},{"key":"on","label":"Listed"}]' rows='[{"id":1,"name":"Widget number one","qty":4},{"id":2,"name":"Gadget number two","qty":9}]'><pk-switch slot="cell-1-on" tabindex="-1" checked><span class="u-sr-only">Listed, row 1</span></pk-switch><span slot="cell-2-on" class="u-contents"><pk-switch tabindex="-1"><span class="u-sr-only">Listed, row 2</span></pk-switch></span></pk-table></div>`);
        host.firstElementChild.style.inlineSize = '320px';
        await t.load(host);
        const el = host.querySelector('pk-table'); await t.settle();
        const cell = (r, k) => el.shadowRoot.querySelector(`tbody tr:nth-child(${r}) td[data-key=${k}]`);
        const widths = () => [...el.shadowRoot.querySelectorAll('thead th')].map(h => Math.round(h.getBoundingClientRect().width));
        await until(() => cell(1, 'on')?.querySelector('slot'), 'the slotted cell');
        const sw = el.querySelector('pk-switch'), changes = [], press = (n, k) => n.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));
        el.addEventListener('pk-change', e => changes.push(e.detail.checked));
        t.eq(cell(1, 'on').getAttribute('aria-readonly'), 'true', 'a slotted cell is not read-only to the table');
        t.ok(!el.shadowRoot.querySelector('pk-switch'), 'the table drew a pk-switch itself');
        t.ok(sw.checked === true, 'the slotted switch lost its own state');
        // Space on the cell moves focus to the control (also through a wrapper element, as the Blazor cell template renders one); Space again toggles it and the event reaches the host.
        cell(1, 'on').focus(); press(cell(1, 'on'), ' ');
        await until(() => document.activeElement === sw, 'focus on the slotted switch');
        sw.shadowRoot.querySelector('button').click();
        t.eq(changes.join(), 'false', 'the slotted switch change did not reach the host');
        cell(2, 'on').focus(); press(cell(2, 'on'), ' ');
        await until(() => document.activeElement === el.querySelector('span pk-switch'), 'focus on the switch inside the wrapper');
        // Escape in the control hands focus back to the cell.
        sw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
        t.ok(el.shadowRoot.activeElement === cell(1, 'on') || cell(1, 'on').matches(':focus'), 'Escape in the slotted control did not return focus to the cell');
        const before = widths();
        cell(2, 'qty').focus(); cell(2, 'qty').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
        const q = await until(() => cell(2, 'qty').querySelector('input'), 'the editor');
        t.eq(widths().join(), before.join(), 'opening the editor changed a column width');
        q.value = 'lots'; q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
        await until(() => cell(2, 'qty').querySelector('[data-cell-error]'), 'the message');
        t.eq(widths().join(), before.join(), 'the validation message changed a column width');
    }],
    ['frame: the default sandbox is allow-scripts alone, a preset caps the width to the named breakpoint, and the framed document loads', async t => {
        const { breakpoint } = await import('../../js/breakpoints.js');
        const host = t.stage(`<pk-frame title="Preview" html="&lt;!doctype html&gt;&lt;body&gt;hi&lt;/body&gt;"></pk-frame>`);
        await t.load(host);
        const el = host.querySelector('pk-frame');
        const frame = () => el.shadowRoot.querySelector('[part="frame"]');
        const loaded = new Promise(r => el.addEventListener('pk-frame-load', r, { once: true }));
        await loaded;
        t.eq(frame().getAttribute('sandbox'), 'allow-scripts', 'the default sandbox never carries allow-same-origin');
        t.eq(frame().hasAttribute('src'), false, 'an inline document sets srcdoc, not src');
        t.ok(frame().srcdoc.includes('hi'), 'the html prop became the frame srcdoc');
        // sandbox="allow-scripts" alone (no allow-same-origin) makes the framed document an opaque origin: contentDocument is not
        // reachable from here, by design - which is what the resize/theme contract (postMessage) is for.
        t.eq(frame().contentDocument, null, 'the sandboxed document is not readable from the host page');
        for (const [preset, name] of [['phone', 'phone'], ['tablet', 'tablet'], ['desktop', 'wide']]) {
            el.setAttribute('preset', preset); await t.settle();
            t.eq(frame().style.maxInlineSize, `${breakpoint(name)}px`, `preset=${preset} caps the width at the ${name} breakpoint`);
        }
        el.setAttribute('preset', 'full'); await t.settle();
        t.eq(frame().style.maxInlineSize, '', 'preset=full has no width cap');
        el.setAttribute('sandbox', 'allow-scripts allow-same-origin'); await t.settle();
        t.eq(frame().getAttribute('sandbox'), 'allow-scripts', 'allow-same-origin is dropped without allow-same-origin opted in');
        el.setAttribute('allow-same-origin', ''); await t.settle();
        t.eq(frame().getAttribute('sandbox'), 'allow-scripts allow-same-origin', 'allow-same-origin opts the combination back in');
    }],

    ['contrast (dark, #810): a stat label on its tile and a table header on the flyout surface clear 4.5:1', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '800px'; f.style.height = '300px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc('<pk-stat id="s" label="Open POs" value="12"></pk-stat><pk-table id="t" label="Rows" columns=\'[{"key":"a","label":"File"}]\' rows=\'[{"id":1,"a":"x"}]\'></pk-table>', { theme: 'dark' }); await loaded; await until(() => f.contentDocument.body?.firstElementChild, 'the frame');
        const w = f.contentWindow, doc = f.contentDocument;
        await until(() => w.customElements.get('pk-stat') && w.customElements.get('pk-table') && doc.getElementById('s')?.shadowRoot?.querySelector('[part=label]') && doc.getElementById('t')?.shadowRoot?.querySelector('th'), 'the stat and the table');
        const rgb = c => (/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(c) || []).slice(1, 4).map(Number);
        const lum = ([r, g, b]) => { const k = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b); };
        const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
        const cs = (el, p) => w.getComputedStyle(el)[p];
        const tile = doc.getElementById('s').shadowRoot.querySelector('[part=tile]'), label = doc.getElementById('s').shadowRoot.querySelector('[part=label]');
        const r1 = ratio(rgb(cs(label, 'color')), rgb(cs(tile, 'backgroundColor')));
        t.ok(r1 >= 4.5, `the stat label is ${r1.toFixed(2)}:1 on its tile`);
        const th = doc.getElementById('t').shadowRoot.querySelector('th'), probe = doc.createElement('div');
        probe.style.backgroundColor = 'var(--color-flyout)'; doc.body.append(probe);
        const r2 = ratio(rgb(cs(th, 'color')), rgb(cs(probe, 'backgroundColor')));
        t.ok(r2 >= 4.5, `a table header is ${r2.toFixed(2)}:1 on the flyout surface`);
    }],

    ['contrast (#1135): an inline code in muted pk-text clears 4.5:1 on its own chip in light and dark', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const rgb = c => (/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(c) || []).slice(1, 4).map(Number);
        const lum = ([r, g, b]) => { const k = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b); };
        for (const theme of ['light', 'dark']) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = '800px'; f.style.height = '120px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
            host.append(f); f.srcdoc = sampleDoc('<pk-card><pk-text tone="muted">Set <code id="c">data-theme</code> on the root</pk-text></pk-card>', { theme }); await loaded; await until(() => f.contentDocument.body?.firstElementChild, 'the frame');
            const w = f.contentWindow, doc = f.contentDocument;
            await until(() => w.customElements.get('pk-text') && w.customElements.get('pk-card'), 'the elements'); await wait(200);
            const cs = w.getComputedStyle(doc.getElementById('c')), [hi, lo] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))].sort((x, y) => y - x);
            const ratio = (hi + 0.05) / (lo + 0.05);
            t.ok(ratio >= 4.5, theme + ': the code is ' + ratio.toFixed(2) + ':1 on its chip');
        }
    }],

    ['code-block (#1135, 375px): the focusable body of a one-line block keeps the touch target on a phone', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '200px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc('<pk-code-block label="Markup">&lt;pk-button&gt;&lt;/pk-button&gt;</pk-code-block>'); await loaded; await until(() => f.contentDocument.body?.firstElementChild, 'the frame');
        const w = f.contentWindow, doc = f.contentDocument;
        await until(() => w.customElements.get('pk-code-block') && doc.querySelector('pk-code-block')?.shadowRoot?.querySelector('[part=body]'), 'the code block'); await wait(300);
        t.eq(w.innerWidth, 375);
        const touch = parseFloat(w.getComputedStyle(doc.documentElement).getPropertyValue('--touch-target')) || 44;
        const r = doc.querySelector('pk-code-block').shadowRoot.querySelector('[part=body]').getBoundingClientRect();
        t.ok(r.height >= touch - 0.5, 'the body is ' + Math.round(r.height) + 'px tall, at least ' + touch + 'px');
    }],

    ['step (375px): a clickable step keeps the touch target in both directions on a phone', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '200px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true }));
        host.append(f); f.srcdoc = sampleDoc('<pk-stepper clickable><pk-step>One</pk-step><pk-step>Two</pk-step><pk-step>Three</pk-step><pk-step>Four</pk-step><pk-step>Five</pk-step><pk-step>Six</pk-step><pk-step>Seven</pk-step></pk-stepper>'); await loaded; await until(() => f.contentDocument.body?.firstElementChild, 'the frame');
        const w = f.contentWindow, doc = f.contentDocument;
        await until(() => w.customElements.get('pk-step') && doc.querySelector('pk-step')?.shadowRoot?.querySelector('[part=marker]'), 'the steps'); await wait(300);
        t.eq(w.innerWidth, 375);
        const touch = parseFloat(w.getComputedStyle(doc.documentElement).getPropertyValue('--touch-target')) || 44;
        for (const s of doc.querySelectorAll('pk-step')) { const r = s.getBoundingClientRect(); t.ok(r.width >= touch - 0.5 && r.height >= touch - 0.5, `a step is ${Math.round(r.width)}x${Math.round(r.height)}, at least ${touch}px`); }
    }],

    // #924: a cards-layout table with clickable rows and a max height (the logs module's entries table) at 375px: every card is as tall as its labelled rows, cards do not overlap, nothing is cut off sideways.
    ['table (375px, #924): cards with clickable rows and a max height keep each card as tall as its rows, no card overlaps the next and no long value is clipped', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const rows = JSON.stringify([1, 2, 3].map(i => ({ id: String(i), time: '10:16:5' + i, level: 'error', message: 'request failed: https://example.test/api/orders/' + 'abcdef0123456789'.repeat(4) })));
        const html = `<pk-table cards clickable max-height="22rem" label="Entries" columns='[{"key":"time","label":"Time"},{"key":"level","label":"Level"},{"key":"message","label":"Message"}]' rows='${rows}'></pk-table>`;
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '700px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
        const tb = await until(() => f.contentWindow.customElements.get('pk-table') && f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody tr td') && f.contentDocument.querySelector('pk-table'), 'the table');
        await wait(300);
        t.eq(f.contentWindow.innerWidth, 375);
        const trs = [...tb.shadowRoot.querySelectorAll('tbody tr')];
        t.eq(trs.length, 3);
        const rects = trs.map(tr => tr.getBoundingClientRect());
        trs.forEach((tr, i) => {
            const tds = [...tr.querySelectorAll('td')].map(td => td.getBoundingClientRect());
            t.ok(tds.every(r => r.top >= rects[i].top - 1 && r.bottom <= rects[i].bottom + 1), `card ${i + 1}: every labelled row sits inside its card (the card is not shorter than its content)`);
            t.ok(tr.scrollHeight <= tr.clientHeight + 1, `card ${i + 1}: nothing overflows the card vertically`);
            for (const td of tr.querySelectorAll('td')) t.ok(td.scrollWidth <= td.clientWidth + 1, `card ${i + 1}: the ${td.dataset.label} value is not cut off sideways`);
            if (i) t.ok(rects[i].top >= rects[i - 1].bottom - 1, `card ${i + 1} starts below card ${i}`);
        });
    }],

    // #1015: a slotted cell that cannot break (a long identifier in code, a button with a long label) must not push the other values of the card past its edge.
    ['table (375px, #1015): cards with an unbreakable slotted cell keep every value inside the card', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const sku = 'some-long-sku-identifier-with-dashes-and-more-parts';
        const table = cell => `<pk-table cards label="Orders" columns='[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty"},{"key":"status","label":"Status"}]' rows='[{"id":"1","sku":"x","qty":"12","status":"Shipped"}]'>${cell}</pk-table>`;
        const variants = [['code', `<code slot="cell-1-sku">${sku}</code>`], ['button', `<pk-button variant="plain" slot="cell-1-sku"><code>${sku}</code></pk-button>`]];
        for (const [name, cell] of variants) {
            const host = t.stage(''), f = document.createElement('iframe');
            f.title = 'sample'; f.style.width = '375px'; f.style.height = '500px'; f.style.border = '0';
            const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(table(cell)); await loaded;
            const tb = await until(() => f.contentWindow.customElements.get('pk-table') && f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody tr td') && f.contentDocument.querySelector('pk-table'), 'the table');
            await wait(300);
            t.eq(f.contentWindow.innerWidth, 375);
            const tr = tb.shadowRoot.querySelector('tbody tr'), card = tr.getBoundingClientRect();
            for (const td of tr.querySelectorAll('td')) {
                t.ok(td.scrollWidth <= td.clientWidth + 1, `${name}: the ${td.dataset.label} cell does not overflow sideways`);
                t.ok(td.getBoundingClientRect().right <= card.right + 1, `${name}: the ${td.dataset.label} cell ends inside the card`);
            }
            const v = tb.shadowRoot.querySelector('td[data-key="status"]').getBoundingClientRect();
            t.ok(v.right <= card.right + 1 && v.right <= 376, `${name}: the Status value is inside the card and the viewport (right ${Math.round(v.right)}, card ${Math.round(card.right)})`);
            t.ok(f.contentDocument.documentElement.scrollWidth <= 376, `${name}: the page does not scroll sideways`);
        }
    }],
    // ---- pk-specimen draws non-colour tokens at their resolved value (#1088) ----------------------------------------------------------------
    ['specimen: a space bar renders at the resolved token length in px, and the value text says so', async t => {
        const host = t.stage('<pk-specimen token="--space-4"></pk-specimen><pk-specimen token="--space-12"></pk-specimen><pk-specimen token="--touch-target"></pk-specimen>');
        await t.load(host); await t.settle();
        for (const el of host.querySelectorAll('pk-specimen')) {
            const token = el.getAttribute('token'), probe = document.createElement('span');
            probe.style.display = 'block'; probe.style.inlineSize = `var(${token})`; host.append(probe);
            const want = probe.getBoundingClientRect().width; probe.remove();
            const got = el.part('shape').getBoundingClientRect().width;
            t.ok(want > 0 && Math.abs(got - want) < 0.5, `${token}: bar ${got}px, token ${want}px`);
            t.ok(el.part('value').textContent.includes('px'), `${token}: value text ${el.part('value').textContent}`);
            t.eq(el.part('token').textContent, token);
        }
    }],
    ['specimen: radius, shadow and layer render from the inferred kind, and an explicit kind wins', async t => {
        const host = t.stage('<pk-specimen token="--radius-lg"></pk-specimen><pk-specimen token="--shadow-modal"></pk-specimen><pk-specimen token="--z-sticky"></pk-specimen><pk-specimen token="--space-2" kind="radius"></pk-specimen>');
        await t.load(host); await t.settle();
        const [r, s, z, k] = [...host.querySelectorAll('pk-specimen')].map(e => e.part('shape'));
        t.eq(getComputedStyle(r).borderTopLeftRadius, '8px', 'radius sample');
        t.ok(getComputedStyle(s).boxShadow !== 'none', 'shadow tile has a shadow');
        t.eq(z.textContent, '10', 'layer chip shows the number');
        const half = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 2;
        t.eq(getComputedStyle(k).borderTopLeftRadius, `${half}px`, 'an explicit kind wins over the prefix (--space-2 is 0.5rem)');
        t.ok(r.getBoundingClientRect().width >= 40 && s.getBoundingClientRect().height >= 40, 'samples have a visible size');
    }],
    ['specimen: the name and value are legible against the page in light and dark', async t => {
        const colour = await import('../../js/colour.js');
        const root = document.documentElement, was = root.getAttribute('data-theme');
        try {
            for (const theme of ['light', 'dark']) {
                root.setAttribute('data-theme', theme);
                const el = await t.mount('<pk-specimen token="--space-4"></pk-specimen>'); await t.settle();
                const bg = colour.parseColour(getComputedStyle(document.body).backgroundColor);
                for (const p of ['token', 'value']) {
                    const fg = colour.parseColour(getComputedStyle(el.part(p)).color), ratio = colour.contrast(fg, bg);
                    t.ok(ratio >= 4.5, `${theme}: ${p} text contrast ${ratio.toFixed(2)}`);
                }
            }
        } finally { if (was === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', was); }
    }],
    ['table: row-href-template makes the first cell of each row a real link with the right address, leaves modified clicks to the browser, reports a plain click on the link or the row as a cancelable pk-navigate (the router seam), stays focusable, and keeps it on windowed rows (#366)', async t => {
        const data = JSON.stringify([{ id: 'A 1', po: 'PO 1', customer: 'Acme & Sons' }, { id: 'B-2', po: 'PO 2', customer: 'Globex' }]);
        const el = await t.mount(`<pk-table label="P" row-href-template="/orders/{id}?c={customer}" columns='[{"key":"po","label":"PO"},{"key":"customer","label":"Customer"}]' rows='${data}'></pk-table>`);
        const row = i => el.shadowRoot.querySelectorAll('tbody tr[data-pk-context]')[i], link = i => row(i).querySelector('a[data-row-link]');
        await until(() => link(0), 'the row links (the module loads on demand, once the template is set)');
        t.eq(link(0).getAttribute('href'), '/orders/A%201?c=Acme%20%26%20Sons', 'the id and fields are URL-encoded into the template');
        t.eq(link(1).getAttribute('href'), '/orders/B-2?c=Globex');
        t.eq(link(0).textContent, 'PO 1', 'the link is named by the row label (its first cell)'); t.eq(row(0).querySelectorAll('a').length, 1, 'one link per row, in the first cell');
        t.ok(link(0).closest('td') === row(0).querySelector('td'), 'in the first cell');
        link(0).focus(); t.ok(el.shadowRoot.activeElement === link(0), 'a real link takes focus (Enter follows it natively)');
        const nav = [], seen = [];
        el.addEventListener('pk-navigate', e => { nav.push(e.detail.to); e.preventDefault(); }); // what the router does: handled, no page load
        const stop = e => { seen.push(e.defaultPrevented); e.preventDefault(); }; // after the table's own handler: record whether it intercepted, then keep the runner on this page
        document.addEventListener('click', stop);
        try {
            for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) link(1).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...mod }));
            t.eq(nav.length, 0, 'a ctrl, meta, shift or middle click is not intercepted'); t.ok(seen.every(x => !x), 'and the browser keeps its default');
            link(1).click(); t.eq(nav.join(), '/orders/B-2?c=Globex', 'a plain click on the link reports pk-navigate with the route');
            nav.length = 0; row(0).children[1].click(); t.eq(nav.join(), '/orders/A%201?c=Acme%20%26%20Sons', 'a click on the row body follows the row link');
            nav.length = 0; el.rowHrefTemplate = '#order-{id}'; await t.settle(); await until(() => link(0)?.getAttribute('href') === '#order-A%201', 'the new template');
            link(0).click(); t.eq(nav.length, 0, 'a hash address is left to the browser (no pk-navigate)');
            el.rowHrefTemplate = ''; await t.settle(); t.ok(!link(0), 'clearing the template removes the links');
            const many = JSON.stringify(Array.from({ length: 600 }, (_, i) => ({ id: i, a: `a${i}` })));
            const big = await t.mount(`<pk-table label="Big" max-height="12rem" row-href-template="/r/{id}" columns='[{"key":"a","label":"A"}]' rows='${many}'></pk-table>`);
            const links = () => [...big.shadowRoot.querySelectorAll('tbody tr[data-pk-context]')].map(r => [r.dataset.pkContext, r.querySelector('a[data-row-link]')?.getAttribute('href')]);
            await until(() => links()[0]?.[1], 'links on the windowed rows'); t.eq(big.$virtual, true, 'the table windows');
            t.ok(links().every(([id, h]) => h === `/r/${id}`), 'every drawn row has its link');
            big.shadowRoot.querySelector('[part="scroll"]').scrollTop = 4000; await wait(150); await t.settle();
            const after = links(); t.ok(after.length > 0 && Number(after[0][0]) > 50 && after.every(([id, h]) => h === `/r/${id}`), 'after a scroll the newly drawn rows have their links too');
        } finally { document.removeEventListener('click', stop); }
    }],
    ['table: navigate="host" raises pk-navigate as a non-cancelable notification and does not navigate, "none" raises nothing and leaves the link to the browser, the default stays a cancelable event (#1421)', async t => {
        const el = await t.mount(`<pk-table label="P" row-href-template="/orders/{id}" columns='[{"key":"po","label":"PO"}]' rows='[{"id":"7","po":"PO 7"}]'></pk-table>`);
        const link = () => el.shadowRoot.querySelector('a[data-row-link]');
        await until(() => link(), 'the row link');
        const seen = [], browser = [];
        el.addEventListener('pk-navigate', e => { seen.push({ to: e.detail.to, cancelable: e.cancelable }); e.preventDefault(); }); // a router handles a cancelable one; the page must not leave
        const stop = e => { browser.push(e.defaultPrevented); e.preventDefault(); }; // keeps the runner on this page after the table's own handler
        document.addEventListener('click', stop);
        try {
            link().click(); t.eq(JSON.stringify(seen), '[{"to":"/orders/7","cancelable":true}]', 'default: a cancelable pk-navigate, as before');
            seen.length = 0; browser.length = 0; el.navigate = 'host'; await t.settle();
            link().click(); t.eq(JSON.stringify(seen), '[{"to":"/orders/7","cancelable":false}]', 'host: the same event as a notification');
            t.eq(browser.join(), 'true', 'host: the table took the click, the browser does not follow the address');
            seen.length = 0; browser.length = 0; el.shadowRoot.querySelector('tbody td').click(); t.eq(seen.length, 1, 'host: a click on the row body reports it too');
            seen.length = 0; browser.length = 0; el.navigate = 'none'; await t.settle();
            link().click(); t.eq(seen.length, 0, 'none: no pk-navigate'); t.eq(browser.join(), 'false', 'none: the click is left to the browser');
        } finally { document.removeEventListener('click', stop); }
    }],
    ['table (375px, cards): a button with a long unbreakable label wraps inside the card instead of being clipped or widening it (#1288)', async t => {
        const { sampleDoc } = await import('../../site/gallery/frame.js');
        const SKU = 'some-long-sku-identifier-with-dashes-and-more-parts';
        const html = `<pk-table cards label="O" columns='[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty"}]' rows='[{"id":"1","sku":"x","qty":"12"}]'><pk-button slot="cell-1-sku" variant="plain">${SKU}</pk-button></pk-table>`;
        const host = t.stage(''), f = document.createElement('iframe');
        f.title = 'sample'; f.style.width = '375px'; f.style.height = '420px'; f.style.border = '0';
        const loaded = new Promise(r => f.addEventListener('load', r, { once: true })); host.append(f); f.srcdoc = sampleDoc(html); await loaded;
        const tb = await until(() => f.contentWindow.customElements.get('pk-button') && f.contentDocument.querySelector('pk-table')?.shadowRoot?.querySelector('tbody td'), 'the table').then(() => f.contentDocument.querySelector('pk-table'));
        await t.settle(); await new Promise(r => setTimeout(r, 120));
        const b = f.contentDocument.querySelector('pk-button'), card = tb.shadowRoot.querySelector('tbody tr').getBoundingClientRect(), r = b.getBoundingClientRect();
        t.ok(b.scrollWidth <= b.clientWidth + 1, `the button clips its label sideways: ${b.scrollWidth} > ${b.clientWidth}`);
        t.ok(r.left >= card.left && r.right <= card.right + 1, 'the button stays inside the card');
        t.ok(r.height > 44, 'the long label wrapped onto more than one line');
        t.ok(f.contentDocument.documentElement.scrollWidth <= f.contentWindow.innerWidth + 1, 'the page does not scroll sideways');
    }],
];
