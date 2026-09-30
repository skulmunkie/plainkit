// The layout builder on pk-dock (issue 432): the resting workspace (Palette, Structure and HTML tabs | canvas | Properties) under the dock toolbar holding the
// builder's own File and Edit menus, the Edit menu open (accelerators as plain text), the canvas's right-click menu open at an element, and, in the phone
// viewport, the dock's one tab strip with the menus still in its toolbar and the Canvas tab chosen.
const PAGE = '<pk-stack gap="md"><h2>Welcome</h2><p>A short introduction.</p><pk-card heading="Next step"><p>Waiting for review.</p></pk-card></pk-stack>';
const DOCK = '#host pk-dock';

export default {
    name: 'layout-builder',
    elements: ['dock', 'dropdown', 'menu-item', 'context-menu'],
    issue: 432,
    html: '<div id="host"></div>',
    async setup(frame) {
        // Imported here, not at the top: the scenario module is also loaded in Node, where the builder's DOM code must not run.
        const { mountLayoutBuilder } = await import('../../../modules/layout-builder/layout-builder.js');
        const host = frame.querySelector('#host');
        await mountLayoutBuilder(host, { html: PAGE, onsave: () => {} });
        // A right click has no declarative step: this setter dispatches one at the middle of the page's heading, as the browser would.
        Object.defineProperty(host, 'demoContext', { set() {
            const h2 = host.querySelector('.lb-page h2'), r = h2.getBoundingClientRect();
            host.querySelector('.lb-canvas').dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, composed: true, cancelable: true }));
        } });
    },
    steps: [
        { wait: 'settle' }, 
        { shot: 'rest' },
        { click: '#host pk-dropdown[data-menu="edit"] pk-button[slot="trigger"]' }, 
        { shot: 'edit-menu' },
        { key: 'Escape' }, 
        { click: `${DOCK} >>> pk-tab[value="canvas"]`, on: ['phone'] }, 
        { shot: 'phone-canvas', on: ['phone'] },
        { set: '#host', prop: 'demoContext', value: true }, 
        { shot: 'context-menu' },
    ],
    expect(t) {
        t.ok(t.metric(':root', 'scrollHeight') <= t.viewport.height + 1, 'the page does not scroll: the dock scrolls its panels inside itself');
        t.inViewport(DOCK);
        t.visible(`${DOCK} >>> [part=toolbar]`, 'the dock toolbar holds the builder\'s menus');
        t.within('#host pk-dropdown[data-menu="file"]', `${DOCK} >>> [part=toolbar]`);
        t.within('#host pk-dropdown[data-menu="edit"]', `${DOCK} >>> [part=toolbar]`);
        t.sameRow('#host pk-dropdown[data-menu="file"] pk-button[slot="trigger"]', '#host pk-dropdown[data-menu="edit"] pk-button[slot="trigger"]');
        t.noOverlap('#host pk-dropdown[data-menu="file"]', '#host pk-dropdown[data-menu="edit"]');
        t.ok(t.metric(DOCK, 'scrollWidth') <= t.metric(DOCK, 'clientWidth') + 1, 'the dock does not overflow sideways');
        if (t.viewport.name === 'desktop') {
            t.exists(`${DOCK} >>> pk-splitter`);
            t.noOverlap('#host .lb-panel[slot="palette"]', '#host .lb-panel[slot="canvas"]');
            t.noOverlap('#host .lb-panel[slot="canvas"]', '#host .lb-panel[slot="properties"]');
            // Tops, not centres: the palette is taller than its group and scrolls inside it.
            const c = t.rect('#host .lb-panel[slot="canvas"]'), p = t.rect('#host .lb-panel[slot="palette"]'), q = t.rect('#host .lb-panel[slot="properties"]');
            if (c && p && q) {
                t.ok(Math.abs(c.y - q.y) < 2 && Math.abs(p.y - c.y) < 60, 'palette, canvas and properties start on one row');
                t.ok(p.right <= c.x + 1 && c.right <= q.x + 1, 'palette | canvas | properties, left to right');
                t.ok(c.width > p.width && c.width > q.width, 'the canvas is the widest panel');
            }
        }
        if (t.viewport.name === 'phone') {
            t.absent(`${DOCK} >>> pk-splitter`);
            t.ok(t.metric(DOCK, 'scrollWidth') <= t.viewport.width, 'no horizontal overflow on a phone');
        }
        if (t.shot === 'edit-menu') {
            t.visible('#host pk-dropdown[data-menu="edit"] >>> [part=menu]', 'the Edit menu opened');
            t.inViewport('#host pk-dropdown[data-menu="edit"] >>> [part=menu]');
            t.hasText('#host pk-dropdown[data-menu="edit"] pk-menu-item[data-action="undo"]', 'Ctrl+Z');
        }
        if (t.shot === 'phone-canvas' || t.shot === 'context-menu') t.visible('#host .lb-canvas', 'the canvas shows');
        if (t.shot === 'context-menu') {
            t.visible('#host pk-context-menu.lb-canvas-menu >>> [part=menu]', 'the canvas context menu opened');
            t.inViewport('#host pk-context-menu.lb-canvas-menu >>> [part=menu]');
            t.exists('#host .lb-page h2[data-lb-selected]');
        }
    },
};
