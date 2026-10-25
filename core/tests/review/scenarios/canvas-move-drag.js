// pk-canvas move by pointer (#430 phase C4): a selected item dragged by 80 by 60 px; the page writes each pk-canvas-move back, so mid-drag the item and
// its selection frame have moved together.
const F = '#surface >>> [part=frame]';
const SEL = '#surface >>> [part=selection] > [data-sel]';

export default {
    name: 'canvas-move-drag',
    issue: [430],
    elements: ['canvas'],
    viewports: ['desktop'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable grid="20" selection='["table"]'><svg width="360" height="300"><rect id="table" data-id="table" x="40" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect></svg></pk-canvas></div>`,
    async setup(frame) {
        const s = frame.querySelector('#surface');
        s.addEventListener('pk-canvas-move', e => { for (const m of e.detail.moves) { const el = s.querySelector(`[data-id="${m.id}"]`); el.setAttribute('x', m.x); el.setAttribute('y', m.y); } });
        for (let i = 0; i < 100 && !s.$L?.select; i++) await new Promise(r => setTimeout(r, 30));
        await s.$L.select;
        const item = s.querySelector('#table'), r = item.getBoundingClientRect(), fr = s.part('frame');
        const at = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 3, bubbles: true, button: 0, isPrimary: true, clientX: r.left + x, clientY: r.top + y }));
        at(item, 'pointerdown', 10, 10); at(fr, 'pointermove', 50, 40); at(fr, 'pointermove', 90, 70);
    },
    steps: [{ wait: 200 }, { shot: 'dragging' }],
    expect(t) {
        t.visible(SEL, 'the selection frame');
        const box = t.rect(SEL), item = t.rect('#table');
        if (box && item) t.ok(Math.abs(box.x - item.x) <= 3 && Math.abs(box.y - item.y) <= 3, 'the frame moves with the item during the drag');
        t.within(SEL, F);
    },
};
