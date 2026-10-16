// More measuring cases of scripts/blazor-browser.mjs (#1381): the real-interop paths a bUnit test cannot see and no earlier case ran. The callbacks of the page types
// (PkToolPage.Run, PkSettingsPage.Save, PkDashboardPage.Load, PkDocPage.LoadItem, PkDock.ConfirmLayout and OnLayoutChange), a JSON attribute followed after the first
// render (Config, Values), the two-way parameters of PkTabs and PkDialog, and file picking through Blazor's InputFile (DevTools DOM.setFileInputFiles). They drive the lab pages
// /lab/pages, /lab/doc, /lab/layout and /lab/files (blazor/samples/PlainKit.AppSample/Components/Pages/Lab*.razor). Same rules as blazor-browser-cases.mjs: a failing case is a
// defect in the product or the sample, file an issue, never weaken the case.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BENIGN, MAIN, onPhone, waitText } from './blazor-browser-lab-cases.mjs';

const BODY = `window.__deep.text(document.body)`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'); // a 1 x 1 PNG
const NICK = 'pk-settings-page >>> pk-input';
const nick = prop => `window.__deep.one(${JSON.stringify(NICK)})?.${prop}`;
const SAVE_SHOWN = `window.__deep.q('pk-settings-page >>> pk-button[part="save"]').some(b => b.getBoundingClientRect().width > 0)`;
// The circuit has taken the page over once the element has its callback property: an edit or a click made on the prerendered copy is thrown away with it.
const live = (ctx, tag, prop) => ctx.waitFor(`typeof document.querySelector(${JSON.stringify(tag)})?.${prop} === 'function'`, `the circuit to set ${prop} on ${tag}`);
const shown = (ctx, id, text) => ctx.waitFor(`document.getElementById(${JSON.stringify(id)})?.textContent.includes(${JSON.stringify(text)})`, `#${id} to say "${text}"`);

/** Writes `files` ({ name: Buffer | string }) into a fresh temporary folder, runs `fn(paths)`, and deletes the folder. */
async function withFiles(files, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-blazor-files-'));
    try {
        const paths = Object.entries(files).map(([name, data]) => { const p = path.join(dir, name); fs.writeFileSync(p, data); return p; });
        await fn(paths);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export const INTEROP_CASES = [
    { name: 'tool-page-run-callback',
      async run(ctx) {
        await ctx.open('/lab/pages');
        await live(ctx, 'pk-tool-page', 'run');
        await ctx.waitFor(`!!window.__deep.one('pk-tool-page >>> pk-input')`, 'the Name field');
        await ctx.typeInto('pk-tool-page >>> pk-input', 'Ann');
        await ctx.clickDeep('pk-tool-page >>> pk-button[part="run"]'); // Run, through the bridge with the field values
        await waitText(ctx, 'Hello Ann');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'settings-page-save-callback',
      async run(ctx) {
        await ctx.open('/lab/pages');
        await live(ctx, 'pk-settings-page', 'save');
        await ctx.waitFor(`${nick('value')} === 'first' && typeof ${nick('fire')} === 'function'`, 'the field to hold its Values and be defined (a keystroke on an element that is not yet upgraded raises no value event)');
        await ctx.typeInto(NICK, 'Zed');
        await ctx.waitFor(SAVE_SHOWN, 'the Save bar to appear for the unsaved change');
        await ctx.clickDeep('pk-settings-page >>> pk-button[part="save"]');
        await shown(ctx, 'lab-log', 'saved Zed');
        await ctx.typeInto(NICK, 'FAIL');
        await ctx.waitFor(SAVE_SHOWN, 'the Save bar to appear again');
        await ctx.clickDeep('pk-settings-page >>> pk-button[part="save"]');
        await waitText(ctx, 'Save refused by the sample'); // the thrown message is the element's error text, the changes stay unsaved
        ctx.ok(await ctx.eval(`!document.getElementById('lab-log').textContent.includes('FAIL')`), 'the refused save was reported as saved');
        // #1412: an exception that is not user-facing shows the generic line, never its text or path.
        await ctx.typeInto(NICK, 'BOOM');
        await ctx.waitFor(SAVE_SHOWN, 'the Save bar to appear for the BOOM change');
        await ctx.clickDeep('pk-settings-page >>> pk-button[part="save"]');
        await waitText(ctx, 'Something went wrong');
        ctx.ok(await ctx.eval(`!/Secret\.cs|Boom at/.test(window.__deep.text(document.querySelector('pk-settings-page')))`), 'the non-user-facing exception text reached the page');
        await ctx.noErrors(ctx.openMark, [...BENIGN, /Save refused by the sample/, /Boom at/]);
      } },
    // #334: three sections turn the section nav on through the Config JSON alone. Choosing one scrolls its card in and marks it, an edit survives the switch, and a phone has tabs instead.
    { name: 'settings-page-section-nav',
      async run(ctx) {
        const NAV = 'pk-settings-page >>> [part="nav"]', ITEM = 'pk-settings-page >>> pk-nav-item';
        const marked = `window.__deep.q(${JSON.stringify(ITEM)}).filter(i => i.hasAttribute('current')).map(i => i.textContent.trim()).join()`;
        await ctx.open('/lab/pages');
        await live(ctx, 'pk-settings-page', 'save');
        await ctx.waitFor(`window.__deep.q(${JSON.stringify(ITEM)}).length === 3`, 'one nav item per section');
        ctx.ok(await ctx.eval(`window.__deep.one(${JSON.stringify(NAV)}).getBoundingClientRect().width > 0`), 'the section nav is not drawn on a desktop');
        ctx.ok(await ctx.eval(`${marked} === 'Profile'`), 'the first section is not the current one');
        await ctx.waitFor(`typeof ${nick('fire')} === 'function'`, 'the field to be defined');
        await ctx.typeInto(NICK, 'Zed');
        await ctx.waitFor(SAVE_SHOWN, 'the Save bar to appear for the unsaved change');
        await ctx.clickDeep(ITEM, 'Billing');
        await ctx.waitFor(`${marked} === 'Billing'`, 'Billing to become the current section');
        ctx.ok(await ctx.eval(`window.__deep.q('pk-settings-page >>> pk-card').some(c => c.heading === 'Billing' && c.getBoundingClientRect().bottom > 0 && c.getBoundingClientRect().top < innerHeight)`), 'the Billing card is not in view');
        ctx.ok(await ctx.eval(`${SAVE_SHOWN} && ${nick('value')} === 'Zed'`), 'switching section lost the unsaved edit or the Save bar');
        await onPhone(ctx, async () => {
            await ctx.open('/lab/pages');
            await live(ctx, 'pk-settings-page', 'save');
            await ctx.waitFor(`window.__deep.q('pk-settings-page >>> pk-tab').length === 3`, 'the section tabs on a phone');
            ctx.ok(await ctx.eval(`window.__deep.one(${JSON.stringify(NAV)}).getBoundingClientRect().width === 0`), 'the nav column is still drawn on a phone');
        });
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'json-attribute-resync',
      async run(ctx) {
        await ctx.open('/lab/pages');
        await live(ctx, 'pk-settings-page', 'save');
        await ctx.waitFor(`${nick('label')} === 'Nickname'`, 'the settings field');
        await ctx.waitFor(`${nick('value')} === 'first'`, 'the Values parameter to reach the first render');
        await ctx.clickDeep('pk-button', 'Rename'); // Config and Values change after the first render
        await ctx.waitFor(`${nick('label')} === 'Handle'`, 'the field to follow the new Config label');
        await ctx.waitFor(`${nick('value')} === 'second'`, 'the field to follow the new Values');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'dashboard-load-callback',
      async run(ctx) {
        await ctx.open('/lab/pages');
        await ctx.waitFor(`window.__deep.q('pk-dashboard-page >>> pk-card').some(c => c.heading === 'Fine widget' && window.__deep.text(c).includes('42'))`, 'the Fine widget card to show 42 (Load answered through the bridge)');
        await ctx.waitFor(`window.__deep.q('pk-dashboard-page >>> pk-card').some(c => c.heading === 'Broken widget' && c.dataset.state === 'error')`, 'the Broken widget card to show its error state');
        // #1412: DetailedErrors=true is the worst case, yet the card shows no exception type, stack frame, drive path or .cs/.dll text.
        const broken = await ctx.eval(`window.__deep.text(window.__deep.q('pk-dashboard-page >>> pk-card').find(c => c.heading === 'Broken widget'))`);
        ctx.ok(!/Exception|at \S+ in |\.cs|\.dll|[A-Za-z]:[\/]|\/home\//.test(broken) && !/Widget refused by the sample/.test(broken), `the Broken widget card leaks exception detail: ${broken.slice(0, 200)}`);
        await ctx.noErrors(ctx.openMark, [...BENIGN, /Widget refused by the sample/]);
      } },
    { name: 'doc-page-loaditem-callback',
      async run(ctx) {
        await ctx.open('/lab/doc');
        await waitText(ctx, 'Body from the sample.'); // LoadItem answered with html
        await waitText(ctx, 'Loaded section');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'dock-layout-events-and-confirm',
      async run(ctx) {
        await ctx.open('/lab/layout');
        await live(ctx, 'pk-dock', 'confirmLayout');
        await ctx.waitFor(`window.__deep.q('pk-dock >>> pk-tab').some(t => t.textContent.includes('Two'))`, 'the dock to draw its tab strip');
        await ctx.clickDeep('pk-dock >>> pk-tab', 'Two'); // activate: held for ConfirmLayout, applied, then OnLayoutChange
        await shown(ctx, 'lab-dock', 'Dock events: 1, last: activate, confirms: 1');
        ctx.ok(await ctx.eval(`window.__deep.text(document.querySelector('pk-dock')).includes('Second panel')`), 'the confirmed layout did not show the second panel');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'tabs-value-binding',
      async run(ctx) {
        await ctx.open('/lab/layout');
        await live(ctx, 'pk-dock', 'confirmLayout');
        await shown(ctx, 'lab-tab', 'Tab: a');
        await ctx.clickDeep('pk-button', 'Select B'); // C# to the element
        await ctx.waitFor(`document.querySelector('pk-tabs').value === 'b' || document.querySelector('pk-tabs').getAttribute('value') === 'b'`, 'the tabs to select B after the parameter changed');
        await ctx.waitFor(`window.__deep.q('pk-tabs > pk-tab-panel').some(p => p.textContent.includes('Beta body') && p.getBoundingClientRect().height > 0)`, 'the Beta panel to show');
        await ctx.clickDeep('pk-tabs > pk-tab', 'Alpha'); // the element to C#
        await shown(ctx, 'lab-tab', 'Tab: a, changes: 1');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'dialog-isopen-binding',
      async run(ctx) {
        await ctx.open('/lab/layout');
        await live(ctx, 'pk-dock', 'confirmLayout');
        const isOpen = `document.querySelector('pk-dialog').hasAttribute('open')`;
        await ctx.clickDeep('pk-button', 'Open dialog'); // C# to the element
        await ctx.waitFor(isOpen, 'the dialog to open');
        await ctx.clickDeep('pk-dialog pk-button', 'Done'); // C# closes it again
        await ctx.waitFor(`!(${isOpen})`, 'the dialog to close when IsOpen turned false');
        await ctx.clickDeep('pk-button', 'Open dialog');
        await ctx.waitFor(isOpen, 'the dialog to open again');
        await ctx.clickDeep('pk-dialog >>> [part="close"]'); // the element to C#: pk-close sets IsOpen false and raises OnClose
        await shown(ctx, 'lab-open', 'Dialog open: False, closes: 1');
        ctx.ok(await ctx.eval(`!(${isOpen})`), 'the dialog stayed open after its close button');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'inputfile-in-dropzone',
      async run(ctx) {
        await ctx.open('/lab/files');
        await ctx.sleep(1500); // no callback property to wait for here: let the circuit take the InputFile over
        await withFiles({ 'note.txt': 'hello' }, async ([file]) => {
            await ctx.setFiles('pk-dropzone input[type="file"]', [file]); // the OS picker's result, onto Blazor's InputFile
            await shown(ctx, 'lab-read', 'Read: note.txt:hello'); // OnChange read the bytes over the real stream
        });
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'image-gallery-add-by-inputfile',
      async run(ctx) {
        await ctx.open('/lab/files');
        await ctx.sleep(1500);
        await withFiles({ 'dot.png': PNG }, async ([file]) => {
            await ctx.setFiles('pk-image-gallery input[type="file"]', [file]);
            await shown(ctx, 'lab-count', 'Images: 1');
        });
        await ctx.waitFor(`window.__deep.q('pk-image-gallery >>> img').some(i => i.getAttribute('src')?.startsWith('data:image/png') && i.naturalWidth === 1)`, 'the added image to show in the gallery');
        await ctx.noErrors(ctx.openMark, BENIGN);
      } },
];

/** Screenshots of the lab pages added here, for the plan in blazor-browser-cases.mjs. */
export const INTEROP_SHOTS = [
    async (ctx, vp, theme) => { await ctx.open('/lab/pages'); await ctx.sleep(1200); await ctx.shot('lab-pages', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/layout'); await ctx.sleep(800); await ctx.shot('lab-layout', vp, theme); },
];
