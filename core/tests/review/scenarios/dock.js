// pk-dock (issue 432, step 1; step 2's keyboard/menu move, close/reopen; issue 607's pointer drag-to-dock; issue 609's header-collapse; issue 608 step 1's
// collapse-to-rail and its flyout): the resting workspace (tab group | canvas | properties), a separator moved by keyboard and by pointer, a tab chosen in the
// left group, a pointer drag-to-dock of Canvas's header toward Properties (shown mid-drag over its center and its left edge, each with the accent drop-zone
// highlight; cancelled rather than dropped, so later steps' layout is untouched - the browser suite covers the actual dropped result), the keyboard/menu move
// of a panel between groups (a group's panel menu opened by keyboard) and close/reopen (Close in that same menu, then the toolbar's Panels menu to bring it
// back), a single-panel header's chevron collapsed then expanded by keyboard, the right column (an edge group) collapsed to a rail button and its flyout
// opened then closed with Escape, the same workspace mirrored right to left, and (in the phone viewport, where the tree becomes one tab strip) the strip with
// a panel chosen. The dock applies nothing to the panels themselves: they are the page's own children, slotted.
// The left group carries four panels (issue #602): at its default ~20% split width its tab list must scroll sideways instead of wrapping onto a second row, and the
// same reading-order tab list (all six panels, on a phone) must stay on one row too.
const PANELS = `
  <div slot="tools" data-heading="Toolbox" data-group="left" class="stack"><strong>Toolbox</strong><span>Select</span><span>Rectangle</span><span>Text</span></div>
  <div slot="assets" data-heading="Assets" data-group="left" class="stack"><strong>Assets</strong><span>logo.svg</span><span>hero.png</span></div>
  <div slot="layers" data-heading="Layers" data-group="left" class="stack"><strong>Layers</strong><span>Background</span><span>Foreground</span></div>
  <div slot="styles" data-heading="Styles" data-group="left" class="stack"><strong>Styles</strong><span>Primary</span><span>Secondary</span></div>
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
        // A pointer drag of Canvas's header toward Properties, one call per state: grab it, move over the target's center (the "add as tab" zone) or
        // its left edge (a dockPanel zone), or cancel. Cancelling (rather than dropping) leaves the layout untouched for every step after this one.
        Object.defineProperty(dock, 'demoPanelDrag', { set(state) {
            const root = dock.shadowRoot.querySelector('[part=root]'), groups = [...root.querySelectorAll('[part=group]')];
            const byTitle = title => groups.find(g => g.querySelector('[part=title]')?.textContent === title);
            const header = byTitle('Canvas')?.querySelector('[part=header]'), target = byTitle('Properties');
            if (!header || !target) return;
            const fr = header.getBoundingClientRect(), tr = target.getBoundingClientRect();
            const ptr = (type, x, y) => header.dispatchEvent(new PointerEvent(type, { pointerId: 8, clientX: x, clientY: y, button: 0, bubbles: true, composed: true }));
            if (state === 'start') ptr('pointerdown', fr.left + fr.width / 2, fr.top + fr.height / 2);
            else if (state === 'center') ptr('pointermove', tr.left + tr.width / 2, tr.top + tr.height / 2);
            else if (state === 'left') ptr('pointermove', tr.left + 2, tr.top + tr.height / 2);
            else if (state === 'cancel') ptr('pointercancel', 0, 0);
        } });
    },
    steps: [
        { shot: 'rest' },
        { focus: '#dock >>> pk-splitter >>> [part=handle]', on: ['desktop'] }, { key: 'ArrowRight', times: 3, on: ['desktop'] }, { wait: 100 },
        { shot: 'keyboard', on: ['desktop'] },
        { set: '#dock', prop: 'demoDrag', value: 'release', on: ['desktop'] }, { wait: 100 },
        { shot: 'pointer', on: ['desktop'] },
        { set: '#dock', prop: 'demoPanelDrag', value: 'start', on: ['desktop'] },
        { set: '#dock', prop: 'demoPanelDrag', value: 'center', on: ['desktop'] }, { wait: 100, on: ['desktop'] },
        { shot: 'drag-center', on: ['desktop'] },
        { set: '#dock', prop: 'demoPanelDrag', value: 'left', on: ['desktop'] }, { wait: 100, on: ['desktop'] },
        { shot: 'drag-edge', on: ['desktop'] },
        { set: '#dock', prop: 'demoPanelDrag', value: 'cancel', on: ['desktop'] }, { wait: 100, on: ['desktop'] },
        { click: '#dock >>> pk-tab:last-of-type' }, { wait: 150 },
        { shot: 'tab' },
        { focus: '#dock >>> [data-panel=canvas]', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'collapsed', on: ['desktop'] },
        { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'expanded', on: ['desktop'] },
        // Issue #608, step 1: the right column (an edge group) folds to a rail button instead of a header when collapsed; activating it opens the
        // panel as a flyout over the content area.
        { focus: '#dock >>> [data-panel=props]', on: ['desktop'] }, { key: 'Enter', on: ['desktop'] }, { wait: 150 },
        { shot: 'rail', on: ['desktop'] },
        { click: '#dock >>> [part=rail-button]', on: ['desktop'] }, { wait: 150 },
        { shot: 'flyout-open', on: ['desktop'] },
        { key: 'Escape', on: ['desktop'] }, { wait: 150 },
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
            // Issue #602: the left group's tab list (four panels in a narrow, ~20%-wide column) scrolls sideways instead of wrapping onto a second row.
            t.ok(t.metric('#dock >>> pk-tabs >>> [part=list]', 'scrollHeight') <= t.metric('#dock >>> pk-tabs >>> [part=list]', 'clientHeight') + 1, 'the narrow group tab list wraps onto a second row instead of scrolling');
        }
        if (t.viewport.name === 'phone') {
            t.absent('#dock >>> pk-splitter');
            t.ok(t.metric('#dock', 'scrollWidth') <= t.viewport.width, 'no horizontal overflow on a phone');
            // Issue #602: the reading-order strip (all six panels) stays on one scrollable row.
            t.ok(t.metric('#dock >>> pk-tabs >>> [part=list]', 'scrollHeight') <= t.metric('#dock >>> pk-tabs >>> [part=list]', 'clientHeight') + 1, 'the phone tab strip wraps onto a second row instead of scrolling');
        }
        if (t.shot === 'keyboard' || t.shot === 'pointer') t.hidden('#dock >>> [part=empty]');
        if (t.shot === 'drag-center') {
            t.exists('#dock >>> [part=group][drop-zone="center"]', 'the target group is marked with the center drop zone while the pointer hovers its middle');
            t.absent('#dock >>> [part=group][drop-zone="left"]');
        }
        if (t.shot === 'drag-edge') {
            t.exists('#dock >>> [part=group][drop-zone="left"]', 'the target group is marked with the left edge drop zone while the pointer hovers its edge');
            t.absent('#dock >>> [part=group][drop-zone="center"]');
        }
        if (t.shot === 'collapsed') {
            t.ok(t.attr('#dock >>> [data-panel=canvas]', 'aria-expanded') === 'false', 'the toggle reports collapsed');
            t.hidden('#dock >>> #b-canvas', 'the collapsed body is hidden');
            t.visible('#dock >>> #h-canvas', 'the header stays, showing only the title and chevron');
        }
        if (t.shot === 'expanded') {
            t.ok(t.attr('#dock >>> [data-panel=canvas]', 'aria-expanded') === 'true', 'the toggle reports expanded again');
            t.visible('#dock >>> #b-canvas', 'the body is back');
        }
        if (t.shot === 'rail') {
            t.exists('#dock >>> [part=rail-button]');
            t.visible('#dock >>> [part=rail-button]', 'the collapsed right column shows a rail button');
            t.absent('#dock >>> [data-panel=props]', 'no header chevron is left for it');
            t.ok(t.attr('#dock >>> [part=rail-button]', 'aria-expanded') === 'false', 'the flyout is not open yet');
        }
        if (t.shot === 'flyout-open') {
            t.ok(t.attr('#dock >>> [part=rail-button]', 'aria-expanded') === 'true', 'the rail button reports the flyout open');
            t.visible('#dock >>> [part=flyout]', 'the flyout is shown');
            t.visible('[slot=props]', 'the panel content is shown inside the flyout');
            // positioning.js flips sides to stay in the viewport, so the flyout can land to either side of the rail button; it must not cover it either way.
            t.noOverlap('#dock >>> [part=rail-button]', '#dock >>> [part=flyout]');
            t.ringUnclipped('#dock >>> [part=flyout]');
        }
        const bottom = t.rect('#bottom');
        if (bottom) t.ok(bottom.width <= t.viewport.width + 1, 'the stacked dock fits the viewport');
    },
};
