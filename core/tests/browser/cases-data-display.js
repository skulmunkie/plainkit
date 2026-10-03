// Browser cases for the data display and content elements. Same shape as cases.js: [name, async (t) => void].
import { mediaBelow } from '../../js/breakpoints.js';
const wait = ms => new Promise(r => setTimeout(r, ms));
const cols = '[{"key":"sku","label":"SKU","sortable":true},{"key":"price","label":"Price","type":"number","sortable":true}]';
const rows = '[{"id":1,"sku":"B","price":"$10"},{"id":2,"sku":"A","price":"$2"},{"id":3,"sku":"C","price":"$5"}]';
const bodyIds = el => [...el.shadowRoot.querySelectorAll('tbody tr')].map(r => r.dataset.pkContext);

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
        g.win.document.dispatchEvent(new g.win.CustomEvent('site-theme', { detail: 'light' })); await t.settle();
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
        const el = await t.mount(`<pk-data-table selectable config='{"columns":[{"key":"sku","label":"SKU"}],"pageSize":5}'></pk-data-table>`);
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

    ['data-table: the search box keeps focus and its text across the debounce and the load, and a search with no results keeps the toolbar with a clearable search (#836)', async t => {
        const el = await t.mount(`<pk-data-table config='{"columns":[{"key":"sku","label":"SKU"}],"searchDebounce":20,"noResults":{"heading":"Nothing matches"}}'><pk-button slot="actions" id="add">Add</pk-button></pk-data-table>`);
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

    ['data-table: a page past the last one (rows deleted) settles on the last page with one more load, and total 0 still shows the empty state (#829)', async t => {
        const el = await t.mount(`<pk-data-table config='{"columns":[{"key":"sku","label":"SKU"}],"pageSize":5}'></pk-data-table>`);
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
        const el = await t.mount(`<pk-data-table config='{"columns":[{"key":"sku","label":"SKU"},{"key":"qty","label":"Qty","type":"number"},{"key":"note","label":"Note","hidePhone":true}]}'><b slot="cell-1-sku">Custom one</b></pk-data-table>`);
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

    ['data-table: clickable rows are tab stops, Enter or a click raises pk-row-click on the host with the row id, and currentRow marks the open row (#817)', async t => {
        const el = await t.mount(`<pk-data-table clickable current-row="2" config='{"columns":[{"key":"sku","label":"SKU"}]}'></pk-data-table>`);
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

    ['data-table: config sets the initial sort, page size options, pager/search/table labels and the caption, and searchable false hides the search box (#817)', async t => {
        const cfg = { columns: [{ key: 'sku', label: 'SKU', sortable: true }], sort: 'sku', sortDir: 'descending', pageSizeOptions: [5, 10], pagerLabel: 'Order pages', searchLabel: 'Find orders', searchDebounce: 20, label: 'Orders', caption: 'All orders' };
        const el = await t.mount(`<pk-data-table config='${JSON.stringify(cfg)}'></pk-data-table>`), queries = [];
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
        el.config = { ...cfg, searchable: false }; await until(() => search().getBoundingClientRect().width === 0, 'the search box to hide');
    }],

    ['data-table: the empty slot replaces the built-in empty state (not while searching), loadError words the error and pk-load-error reaches the host (#817)', async t => {
        const el = await t.mount(`<pk-data-table config='{"columns":[{"key":"sku","label":"SKU"}],"noResults":{"heading":"Nothing matches"},"loadError":"Orders failed"}'><p slot="empty" id="mine">Add your first order</p></pk-data-table>`);
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
        const el = await t.mount(`<pk-data-table selectable config='{"columns":[{"key":"sku","label":"SKU"}]}'><button slot="bulk" id="del">Delete</button></pk-data-table>`);
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

    ['data-table: load receives an AbortSignal, a newer query aborts the request in flight, and the aborted one draws no error (#817)', async t => {
        const el = await t.mount(`<pk-data-table config='{"columns":[{"key":"sku","label":"SKU"}]}'></pk-data-table>`), signals = [], errs = [];
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
        const el = await t.mount(`<pk-data-table striped cards density="compact" max-height="8rem" sticky-header config='{"columns":[{"key":"sku","label":"SKU"}],"pageSize":20}'></pk-data-table>`);
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
        el.config = { columns: JSON.parse(cols), empty: { heading: 'Nothing here' } };
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

    ['gallery: chrome full keeps the contents nav, cut down to the requested control', async t => {
        const until = async (fn, what) => { for (let i = 0; i < 150; i++) { const v = fn(); if (v) return v; await wait(100); } throw new Error(`timed out waiting for ${what}`); };
        const el = await t.mount('<pk-gallery chrome="full" control="button" height="420"></pk-gallery>');
        el.part('frame').loading = 'eager'; // The stage sits off-screen, where a lazy frame may never be asked to load; the element keeps loading=lazy for real pages, the test forces it.
        const doc = await until(() => el.part('frame').contentDocument?.querySelector('#gx-nav pk-nav-item') && el.part('frame').contentDocument, 'the nav');
        t.eq([...doc.querySelectorAll('#gx-nav pk-nav-item[slot][href]')].map(a => a.textContent.trim()).join(), 'Button');
        t.ok(doc.querySelector('.gx-bar'), 'the toolbar is there');
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
        t.eq(rowsIn(), 2); t.ok(el.part('empty').hidden);
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
        const r = el.part('resume'); r.click(); await t.settle();
        t.ok(!el.paused && !el.hasAttribute('paused') && r.hidden, 'the button resumes'); t.eq(seen.join(), 'true,false'); await until(atBottom, 'and jumps to the newest row');
        el.paused = true; await t.settle(); t.eq(seen.length, 2, 'a host change raises nothing'); el.paused = false; await until(atBottom, 'follows again');
        el.rows = ['x', { text: 'y', level: 'warn' }]; await t.settle(); t.eq(rowsIn(), 2, 'rows replaces the rows'); el.live = 'off'; await t.settle(); t.eq(sc.getAttribute('aria-live'), 'off');
        el.clear(); await t.settle(); t.eq(rowsIn(), 0);
        el.paused = true; await t.settle(); const b = el.part('resume').getBoundingClientRect(); t.ok(b.height >= 44 || innerWidth > 640, 'the resume button is 44px tall on a phone'); t.ok(b.width > 0);
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
];
