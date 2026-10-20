// pk-canvas: a pan and zoom ground. Resting with a grid, zoomed in through the toolbar, panned with the keyboard, the keyboard focus ring, fitted to the content with the 1 key, the arrows mirrored in a right-to-left page, and the toolbar folded to icons on a phone. (The plain wheel passing through to the page is measured in the browser cases.)
const S = '#surface';
const F = '#surface >>> [part=frame]';
const TB = '#surface >>> [part=toolbar]';
const IN = '#surface >>> [part=in]';
const OUT = '#surface >>> [part=out]';
const RESET = '#surface >>> [part=reset]';
const MARK = '#surface >>> [part=overlay] > div';

export default {
    name: 'canvas',
    issue: [430],
    elements: ['canvas', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Artboard" grid="20"><pk-card id="node" data-surface-selected><h3>Order summary</h3><p>Drag the ground to pan, pinch or press plus to zoom.</p></pk-card></pk-canvas></div>`,
    steps: [
        { shot: 'resting' },
        { focus: F }, { shot: 'focus' },
        { click: IN }, { click: IN }, { shot: 'zoomed-in' },
        { focus: F }, { key: 'ArrowRight', times: 2 }, { key: 'ArrowDown' }, { shot: 'panned' },
        { click: OUT }, { shot: 'zoomed-out' },
        { click: RESET }, { shot: 'reset' },
        { focus: F }, { key: '1' }, { shot: 'fit' },
        { click: RESET }, { set: '#wrap', attr: 'dir', value: 'rtl' }, { focus: F }, { key: 'ArrowLeft' }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible(F, 'the surface'); t.visible(TB, 'the toolbar');
        t.inViewport(TB); t.within(TB, F);
        if (t.shot === 'resting' || t.shot === 'focus' || t.shot === 'reset' || t.shot === 'fit') t.within(MARK, F); // zoomed and panned, the node legitimately leaves the frame
        if (t.shot === 'focus') { t.ringVisible(F); }
        if (t.shot === 'fit') { const m = t.rect('#surface >>> [part=world]'), fr = t.rect(F); if (m && fr) t.ok(Math.abs((m.x + m.width / 2) - (fr.x + fr.width / 2)) <= 2 && Math.abs((m.y + m.height / 2) - (fr.y + fr.height / 2)) <= 2, 'the fitted content is centred in the surface'); }
        if (t.viewport.name === 'phone') {
            for (const b of [IN, OUT, RESET]) { const r = t.rect(b); if (r) t.ok(r.width >= 44 && r.height >= 44, `${b} is at least 44px (${Math.round(r.width)}x${Math.round(r.height)})`); }
        }
    },
};
