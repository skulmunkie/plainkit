// More measuring cases of scripts/blazor-browser.mjs (#1333): the paths a bUnit test cannot cross because it never goes through the real JS-interop dispatcher, the
// PkCallbackSlot / plainkit.blazor.js bridge (the 0.14.0 crash on every PkListPage and PkRecordPage was one of these). Each case drives the sample's own pages and the lab
// pages (/lab/*, blazor/samples/PlainKit.AppSample/Components/Pages/Lab*.razor) in a real browser and asserts the visible result and an empty console.
// Same rules as blazor-browser-cases.mjs: a failing case is a defect in the product or the sample, file an issue, never weaken the case.

export const BENIGN = [/favicon\.ico/];
export const MAIN = `window.__deep.text(document.querySelector('#pk-main'))`;
const ALL = `window.__deep.text(document.body)`;
const has = async (ctx, what, scope = MAIN) => ctx.eval(`${scope}.includes(${JSON.stringify(what)})`);
export const waitText = (ctx, what, scope = MAIN, seconds = 15) => ctx.waitFor(`${scope}.includes(${JSON.stringify(what)})`, `"${what}" to appear`, seconds);
const waitGone = (ctx, what, scope = MAIN) => ctx.waitFor(`!${scope}.includes(${JSON.stringify(what)})`, `"${what}" to go away`);
const RECORD = 'pk-record-page >>> pk-button';
const edit = async ctx => { await ctx.clickDeep(`${RECORD}[part="edit"]`); await ctx.waitFor(`!!window.__deep.field('Title')`, 'the record fields to open for editing'); };

export const LAB_CASES = [
    { name: 'list-load-search-refresh',
      async run(ctx) {
        await ctx.open('/lab/tickets');
        await waitText(ctx, 'Ticket 5'); // Load answered through the bridge
        await ctx.typeInto('pk-list-page >>> input[type="search"]', 'Ticket 3');
        await waitGone(ctx, 'Ticket 5'); // a refresh with a new request
        ctx.ok(await has(ctx, 'Ticket 3'), 'the search for "Ticket 3" does not leave Ticket 3 in the list');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-abort-on-navigation',
      async run(ctx) {
        await ctx.open('/lab/tickets?slow=1'); // Load takes 1.5 s and honours the request's CancellationToken
        await ctx.eval(`Blazor.navigateTo('/orders')`);
        await waitText(ctx, 'Customer');
        await ctx.sleep(2500); // past the slow load: its answer, or its cancellation, must not surface as an error
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-row-click-callback',
      async run(ctx) {
        await ctx.open('/lab/tickets');
        await waitText(ctx, 'Ticket 2');
        await ctx.clickDeep('pk-list-page >>> tr', 'Ticket 2'); // OnRowClick, a callback through the bridge
        await ctx.waitFor(`location.pathname === '/lab/tickets/2'`, 'the row click to navigate to /lab/tickets/2');
        await waitText(ctx, 'Ticket 2');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-row-href-template',
      async run(ctx) {
        await ctx.open('/orders');
        await waitText(ctx, 'Grace Hopper');
        await ctx.clickLink('/orders/9'); // RowHrefTemplate="/orders/{id}"
        await waitText(ctx, 'Alan Turing');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'record-save-success',
      async run(ctx) {
        await ctx.open('/lab/tickets/1');
        await waitText(ctx, 'Ticket 1');
        await edit(ctx);
        await ctx.setField('Title', 'Renamed one');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await ctx.waitFor(`!window.__deep.field('Title') && ${MAIN}.includes('Renamed one')`, 'the saved record to show in view mode with its new title');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // The failed save leaves Ticket 2 titled FAIL (the page applied the values before the callback threw): later cases use other tickets.
    { name: 'record-save-failure',
      async run(ctx) {
        await ctx.open('/lab/tickets/2');
        await waitText(ctx, 'Ticket 2');
        await edit(ctx);
        await ctx.setField('Title', 'FAIL');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await waitText(ctx, 'Could not save'); // the callback threw: the page says so and stays in edit mode
        ctx.ok(await ctx.eval(`!!window.__deep.field('Title')`), 'a failed save left edit mode and lost the typed values');
        ctx.noErrors(ctx.openMark, [...BENIGN, /Save refused by the sample/]); // the failure itself may be echoed once as the bridge's rejected call
      } },
    { name: 'record-delete',
      async run(ctx) {
        await ctx.open('/lab/tickets/5');
        await waitText(ctx, 'Ticket 5');
        // A click on the prerendered copy is lost when the circuit takes the page over (it flaked): wait for the element's Save callback, which only the circuit sets.
        await ctx.waitFor(`typeof document.querySelector('pk-record-page')?.save === 'function'`, 'the circuit to take the record page over');
        await ctx.clickDeep(`${RECORD}[part="delete"]`);
        await ctx.waitFor(`location.pathname === '/lab/tickets'`, 'Delete to navigate back to the list');
        await waitText(ctx, 'Ticket deleted', ALL); // the success toast, a bridge call
        await waitText(ctx, 'Ticket 4');
        ctx.ok(!(await has(ctx, 'Ticket 5')), 'the deleted ticket is still in the list');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'fields-every-kind-and-column-span',
      async run(ctx) {
        await ctx.open('/lab/fields');
        const labels = ['Title', 'Notes', 'Estimate', 'Email', 'Secret', 'Due', 'Opened', 'Time of day', 'Site', 'Phone', 'Kind', 'Done', 'Owner'];
        const missing = await ctx.eval(`${JSON.stringify(labels)}.filter(n => !window.__deep.field(n))`);
        ctx.ok(!missing.length, `no control for the field(s) ${missing.join(', ')}`);
        ctx.ok(await ctx.eval(`window.__deep.field('Opened').getAttribute('type') === 'datetime-local'`), 'the DateTime field is not a datetime-local input');
        const w = await ctx.eval(`(() => { const f = n => window.__deep.field(n).closest('pk-field').getBoundingClientRect().width; return { notes: f('Notes'), estimate: f('Estimate') }; })()`);
        ctx.ok(w.notes > w.estimate * 1.8, `ColumnSpan 2 field is ${w.notes.toFixed(0)} px wide next to a one-column field of ${w.estimate.toFixed(0)} px`);
        await ctx.setField('Title', 'Changed'); // pk-field-change goes back through the handler to Set and ModelChanged
        await ctx.setField('Opened', '2026-10-14T09:30');
        await ctx.setField('Kind', 'task');
        await ctx.setField('Done', true);
        await waitText(ctx, 'Changes: 4, last title: Changed, opened: 2026-10-14T09:30');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'dialog-and-toast',
      async run(ctx) {
        await ctx.open('/lab/fields');
        await ctx.clickDeep('pk-button', 'Toast');
        await waitText(ctx, 'Saved from the lab', ALL);
        await ctx.clickDeep('pk-button', 'Ask');
        await waitText(ctx, 'Really?', ALL);
        await ctx.clickDeep('pk-button', 'Confirm');
        await waitText(ctx, 'Answer: yes');
        await ctx.clickDeep('pk-button', 'Ask');
        await waitText(ctx, 'Really?', ALL);
        await ctx.clickDeep('pk-button', 'Cancel');
        await waitText(ctx, 'Answer: no');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'element-methods',
      async run(ctx) {
        await ctx.open('/lab/methods');
        await ctx.clickDeep('pk-button', 'Open dialog');
        await waitText(ctx, 'Body of the lab dialog', ALL);
        await ctx.waitFor(`window.__deep.one('pk-dialog')?.open === true || window.__deep.one('pk-dialog')?.hasAttribute('open')`, 'ShowAsync to open the dialog');
        await ctx.eval(`window.__deep.one('pk-dialog').hide()`);
        await ctx.clickDeep('pk-button', 'Focus name');
        await ctx.waitFor(`(() => { const a = window.__deep.active(); return !!a && !!a.closest('pk-input, [name="name"]') || a?.getRootNode()?.host?.localName === 'pk-input'; })()`, 'FocusAsync to focus the input');
        await ctx.clickDeep('pk-button', 'Check form');
        await waitText(ctx, 'Valid: False');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'theme-toggle',
      async run(ctx) {
        await ctx.open('/overview');
        const before = await ctx.eval(`document.documentElement.getAttribute('data-theme')`);
        await ctx.clickDeep('pk-button[label="Settings menu"]');
        await ctx.clickDeep('pk-menu-item', 'Toggle theme');
        await ctx.waitFor(`document.documentElement.getAttribute('data-theme') !== ${JSON.stringify(before)}`, 'the theme attribute to change (applyTheme bridge call)');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'app-search-query-and-select',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.typeInto('pk-app-bar-search >>> pk-input', 'Open'); // OnQuery, the answer comes back as Items
        await ctx.waitFor(`window.__deep.q('pk-app-bar-search >>> [part="option"]').some(o => o.textContent.includes('Open'))`, 'a search result "Open"');
        await ctx.clickDeep('pk-app-bar-search >>> [part="option"]', 'Open'); // OnSelect navigates
        await ctx.waitFor(`location.pathname === '/orders/open'`, 'choosing the result to navigate to /orders/open');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // Phone cases: a 375 px viewport with touch emulation, real touchstart/touchend taps.
    { name: 'phone-touch-drawer-navigates',
      async run(ctx) {
        await onPhone(ctx, async () => {
            await ctx.open('/orders');
            await ctx.eval(`window.__pkMark = 'same'`);
            ctx.ok(await ctx.eval(`document.documentElement.scrollWidth <= 375`), 'the page scrolls sideways on a 375 px phone');
            const r = await ctx.tap('button[aria-label="Toggle the menu"]');
            ctx.ok(r.w >= 40 && r.h >= 40, `the menu button is ${r.w}x${r.h}, under a comfortable touch target`);
            await ctx.waitFor(OPEN_LINK_SHOWN, 'the drawer to show the Open link');
            await ctx.sleep(600); // the drawer slides in; tap where it settled
            await ctx.tap('a[href$="/orders/open"]');
            await ctx.waitFor(`location.pathname === '/orders/open'`, 'a tap on a drawer link to navigate');
            await ctx.sleep(600);
            ctx.ok(await ctx.eval(`window.__pkMark === 'same'`), 'a tap on a drawer link reloaded the document');
            ctx.noErrors(ctx.openMark, BENIGN);
        });
      } },
    { name: 'phone-touch-drawer-closes-after-navigation',
      async run(ctx) {
        await onPhone(ctx, async () => {
            await ctx.open('/orders');
            await ctx.tap('button[aria-label="Toggle the menu"]');
            await ctx.waitFor(OPEN_LINK_SHOWN, 'the drawer to show the Open link');
            await ctx.sleep(600);
            await ctx.tap('a[href$="/orders/open"]');
            await ctx.waitFor(`location.pathname === '/orders/open'`, 'a tap on a drawer link to navigate');
            await ctx.sleep(1000);
            ctx.ok(await ctx.eval(`!window.__deep.all('a[href$="/orders/shipped"]').some(a => a.getBoundingClientRect().right > 0)`), 'the drawer stays open over the page after a tap on one of its links (it should close once the route changed)');
        });
      } },
    { name: 'phone-touch-list-and-record',
      async run(ctx) {
        await onPhone(ctx, async () => {
            await ctx.open('/lab/tickets');
            await waitText(ctx, 'Ticket 3');
            await ctx.tap('pk-list-page >>> tr', 'Ticket 3');
            await ctx.waitFor(`location.pathname === '/lab/tickets/3'`, 'a tap on a row to open the record');
            await waitText(ctx, 'Ticket 3');
            await ctx.tap('pk-record-page >>> pk-button[part="edit"]');
            await ctx.waitFor(`!!window.__deep.field('Title')`, 'a tap on Edit to open the fields');
            ctx.ok(await ctx.eval(`document.documentElement.scrollWidth <= 375`), 'the record form scrolls sideways on a 375 px phone');
            ctx.noErrors(ctx.openMark, BENIGN);
        });
      } },
];

const OPEN_LINK_SHOWN = `window.__deep.all('a[href]').some(a => new URL(a.href).pathname === '/orders/open' && a.getBoundingClientRect().right > 0)`;

/** Runs `fn` with a 375 x 812 touch viewport, and puts the desktop one back whatever happens. */
async function onPhone(ctx, fn) {
    await ctx.viewport({ name: 'phone', width: 375, height: 812, touch: true }, 'light');
    try { await fn(); } finally { await ctx.viewport({ name: 'desktop', width: 1280, height: 900 }, 'light'); }
}

/** Screenshots of the lab pages, for the same viewports and themes as the plan in blazor-browser-cases.mjs. */
export const LAB_SHOTS = [
    async (ctx, vp, theme) => { await ctx.open('/lab/fields'); await ctx.sleep(500); await ctx.shot('lab-fields', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/tickets'); await ctx.sleep(800); await ctx.shot('lab-list', vp, theme); },
    async (ctx, vp, theme) => {
        await ctx.open('/lab/tickets/3'); await ctx.sleep(800);
        await ctx.clickDeep('pk-record-page >>> pk-button[part="edit"]'); await ctx.sleep(600);
        await ctx.shot('lab-record-editing', vp, theme);
    },
    async (ctx, vp, theme) => {
        await ctx.open('/lab/fields');
        await ctx.clickDeep('pk-button', 'Ask'); await ctx.sleep(600);
        await ctx.shot('lab-dialog', vp, theme);
    },
];
