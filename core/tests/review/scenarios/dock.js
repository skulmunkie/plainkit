// pk-dock (issue 432): step 1's resting workspace (tab group | canvas | properties), a separator moved by keyboard and by pointer, a tab chosen in the left group, the
// same workspace mirrored right to left, and (in the phone viewport, where the tree becomes one tab strip) the strip with a panel chosen; step 2's keyboard/menu move between
// groups (a group's panel menu opened by keyboard, and the panel it moves) and close/reopen (Close in that same menu, then the toolbar's Panels menu to bring it back).
// The dock applies nothing to the panels themselves: they are the page's own children, slotted.
const PANELS = `
  <div slot="tools" data-heading="Toolbox" data-group="left" class="stack"><strong>Toolbox</strong><span>Select</span><span>Rectangle</span><span>Text</span></div>
  <div slot="assets" data-heading="Assets" data-group="left" class="stack"><strong>Assets</strong><span>logo.svg</span><span>hero.png</span></div>
  <div slot="canvas" data-heading="Canvas" class="stack"><strong>Canvas</strong><span>The middle panel takes the space the side panels leave.</span></div>
  <div slot="props" data-heading="Properties" data-group="right" class="stack"><strong>Properties</strong><span>Width 120</span><span>Height 80</span></div>`;
// Placeholder content for toolbar-start: a host app's own top-level menus. pk-dock draws none of this; it is here only to show the slot laid out
// next to the dock's own Panels control, not to demonstrate a File/Edit/View menu (that is the layout-builder consumer's job, later, elsewhere).
const TOOLBAR_START = `<pk-button slot="toolbar-start" variant="ghost" size="mini">File</pk-button><pk-dropdown slot="toolbar-start"><pk-button slot="trigger" variant="ghost" size="mini">Edit</pk-button><pk-menu-item>Undo</pk-menu-item><pk-menu-item>Redo</pk-menu-item></pk-dropdown>`;

export default {
    name: 'dock',
    elements: ['dock', 'splitter', 'tabs', 'tab', 'tab-panel'],
    // Wrapped in .rv-bounded (core/tests/review/review.css): two stacked pk-dock examples are taller than one viewport, and the wrapper is what
    // scrolls, not the page (a host page embedding pk-dock is expected to size its own container the same way; pk-dock itself already fills a
    // definite height from its parent and scrolls its own content when fill is set, which is what this demonstrates).
    html: `<div class="rv-bounded">
<pk-dock id="dock" label="Editor workspace" fill>${TOOLBAR_START}${PANELS}</pk-dock>
<pk-dock id="bottom" label="Project workspace" fill><div slot="files" data-heading="Files" data-group="left">app.js</div><div slot="editor" data-heading="Editor">Editor</div><div slot="log" data-heading="Log" data-group="bottom">Ready.</div></pk-dock>
</div>`,
    setup(frame) {
        const dock = frame.querySelector('#dock');
        // A still screenshot of a drag needs the pointer events the separator listens to: grab it, move it to 45 percent of the room, release.
        Object.defineProperty(dock, 'demoDrag', { set(on) {
            const s = dock.shadowRoot.querySelector('pk-splitter'), h = s.part('handle'), root = s.part('root').getBoundingClientRect(), r = h.getBoundingClientRect();
            const ptr = (type, x) => h.dispatchEvent(new PointerEvent(type, { pointerId: 5, clientX: x, clientY: r.top + 5, button: 0, bubbles: true, composed: true }));
            ptr('pointerdown', r.left + r.width / 2);
            ptr('pointermove', root.left + r.width / 2 + (root.width - r.width) * 0.45);
            if (on === 'release') ptr('pointerup', 0);
        } });
    },
    steps: [
        { shot: 'rest' },
        { focus: '#dock >>> pk-splitter >>> [part=handle]', on: ['desktop'] }, { key: 'ArrowRight', times: 3, on: ['desktop'] }, { wait: 100 },
        { shot: 'keyboard', on: ['desktop'] },
        { set: '#dock', prop: 'demoDrag', value: 'release', on: ['desktop'] }, { wait: 100 },
        { shot: 'pointer', on: ['desktop'] },
        { click: '#dock >>> pk-tab:last-of-type' }, { wait: 150 },
        { shot: 'tab' },
        { focus: '#dock >>> [part=group] pk-button[slot=trigger]', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'move-menu', on: ['desktop'] },
        { click: '#dock >>> [part=group] pk-dropdown pk-menu-item:nth-of-type(2)', on: ['desktop'] }, { wait: 150 },
        { shot: 'move-done', on: ['desktop'] },
        // The Properties trigger is picked by its own accessible label (its group's panel menu names it), not by DOM position: every group sits
        // under its own single-child wrapper, so a position-based :last-of-type matches the first group everywhere, not the last in the page.
        // Close is the last item of the Properties menu (every other group's Move options come first): reach it with End rather than a click, since
        // the long list scrolls and a menu item below the fold has nothing to point a pointer step at.
        { focus: '#dock >>> pk-button[slot="trigger"][label="Properties panel menu"]', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { key: 'End', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'closed', on: ['desktop'] },
        { focus: '#dock >>> [part=toolbar] pk-button[slot=trigger]', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'reopened', on: ['desktop'] },
        { set: '#dock', attr: 'dir', value: 'rtl' }, { wait: 150 },
        { shot: 'rtl' },
    ],
    expect(t) {
        // The wrapper (.rv-bounded), not the page, carries any overflow from stacking two full examples: the document itself never grows past the
        // viewport just because a demo used more than one dock (a host page is expected to bound pk-dock's container the same way).
        t.ok(t.metric(':root', 'scrollHeight') <= t.viewport.height + 1, 'the page does not scroll: a tall demo scrolls inside its own bounded wrapper');
        t.inViewport('#dock');
        t.exists('#dock >>> [part=group]');
        t.visible('#dock >>> [part=group]', 'the dock draws its groups');
        if (t.shot === 'rest') {
            t.visible('#dock >>> [part=toolbar]', 'the toolbar renders even before anything is closed, once the host fills toolbar-start');
            t.visible('#dock [slot="toolbar-start"]', 'the host\'s own toolbar content (not the dock\'s) renders in it');
        }
        const d = t.rect('#dock');
        if (d && t.viewport.name === 'desktop') {
            t.exists('#dock >>> pk-splitter');
            t.ok(t.metric('#dock', 'scrollWidth') <= t.metric('#dock', 'clientWidth') + 1, 'the dock does not overflow sideways');
        }
        if (t.viewport.name === 'phone') {
            t.absent('#dock >>> pk-splitter');
            t.ok(t.metric('#dock', 'scrollWidth') <= t.viewport.width, 'no horizontal overflow on a phone');
        }
        if (t.shot === 'keyboard' || t.shot === 'pointer') t.hidden('#dock >>> [part=empty]');
        if (t.shot === 'move-menu') { t.visible('#dock >>> [part=group] pk-dropdown', 'the Move menu opened'); t.exists('#dock >>> [part=group] pk-menu-item'); }
        if (t.shot === 'move-done') { t.hidden('#dock >>> [part=empty]'); t.exists('#dock >>> [part=group]'); }
        if (t.shot === 'closed') {
            t.visible('#dock >>> [part=toolbar]', 'the Panels menu shows once something is closed');
            t.exists('#dock >>> [part=toolbar] pk-button[icon-name="dashboard"]', 'the Panels control appears next to the host\'s own toolbar-start content');
            t.noOverlap('#dock >>> [part=toolbar]', '#dock >>> [part=root]');
        }
        if (t.shot === 'reopened') {
            t.visible('#dock >>> [part=toolbar]', 'the toolbar stays up (the host\'s own content is still there)');
            t.absent('#dock >>> [part=toolbar] pk-button[icon-name="dashboard"]', 'but the dock\'s own Panels control is gone: nothing closed any more');
            t.hidden('#dock >>> [part=empty]');
        }
        const bottom = t.rect('#bottom');
        if (bottom) t.ok(bottom.width <= t.viewport.width + 1, 'the stacked dock fits the viewport');
    },
};
