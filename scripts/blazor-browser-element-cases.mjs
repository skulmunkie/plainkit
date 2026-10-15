// More measuring cases of scripts/blazor-browser.mjs (#1411): what the earlier lab cases still left to bUnit, which mocks the JS side. Element properties set after the render
// (setProperty: PkCommandPalette.Items, PkLightbox.Items, PkCodeView.Segments), element references (setRef: PkButton.Controls, PkDesignSurface.Selected), the PkCanvas events,
// PkSideNav open and close, and a real mouse drag (DevTools Input.dispatchMouseEvent, so real pointer events) on PkImageGallery and PkKanban. They drive the lab pages /lab/props,
// /lab/canvas, /lab/nav and /lab/drag (blazor/samples/PlainKit.AppSample/Components/Pages/Lab*.razor). Same rules as blazor-browser-cases.mjs: a failing case is a defect in the
// product or the sample, file an issue, never weaken the case. Every wait is on a state (ctx.waitFor, stretched by the CPU load), never a fixed delay.
import { BENIGN } from './blazor-browser-lab-cases.mjs';

// The circuit has taken the page over once the element has its callback property; a click made on the prerendered copy is thrown away with it.
const live = (ctx, tag, prop) => ctx.waitFor(`document.querySelector(${JSON.stringify(tag)}) && ${JSON.stringify(prop)} in document.querySelector(${JSON.stringify(tag)})`, `${tag} to be upgraded (${prop})`);
const shown = (ctx, id, text) => ctx.waitFor(`document.getElementById(${JSON.stringify(id)})?.textContent.includes(${JSON.stringify(text)})`, `#${id} to say "${text}"`);
const centre = (sel, nth = 0) => `(() => { const e = (${sel.startsWith("@") ? sel.slice(1) : `window.__deep.q(${JSON.stringify(sel)})`}).filter(x => x.getBoundingClientRect().width > 0)[${nth}]; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`;

/** A real mouse click (move, press, release) on the centre of the first visible element matching `sel`. */
async function click(ctx, sel) {
    const p = await ctx.eval(centre(sel));
    ctx.ok(p, `nothing visible to click: ${sel}`);
    for (const [type, buttons] of [['mouseMoved', 0], ['mousePressed', 1], ['mouseReleased', 0]]) await ctx.cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
}

/** A real mouse drag from the centre of one element to the centre of another (or a point), in steps, through the DevTools input domain. */
async function drag(ctx, from, to) {
    const a = await ctx.eval(centre(...from));
    ctx.ok(a, `nothing visible to press on: ${from[0]}`);
    const b = to.dx !== undefined ? { x: a.x + to.dx, y: a.y + to.dy } : await ctx.eval(centre(...to));
    ctx.ok(b, `nothing visible to drop on: ${to[0]}`);
    const send = (type, p, extra = {}) => ctx.cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    await ctx.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
    await send('mousePressed', a);
    for (let i = 1; i <= 8; i++) await send('mouseMoved', { x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 });
    await send('mouseReleased', b);
}

export const ELEMENT_CASES = [
    { name: 'command-palette-items-property',
      async run(ctx) {
        await ctx.open('/lab/props');
        await ctx.waitFor(`document.querySelector('pk-command-palette')?.items?.length === 3`, 'Items to reach the palette as its items property (setProperty)');
        await ctx.clickDeep('pk-button', 'Open palette'); // ShowAsync
        await ctx.waitFor(`window.__deep.q('pk-command-palette >>> [role="option"]').length === 3`, 'the palette to list its three commands');
        await ctx.waitFor(`window.__deep.q('pk-command-palette >>> [role="option"]').every(o => o.getBoundingClientRect().width > 0)`, 'the palette dialog to be drawn');
        await ctx.clickDeep('pk-command-palette >>> [role="option"]', 'Find a ticket');
        await ctx.waitFor(`location.pathname !== '/lab/props' || document.getElementById('lab-picked').textContent !== 'Picked: none'`, 'the choice to reach OnSelect');
        await ctx.waitFor(`location.pathname !== '/lab/props'`, 'the app frame to navigate (absence expected)', 3).then(() => true, () => false); // a bounded wait for the unwanted navigation, which follows the pick by one more round trip
        ctx.ok(await ctx.eval(`location.pathname === '/lab/props'`), `choosing a palette command navigated to ${await ctx.eval('location.pathname')}: the pk-select bubbles to the app frame's OnSelect, which navigates to the item's id`);
        await shown(ctx, 'lab-picked', 'Picked: find'); // OnSelect reports the chosen Id
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'lightbox-items-property',
      async run(ctx) {
        await ctx.open('/lab/props');
        await ctx.waitFor(`document.querySelector('pk-lightbox')?.items?.length === 2`, 'Items to reach the lightbox as its items property (setProperty)');
        await ctx.clickDeep('pk-button', 'Open viewer'); // ShowAsync(1)
        await ctx.waitFor(`window.__deep.q('pk-lightbox >>> [part="caption"]').some(c => c.textContent === 'Second picture')`, 'the viewer to open on the second picture');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'code-view-segments-property',
      async run(ctx) {
        await ctx.open('/lab/props');
        await ctx.waitFor(`window.__deep.q('pk-code-view >>> .tk-keyword').some(s => s.textContent === 'const') && window.__deep.q('pk-code-view >>> .tk-comment').length === 1`, 'Segments to colour the lines (setProperty after the render)');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'button-controls-ref',
      async run(ctx) {
        await ctx.open('/lab/props');
        // setRef resolves the id to the element, after the render in which the id changed: the control's aria-controls follows it.
        const target = `(() => { const c = document.getElementById('lab-controls').controls; return [].concat(c ?? []).map(e => e.id ?? e).join(' '); })()`;
        await ctx.waitFor(`${target} === 'lab-first'`, 'Controls to resolve to #lab-first (setRef)');
        await ctx.clickDeep('pk-button', 'Switch target');
        await ctx.waitFor(`${target} === 'lab-second'`, 'Controls to follow the changed id to #lab-second');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'design-surface-selected-ref',
      async run(ctx) {
        await ctx.open('/lab/canvas');
        const sel = `document.querySelector('pk-design-surface')?.selected?.id`;
        await ctx.waitFor(`${sel} === 's-one'`, 'Selected to resolve to the node #s-one (setRef)');
        await ctx.clickDeep('pk-button', 'Select other');
        await ctx.waitFor(`${sel} === 's-two'`, 'Selected to follow the changed id to #s-two');
        await click(ctx, 'pk-design-surface > #s-one'); // a real click on the page (the surface hit-tests the pointer): OnPick
        await shown(ctx, 'lab-surface', 'picks: 1');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'canvas-view-pick-key',
      async run(ctx) {
        await ctx.open('/lab/canvas');
        await live(ctx, 'pk-canvas', 'zoom');
        await click(ctx, 'pk-canvas > #lab-node'); // a press without movement picks the node (before any zoom moves it out of the frame)
        await shown(ctx, 'lab-canvas-events', 'Picks: 1');
        await ctx.clickDeep('pk-canvas >>> pk-button[part="in"]'); // the element changes the view: pk-view-change, and the bound Zoom follows
        await shown(ctx, 'lab-view', 'changes: 1');
        ctx.ok(await ctx.eval(`!document.getElementById('lab-view').textContent.includes('zoom 1,')`), 'the bound Zoom stayed 1 after the zoom-in button');
        await ctx.eval(`document.querySelector('pk-canvas').shadowRoot.querySelector('[part="frame"]').focus()`);
        await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
        await ctx.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
        await shown(ctx, 'lab-canvas-events', 'key: Delete');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'side-nav-open-close',
      async run(ctx) {
        await ctx.open('/lab/nav');
        await live(ctx, 'pk-side-nav', 'show'); // upgraded
        const open = `document.querySelector('pk-side-nav').hasAttribute('open')`;
        await ctx.clickDeep('pk-button', 'Open by parameter'); // C# to the element
        await ctx.waitFor(open, 'the nav to open when Open turned true');
        await shown(ctx, 'lab-nav', 'open True');
        await ctx.clickDeep('pk-button', 'Close by parameter');
        await ctx.waitFor(`!(${open})`, 'the nav to close when Open turned false');
        await shown(ctx, 'lab-nav', 'open False');
        await ctx.clickDeep('pk-button', 'Open by parameter');
        await ctx.waitFor(open, 'the nav to open again');
        await ctx.eval(`document.querySelector('pk-side-nav').shadowRoot.querySelector('[part="backdrop"]').click()`); // the element closes itself: pk-close back to C#
        await ctx.waitFor(`!(${open})`, 'the nav to close from its backdrop');
        await shown(ctx, 'lab-nav', 'open False');
        await ctx.clickDeep('pk-side-nav >>> [part="collapse"]'); // the element collapses: Collapsed and OnToggle follow
        await shown(ctx, 'lab-nav', 'collapsed True, toggles: 1');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'image-gallery-pointer-reorder',
      async run(ctx) {
        await ctx.open('/lab/drag');
        await live(ctx, 'pk-image-gallery', 'images');
        const handles = `@[...document.querySelector('pk-image-gallery').shadowRoot.querySelectorAll('pk-sortable-item')].map(i => i.shadowRoot.querySelector('[part="handle"]'))`; // the tiles are in the gallery's shadow tree
        await ctx.waitFor(`document.querySelector('pk-image-gallery').shadowRoot.querySelectorAll('pk-sortable-item').length === 3`, 'the gallery tiles');
        const first = [handles, 0], third = [handles, 2];
        await drag(ctx, first, third); // press the first tile's handle, release on the third's
        await shown(ctx, 'lab-reorder', 'reorders: 1');
        ctx.ok(await ctx.eval(`!document.getElementById('lab-reorder').textContent.includes('Gallery: a,b,c')`), 'the drag reported a reorder but the order did not change');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
    { name: 'kanban-pointer-move',
      async run(ctx) {
        await ctx.open('/lab/drag');
        await live(ctx, 'pk-kanban', 'dragging');
        await ctx.waitFor(`window.__deep.q('pk-kanban pk-sortable-item').length === 2`, 'the board cards');
        await drag(ctx, ['pk-kanban pk-sortable-item >>> [part="handle"]', 0], ['pk-kanban-column[value="done"]', 0]); // the first card into the empty Done column
        await shown(ctx, 'lab-move', 'moves: 1, last: t1 todo>done');
        ctx.noErrors(ctx.openMark, BENIGN);
      } },
];

/** Screenshots of the lab pages added here, for the plan in blazor-browser-cases.mjs. */
export const ELEMENT_SHOTS = [
    async (ctx, vp, theme) => { await ctx.open('/lab/props'); await ctx.waitFor(`window.__deep.q('pk-code-view >>> .tk-keyword').length > 0`, 'the code colouring'); await ctx.shot('lab-props', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/canvas'); await ctx.waitFor(`!!document.querySelector('pk-design-surface')?.selected`, 'the surface selection'); await ctx.shot('lab-canvas', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/drag'); await ctx.waitFor(`document.querySelector('pk-image-gallery').shadowRoot.querySelectorAll('pk-sortable-item').length === 3`, 'the gallery tiles'); await ctx.shot('lab-drag', vp, theme); },
    async (ctx, vp, theme) => { await ctx.open('/lab/nav'); await ctx.shot('lab-nav', vp, theme); },
];
