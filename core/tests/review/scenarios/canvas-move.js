// pk-canvas move (#430 phase C4): the selected item moves by the arrow keys (a grid step each, Shift ten); the page writes the position back on
// pk-canvas-move and the selection frame follows it.
const F = '#surface >>> [part=frame]';
const SEL = '#surface >>> [part=selection] > [data-sel]';

export default {
    name: 'canvas-move',
    issue: [430],
    elements: ['canvas'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable grid="20" selection='["table"]'><svg width="360" height="300"><rect id="table" data-id="table" x="40" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect></svg></pk-canvas></div>`,
    setup(frame) {
        const s = frame.querySelector('#surface');
        s.addEventListener('pk-canvas-move', e => { for (const m of e.detail.moves) { const el = s.querySelector(`[data-id="${m.id}"]`); el.setAttribute('x', m.x); el.setAttribute('y', m.y); } });
    },
    steps: [{ wait: 300 }, { focus: '#table' }, { key: 'ArrowRight', times: 3 }, { key: 'Shift+ArrowDown' }, { wait: 100 }, { shot: 'nudged' }],
    expect(t) {
        t.visible(SEL, 'the selection frame');
        const box = t.rect(SEL), item = t.rect('#table');
        if (box && item) t.ok(Math.abs(box.x - item.x) <= 3 && Math.abs(box.y - item.y) <= 3, 'the frame follows the moved item');
        t.within(SEL, F);
    },
};
