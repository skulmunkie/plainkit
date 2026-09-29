// pk-dock (issue 432, step 1; issue 609 adds header-collapse; issue 608 step 1 adds collapse-to-rail and its flyout): the resting workspace (tab group | canvas |
// properties), a separator moved by keyboard and by pointer, a tab chosen in the left group, a single-panel header's chevron collapsed then expanded by keyboard, the
// right column (an edge group) collapsed to a rail button and its flyout opened then closed with Escape, the same workspace mirrored right to left, and (in the phone
// viewport, where the tree becomes one tab strip) the strip with a panel chosen. The dock applies nothing to the panels themselves: they are the page's own children, slotted.
// The left group carries four panels (issue #602): at its default ~20% split width its tab list must scroll sideways instead of wrapping onto a second row, and the
// same reading-order tab list (all six panels, on a phone) must stay on one row too.
const PANELS = `
  <div slot="tools" data-heading="Toolbox" data-group="left" class="stack"><strong>Toolbox</strong><span>Select</span><span>Rectangle</span><span>Text</span></div>
  <div slot="assets" data-heading="Assets" data-group="left" class="stack"><strong>Assets</strong><span>logo.svg</span><span>hero.png</span></div>
  <div slot="layers" data-heading="Layers" data-group="left" class="stack"><strong>Layers</strong><span>Background</span><span>Foreground</span></div>
  <div slot="styles" data-heading="Styles" data-group="left" class="stack"><strong>Styles</strong><span>Primary</span><span>Secondary</span></div>
  <div slot="canvas" data-heading="Canvas" class="stack"><strong>Canvas</strong><span>The middle panel takes the space the side panels leave.</span></div>
  <div slot="props" data-heading="Properties" data-group="right" class="stack"><strong>Properties</strong><span>Width 120</span><span>Height 80</span></div>`;

export default {
    name: 'dock',
    elements: ['dock', 'splitter', 'tabs', 'tab', 'tab-panel'],
    html: `<pk-dock id="dock" label="Editor workspace">${PANELS}</pk-dock>
<pk-dock id="bottom" label="Project workspace"><div slot="files" data-heading="Files" data-group="left">app.js</div><div slot="editor" data-heading="Editor">Editor</div><div slot="log" data-heading="Log" data-group="bottom">Ready.</div></pk-dock>`,
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
        t.inViewport('#dock');
        t.exists('#dock >>> [part=group]');
        t.visible('#dock >>> [part=group]', 'the dock draws its groups');
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
