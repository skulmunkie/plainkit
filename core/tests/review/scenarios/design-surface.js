// pk-design-surface: a pan and zoom ground. Resting with a grid, zoomed in through the toolbar, panned with the keyboard, the keyboard focus ring, and the toolbar folded to icons on a phone.
const S = '#surface';
const F = '#surface >>> [part=frame]';
const TB = '#surface >>> [part=toolbar]';
const IN = '#surface >>> [part=in]';
const OUT = '#surface >>> [part=out]';
const RESET = '#surface >>> [part=reset]';
const MARK = '#surface >>> [part=overlay] > div';

export default {
    name: 'design-surface',
    issue: [430],
    elements: ['design-surface', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-design-surface id="surface" label="Artboard" grid="20"><pk-card id="node" data-surface-selected><h3>Order summary</h3><p>Drag the ground to pan, pinch or press plus to zoom.</p></pk-card></pk-design-surface></div>`,
    steps: [
        { shot: 'resting' },
        { focus: F }, { shot: 'focus' },
        { click: IN }, { click: IN }, { wait: 200 }, { shot: 'zoomed-in' },
        { focus: F }, { key: 'ArrowRight', times: 2 }, { key: 'ArrowDown' }, { wait: 200 }, { shot: 'panned' },
        { click: OUT }, { wait: 200 }, { shot: 'zoomed-out' },
        { click: RESET }, { wait: 200 }, { shot: 'reset' },
    ],
    expect(t) {
        t.visible(F, 'the surface'); t.visible(TB, 'the toolbar');
        t.inViewport(TB); t.within(TB, F);
        if (t.shot === 'resting' || t.shot === 'focus' || t.shot === 'reset') t.within(MARK, F); // zoomed and panned, the node legitimately leaves the frame
        if (t.shot === 'focus') { t.ringVisible(F); }
        if (t.viewport.name === 'phone') {
            for (const b of [IN, OUT, RESET]) { const r = t.rect(b); if (r) t.ok(r.width >= 44 && r.height >= 44, `${b} is at least 44px (${Math.round(r.width)}x${Math.round(r.height)})`); }
        }
    },
};
