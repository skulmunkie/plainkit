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
    { name: 'page-type-panes-are-slots',
      async run(ctx) {
        await ctx.open('/lab/panes'); // #1415: each pane's content is a light-DOM child the element projects; Load (refresh) fills the master list
        await waitText(ctx, 'Loaded row', ALL);
        for (const id of ['lab-step', 'lab-nav', 'lab-main', 'lab-aside', 'lab-detail']) {
            ctx.ok(await ctx.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!(e?.assignedSlot || e?.parentElement?.assignedSlot) && e.getBoundingClientRect().width > 0; })()`), `#${id} is not projected into a pane (no assigned slot or no size)`);
        }
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-load-search-refresh',
      async run(ctx) {
        await ctx.open('/lab/tickets');
        await waitText(ctx, 'Ticket 5'); // Load answered through the bridge
        await ctx.typeInto('pk-list-page >>> input[type="search"]', 'Ticket 3');
        await waitGone(ctx, 'Ticket 5'); // a refresh with a new request
        ctx.ok(await has(ctx, 'Ticket 3'), 'the search for "Ticket 3" does not leave Ticket 3 in the list');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-before-list-slot', // #1603: BeforeListContent sits between the title bar and the list, inside the page frame
      async run(ctx) {
        await ctx.open('/lab/tickets');
        await waitText(ctx, 'Ticket 5');
        const r = await ctx.eval(`(() => { const lp = document.querySelector('pk-list-page'), a = document.querySelector('#lab-before-list').getBoundingClientRect(), h = lp.shadowRoot.querySelector('pk-page-shell').shadowRoot.querySelector('[part=header]').getBoundingClientRect(), t = lp.shadowRoot.querySelector('pk-data-table').getBoundingClientRect(); return { aTop: a.top, aBottom: a.bottom, aH: a.height, hBottom: h.bottom, tTop: t.top }; })()`);
        ctx.ok(r.aH > 0 && r.aTop >= r.hBottom - 1, 'the alert sits below the title bar');
        ctx.ok(r.aBottom <= r.tTop + 1, 'the alert sits above the list');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-abort-on-navigation',
      async run(ctx) {
        await ctx.open('/lab/tickets?slow=1'); // Load takes 1.5 s and honours the request's CancellationToken
        await ctx.eval(`Blazor.navigateTo('/orders')`);
        await waitText(ctx, 'Customer');
        await ctx.sleep(2500); // past the slow load: its answer, or its cancellation, must not surface as an error
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-row-click-callback',
      async run(ctx) {
        await ctx.open('/lab/tickets');
        await waitText(ctx, 'Ticket 2');
        await ctx.clickDeep('pk-list-page >>> tr', 'Ticket 2'); // OnRowClick, a callback through the bridge
        await ctx.waitFor(`location.pathname === '/lab/tickets/2'`, 'the row click to navigate to /lab/tickets/2');
        await waitText(ctx, 'Ticket 2');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'list-row-href-template',
      async run(ctx) {
        await ctx.open('/orders');
        await waitText(ctx, 'Grace Hopper');
        await ctx.clickLink('/orders/9'); // RowHrefTemplate="/orders/{id}"
        await waitText(ctx, 'Alan Turing');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'record-save-success',
      async run(ctx) {
        await ctx.open('/lab/tickets/1');
        await waitText(ctx, 'Ticket 1');
        await edit(ctx);
        await ctx.setField('Title', 'Renamed one');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await ctx.waitFor(`!window.__deep.field('Title') && ${MAIN}.includes('Renamed one')`, 'the saved record to show in view mode with its new title');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // The failed save leaves Ticket 2 titled FAIL (the page applied the values before the callback threw): later cases use other tickets.
    { name: 'record-save-failure',
      async run(ctx) {
        await ctx.open('/lab/tickets/2');
        await waitText(ctx, 'Ticket 2');
        await edit(ctx);
        ctx.ok(await ctx.eval(`window.__deep.one('${RECORD}[part="delete"]').hidden === false`), 'Delete is not shown in edit mode of an existing record (#1597)');
        await ctx.setField('Title', 'FAIL');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await waitText(ctx, 'Could not save');// the callback threw: the page says so and stays in edit mode
        ctx.ok(await ctx.eval(`!!window.__deep.field('Title')`), 'a failed save left edit mode and lost the typed values');
        await ctx.noErrors(ctx.openMark, [...BENIGN, /Save refused by the sample/]); // the failure itself may be echoed once as the bridge's rejected call
        // Leave the page clean: unsaved edits arm the page's beforeunload guard, and Chrome logs "Blocked attempt to show a beforeunload confirmation panel" (an error) when the next case's navigation leaves a
        // page that never saw a user gesture, which this harness's clicks are not; a person has had one, so the guard itself is right (#1423). The late log landed in whichever case was running.
        await ctx.clickDeep(`${RECORD}[part="cancel"]`);
        await ctx.waitFor(`!window.__deep.field('Title')`, 'Cancel to leave edit mode and drop the unsaved edits');
      } },
    // A new record whose Save throws keeps every typed value (#1598): the host re-renders (Busy, Error) and the element must not rebuild the form from the blank Model.
    { name: 'record-new-save-failure-keeps-edits',
      async run(ctx) {
        await ctx.open('/lab/ticket-new');
        await ctx.waitFor(`!!window.__deep.field('Title')`, 'the new record form');
        await ctx.waitFor(`typeof document.querySelector('pk-record-page')?.save === 'function'`, 'the circuit to take the record page over');
        await ctx.setField('Title', 'FAIL');
        await ctx.setField('Notes', 'kept notes');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await waitText(ctx, 'Save refused by the sample');
        const kept = await ctx.eval(`[window.__deep.field('Title').value, window.__deep.field('Notes').value]`);
        ctx.ok(kept[0] === 'FAIL' && kept[1] === 'kept notes', `a rejected Save cleared the form: ${JSON.stringify(kept)}`);
        await ctx.noErrors(ctx.openMark, [...BENIGN, /Save refused by the sample/]);
        // Leave the page clean (see the case above): empty the fields so the beforeunload guard is disarmed.
        await ctx.setField('Title', ''); await ctx.setField('Notes', '');
        await ctx.waitFor(`document.querySelector('pk-record-page')?.dirty === false`, 'the form to be clean again');
      } },
    // Sections are one card each, the sidebar's fields edit in the same form, the title follows the loaded record, and Cancel leaves edit mode.
    { name: 'record-sections-sidebar-title',
      async run(ctx) {
        await ctx.open('/lab/ticket-sections/3');
        await waitText(ctx, 'Ticket: Ticket 3');
        await waitText(ctx, 'Details');
        await waitText(ctx, 'Status');
        await edit(ctx);
        ctx.ok(await ctx.eval(`!!window.__deep.field('Done') && !!window.__deep.field('Owner') && !!window.__deep.field('Notes')`), 'a sidebar or section field has no control in edit mode');
        // Columns: 3 on the Details section (#1601): its first two fields share a row once the controls have upgraded and the layout settled.
        await ctx.waitFor(`(() => { const top = n => Math.round(window.__deep.field(n).getBoundingClientRect().top); return top('Title') === top('Estimate'); })()`, 'Title and Estimate to share a row under Columns: 3');
        await ctx.setField('Title', 'Renamed three');
        await ctx.setField('Done', true);
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await ctx.waitFor(`!window.__deep.field('Title') && ${MAIN}.includes('Ticket: Renamed three')`, 'the saved record to show in view mode under its new title');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // BeforeSave runs after validation and before Save (#1601): false (Title HOLD) keeps the page in edit mode with the edits and Save is not called; true goes on.
    { name: 'record-before-save',
      async run(ctx) {
        await ctx.open('/lab/ticket-before');
        await ctx.waitFor(`!!window.__deep.field('Title')`, 'the new record form');
        await ctx.waitFor(`typeof document.querySelector('pk-record-page')?.beforeSave === 'function'`, 'the circuit to take the record page over');
        await ctx.setField('Title', 'HOLD');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await ctx.waitFor(`document.querySelector('pk-record-page')?.$saving !== true && !document.querySelector('pk-record-page').part('save').busy`, 'the declined save to finish');
        ctx.ok(await ctx.eval(`window.__deep.field('Title')?.value === 'HOLD'`), 'a declined BeforeSave left edit mode or lost the typed value');
        await ctx.setField('Title', 'ok');
        await ctx.clickDeep(`${RECORD}[part="save"]`);
        await waitText(ctx, 'declined;checked;saved;'); // declined, then checked and only then saved: Save never ran for the declined one
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // A condition follows an edit made in another card (#1600): Kind (Details) decides whether Notes (its own card) shows.
    { name: 'record-when-follows-edit-in-another-card',
      async run(ctx) {
        await ctx.open('/lab/ticket-when/3');
        await ctx.waitFor(`!!window.__deep.field('Kind')`, 'the record to open for editing');
        await ctx.waitFor(`!!window.__deep.field('Notes')`, 'Notes to show while Kind is Bug');
        await ctx.setField('Kind', 'task');
        await ctx.waitFor(`!window.__deep.field('Notes')`, 'Notes to hide once Kind is Task');
        await ctx.setField('Kind', 'bug');
        await ctx.waitFor(`!!window.__deep.field('Notes')`, 'Notes to show again once Kind is Bug');
        await ctx.noErrors(ctx.openMark, BENIGN);
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
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'fields-every-kind-and-column-span',
      async run(ctx) {
        await ctx.open('/lab/fields');
        const labels = ['Title', 'Notes', 'Estimate', 'Email', 'Secret', 'Due', 'Opened', 'Time of day', 'Site', 'Phone', 'Kind', 'Done', 'Owner'];
        const missing = await ctx.eval(`${JSON.stringify(labels)}.filter(n => !window.__deep.field(n))`);
        ctx.ok(!missing.length, `no control for the field(s) ${missing.join(', ')}`);
        ctx.ok(await ctx.eval(`window.__deep.field('Opened').getAttribute('type') === 'datetime-local'`), 'the DateTime field is not a datetime-local input');
        ctx.ok(await ctx.eval(`window.__deep.field('Secret').getAttribute('autocomplete') === 'new-password' && !window.__deep.field('Title').hasAttribute('autocomplete')`), 'the Secret field lost its AutoComplete token (new-password), or Title gained one');
        ctx.ok(await ctx.eval(`window.__deep.field('Title').getAttribute('maxlength') === '40'`), 'the Title field lost its MaxLength (40): PkFieldSpec must send it as maxlength')
        const w = await ctx.eval(`(() => { const f = n => window.__deep.field(n).closest('pk-field').getBoundingClientRect().width; return { notes: f('Notes'), estimate: f('Estimate') }; })()`);
        ctx.ok(w.notes > w.estimate * 1.8, `ColumnSpan 2 field is ${w.notes.toFixed(0)} px wide next to a one-column field of ${w.estimate.toFixed(0)} px`);
        await ctx.setField('Title', 'Changed'); // pk-field-change goes back through the handler to Set and ModelChanged
        await ctx.setField('Opened', '2026-10-14T09:30');
        await ctx.setField('Kind', 'task');
        await ctx.setField('Done', true);
        await waitText(ctx, 'Changes: 4, last title: Changed, opened: 2026-10-14T09:30');
        await ctx.noErrors(ctx.openMark, BENIGN);
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
        await ctx.noErrors(ctx.openMark, BENIGN);
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
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    // #1582: the dev tools page is the SDK's devtools workspace module mounted through the bridge (PkDevToolsWorkspace): the tabs, the callbacks into .NET (a tab click navigates)
    // and the data handed over (the gallery's Blazor sections, the score targets, the snapshot through the lazy reader).
    { name: 'devtools-workspace',
      async run(ctx) {
        await ctx.open('/_plainkit');
        await ctx.waitFor(`!!window.__deep.one('pk-gallery')`, 'the Gallery workspace to mount');
        ctx.ok(await ctx.eval(`(window.__deep.one('pk-gallery').getAttribute('sections') ?? '').includes('PkButton')`), 'the gallery got no Blazor sections from .NET');
        await waitText(ctx, 'Console', ALL); // the dock's tabs
        await ctx.clickDeep('pk-tab', 'Files');
        await ctx.waitFor(`location.pathname === '/_plainkit/files'`, 'the Files tab to navigate through .NET');
        await ctx.waitFor(`!!window.__deep.one('pk-code-explorer') || window.__deep.text(document.body).includes('No source to browse')`, 'the Files workspace to load');
        await ctx.clickDeep('pk-tab', 'Scorecard');
        await ctx.waitFor(`location.pathname === '/_plainkit/scorecard'`, 'the Scorecard tab to navigate through .NET');
        await ctx.waitFor(`window.__deep.text(document.body).includes('Run scorecard') || window.__deep.text(document.body).includes('Run live')`, 'the Scorecard workspace to draw its run button');
        await ctx.open('/_plainkit/files'); // a deep link mounts on that workspace
        await ctx.waitFor(`window.__deep.one('pk-tabs')?.getAttribute('value') === 'files'`, 'a deep link to open the Files workspace');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'two-way-bind',
      async run(ctx) {
        await ctx.open('/lab/bind');
        await waitText(ctx, 'Tab: a', ALL);
        await ctx.clickDeep('pk-tab', 'Beta');
        await waitText(ctx, 'Tab: b', ALL); // @bind-Value on PkTabs follows pk-tab-change
        await waitText(ctx, 'Pressed: False', ALL);
        await ctx.clickDeep('pk-button', 'Bold');
        await waitText(ctx, 'Pressed: True', ALL); // @bind-Pressed on a toggle PkButton follows pk-toggle
        await ctx.clickDeep('pk-tab', 'Alpha');
        await waitText(ctx, 'Tab: a', ALL);
        await waitText(ctx, 'Values: {}', ALL);
        const SWITCH = `document.querySelector('pk-property-grid')?.shadowRoot?.querySelector('pk-switch')?.shadowRoot?.querySelector('[part=control]')`;
        await ctx.waitFor(`!!${SWITCH}`, 'the property grid to draw its switch'); // its config reaches the element through the bridge after the page text shows
        await ctx.eval(`(() => { ${SWITCH}.click(); return 1; })()`);
        await waitText(ctx, 'Values: {"enabled":true}', ALL); // @bind-Values on PkPropertyGrid follows pk-property-change as JSON text
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'markdown-editor-bind',
      async run(ctx) {
        await ctx.open('/lab/markdown'); // #1522: PkMarkdownEditor, typed text and a toolbar command both reach @bind-Value
        const TA = `(() => { const ed = document.querySelector('pk-markdown-editor'); return ed?.shadowRoot?.querySelector('pk-textarea')?.shadowRoot?.querySelector('textarea'); })()`;
        await ctx.waitFor(`!!${TA} && typeof document.querySelector('pk-markdown-editor')?.shadowRoot?.querySelector('[data-cmd="bold"]')?.click === 'function'`, 'the editor to draw its textarea and toolbar');
        await waitText(ctx, 'Markdown:', ALL);
        await ctx.eval(`(() => { const t = ${TA}; t.focus(); t.value = 'make bold'; t.dispatchEvent(new Event('input', { bubbles: true, composed: true })); t.dispatchEvent(new Event('change', { bubbles: true, composed: true })); return 1; })()`);
        await waitText(ctx, 'Markdown: make bold', ALL); // typed text follows pk-change into the bound field
        await ctx.eval(`(() => { const t = ${TA}; t.focus(); t.setSelectionRange(5, 9); document.querySelector('pk-markdown-editor').shadowRoot.querySelector('[data-cmd="bold"]').click(); return 1; })()`);
        await waitText(ctx, 'Markdown: make **bold**', ALL); // the toolbar command, applied through the lazy commands chunk, follows too
        ctx.ok(await ctx.eval(`${TA}.value === 'make **bold**'`), 'the textarea does not show the bolded text');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'markdown-view',
      async run(ctx) {
        await ctx.open('/lab/markdown'); // #1673: PkMarkdown draws Markdown with DOM nodes only and hands a relative link to OnLinkClick
        const ROOT = `document.querySelector('pk-markdown')?.shadowRoot?.querySelector('[part=content]')`;
        await ctx.waitFor(`!!${ROOT}?.querySelector('h2') && !!${ROOT}.querySelector('strong')`, 'pk-markdown to draw its heading and bold text');
        ctx.ok(await ctx.eval(`${ROOT}.textContent.includes('<script>') && !${ROOT}.querySelector('script') && !window.__mdXss`), 'raw HTML in the Markdown was not shown as text');
        await ctx.eval(`(() => { ${ROOT}.querySelector('a').click(); return 1; })()`);
        await waitText(ctx, 'Link: guide/intro', ALL); // the relative link reached OnLinkClick
        ctx.ok(await ctx.eval(`location.pathname === '/lab/markdown'`), 'the relative link navigated instead of going to OnLinkClick');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'table-edit-columns',
      async run(ctx) {
        await ctx.open('/lab/table-edit'); // #1580: the generated column record reaches the element, and a textarea edit comes back through OnCellEdit
        const TABLE = `document.querySelector('pk-table')`;
        const CELL = `${TABLE}?.shadowRoot?.querySelector('td[data-key="notes"]')`;
        await ctx.waitFor(`!!(${CELL})`, 'the editable table to draw its notes cell');
        const cols = JSON.parse(await ctx.eval(`JSON.stringify(JSON.parse(${TABLE}.getAttribute('columns')))`));
        ctx.ok(cols[0].editor === 'textarea' && cols[1].editor === 'combobox' && cols[1].free === true, 'the textarea and combobox editors or free did not reach the element');
        ctx.ok(cols[2].min === '2026-01-01' && cols[2].max === '2026-12-31', 'the date bounds (a DateOnly and a string) did not reach the element as ISO dates');
        // Blazor can redraw the table (new rows or columns reach the element after the first cell exists), which drops a focus or an Enter sent a moment too soon. So the wait
        // itself presses Enter on the CURRENT cell whenever the editor is not open (idempotent: it never presses while the editor is open), until the real state arrives.
        await ctx.waitFor(`(() => { const ta = ${TABLE}.shadowRoot.querySelector('td[data-key="notes"] textarea'); if (ta) return true; const td = ${CELL}; if (td) { td.focus(); td.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })); } return false; })()`, 'Enter to open the textarea editor');
        await ctx.eval(`(() => { const t = ${TABLE}.shadowRoot.querySelector('td[data-key="notes"] textarea'); t.value = 'second'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true })); return 1; })()`);
        await waitText(ctx, 'Edited: notes=second', ALL);
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'table-column-resize-reorder',
      async run(ctx) {
        await ctx.open('/lab/table-edit'); // #1580: OnColumnResize and OnColumnReorder come back through the real interop, from the keyboard paths of the lazy table-cols chunk
        const T = `document.querySelector('pk-table')`;
        const GRIP = `${T}?.shadowRoot?.querySelector('th[data-key="notes"] [data-resize]')`;
        await ctx.waitFor(`!!(${GRIP})`, 'the resizable table to draw its resize handle');
        await ctx.eval(`(() => { const g = ${GRIP}; g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true })); return 1; })()`);
        await waitText(ctx, 'Resized: notes=210', ALL); // 200 px column plus one 10 px step
        await ctx.eval(`(() => { const g = ${GRIP}; g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, composed: true })); return 1; })()`);
        await waitText(ctx, 'Reordered: notes 0>1 [status,notes,due]', ALL);
        ctx.ok(await ctx.eval(`${T}.shadowRoot.querySelector('tr:first-child > th[data-key]').dataset.key === 'status'`), 'the table did not show the new column order');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'theme-toggle',
      async run(ctx) {
        await ctx.open('/overview');
        const before = await ctx.eval(`document.documentElement.getAttribute('data-theme')`);
        await ctx.clickDeep('pk-button[label="Settings menu"]');
        await ctx.clickDeep('pk-menu-item', 'Toggle theme');
        await ctx.waitFor(`document.documentElement.getAttribute('data-theme') !== ${JSON.stringify(before)}`, 'the theme attribute to change (applyTheme bridge call)');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'app-search-query-and-select',
      async run(ctx) {
        await ctx.open('/orders');
        await ctx.typeInto('pk-app-bar-search >>> pk-input', 'Open'); // OnQuery, the answer comes back as Items
        await ctx.waitFor(`window.__deep.q('pk-app-bar-search >>> [part="option"]').some(o => o.textContent.includes('Open'))`, 'a search result "Open"');
        await ctx.clickDeep('pk-app-bar-search >>> [part="option"]', 'Open'); // OnSelect navigates
        await ctx.waitFor(`location.pathname === '/orders/open'`, 'choosing the result to navigate to /orders/open');
        await ctx.noErrors(ctx.openMark, BENIGN);
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
            await ctx.noErrors(ctx.openMark, BENIGN);
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
            // Ticket 3 is retitled by record-sections-sidebar-title earlier in the run and Ticket 5 is deleted by record-delete: Ticket 4 is the one no case changes (#1571).
            await ctx.open('/lab/tickets');
            await waitText(ctx, 'Ticket 4');
            await ctx.tap('pk-list-page >>> tr', 'Ticket 4');
            await ctx.waitFor(`location.pathname === '/lab/tickets/4'`, 'a tap on a row to open the record');
            await waitText(ctx, 'Ticket 4');
            await ctx.tap('pk-record-page >>> pk-button[part="edit"]');
            await ctx.waitFor(`!!window.__deep.field('Title')`, 'a tap on Edit to open the fields');
            ctx.ok(await ctx.eval(`document.documentElement.scrollWidth <= 375`), 'the record form scrolls sideways on a 375 px phone');
            await ctx.noErrors(ctx.openMark, BENIGN);
        });
      } },
];

const OPEN_LINK_SHOWN = `window.__deep.all('a[href]').some(a => new URL(a.href).pathname === '/orders/open' && a.getBoundingClientRect().right > 0)`;

/** Runs `fn` with a 375 x 812 touch viewport, and puts the desktop one back whatever happens. */
export async function onPhone(ctx, fn) {
    await ctx.viewport({ name: 'phone', width: 375, height: 812, touch: true }, 'light');
    try { await fn(); } finally { await ctx.viewport({ name: 'desktop', width: 1280, height: 900 }, 'light'); }
}

/** Screenshots of the lab pages, for the same viewports and themes as the plan in blazor-browser-cases.mjs. */
export const LAB_SHOTS = [
    async (ctx, vp, theme) => { await ctx.open('/lab/fields'); await ctx.sleep(500); await ctx.shot('lab-fields', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/tickets'); await ctx.sleep(800); await ctx.shot('lab-list', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/_plainkit/files'); await ctx.sleep(1500); await ctx.shot('devtools-files', vp, theme); },
    async (ctx, vp, theme) => {
        await ctx.open('/lab/tickets/3'); await ctx.sleep(800);
        await ctx.clickDeep('pk-record-page >>> pk-button[part="edit"]'); await ctx.sleep(600);
        await ctx.shot('lab-record-editing', vp, theme);
    },
    async (ctx, vp, theme) => {
        await ctx.open('/lab/ticket-sections/3'); await ctx.sleep(800);
        await ctx.shot('lab-record-sections-view', vp, theme);
        await ctx.clickDeep('pk-record-page >>> pk-button[part="edit"]'); await ctx.sleep(600);
        await ctx.shot('lab-record-sections-editing', vp, theme);
    },
    async (ctx, vp, theme) => {
        await ctx.open('/lab/fields');
        await ctx.clickDeep('pk-button', 'Ask'); await ctx.sleep(600);
        await ctx.shot('lab-dialog', vp, theme);
    },
];
