// pk-canvas snapping (#430 phase C5): the table is dragged towards the door with snap="edges guides"; mid-drag its right edge is held on the door's
// left edge, a snap line is drawn there, and the dashed guide crosses the surface. The page writes each pk-canvas-move back.
const F = '#surface >>> [part=frame]';
const SNAP = '#surface >>> [part=selection] > [part="snap-line"]';
const GUIDE = '#surface >>> [part=selection] > [part="guide"]';

export default {
    name: 'canvas-snap',
    issue: [430],
    elements: ['canvas'],
    viewports: ['desktop'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable snap="edges guides" guides='[{"axis":"y","at":180}]' selection='["table"]'><svg width="420" height="300"><rect id="table" data-id="table" x="20" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect><rect id="door" data-id="door" x="260" y="60" width="80" height="60" tabindex="0" role="button" aria-label="Door" fill="currentColor" fill-opacity="0.15"></rect></svg></pk-canvas></div>`,
    async setup(frame) {
        const s = frame.querySelector('#surface');
        s.addEventListener('pk-canvas-move', e => { for (const m of e.detail.moves) { const el = s.querySelector(`[data-id="${m.id}"]`); el.setAttribute('x', m.x); el.setAttribute('y', m.y); } });
        for (let i = 0; i < 100 && !s.$L?.select; i++) await new Promise(r => setTimeout(r, 30));
        await s.$L.select;
        const item = s.querySelector('#table'), r = item.getBoundingClientRect(), fr = s.part('frame');
        const at = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 3, bubbles: true, button: 0, isPrimary: true, clientX: r.left + x, clientY: r.top + y }));
        at(item, 'pointerdown', 10, 10); at(fr, 'pointermove', 60, 10); at(fr, 'pointermove', 128, 12);
    },
    steps: [{ wait: 200 }, { shot: 'snapped' }],
    expect(t) {
        t.visible(SNAP, 'a snap line while the drag is held');
        t.visible(GUIDE, 'the guide');
        const line = t.rect(SNAP), door = t.rect('#door'), table = t.rect('#table');
        if (line && door) t.ok(Math.abs(line.x - door.x) <= 2, 'the snap line is on the door\'s left edge');
        if (table && door) t.ok(Math.abs(table.x + table.width - door.x) <= 2, 'the table\'s right edge meets it');
        t.within(SNAP, F);
    },
};
