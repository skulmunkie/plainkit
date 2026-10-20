// pk-canvas rulers and the adaptive grid (#430 phase C2): millimetre rulers with a major and a minor grid at rest, zoomed in and out (the grid and the labels stay readable), and in a right-to-left page (nothing mirrors). Rulers are hidden on a phone.
const F = '#surface >>> [part=frame]';
const RS = '#surface >>> [part=rulers]';
const IN = '#surface >>> [part=in]';
const OUT = '#surface >>> [part=out]';

export default {
    name: 'canvas-rulers',
    issue: [430, 1660],
    elements: ['canvas', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Sign layout" unit="mm" rulers auto-grid pan-x="60" pan-y="48"><pk-card id="node" data-surface-selected><h3>Sign</h3><p>Zoom: the grid and the rulers keep their spacing readable.</p></pk-card></pk-canvas></div>`,
    steps: [
        { wait: 200 }, { shot: 'resting' },
        { click: IN }, { click: IN }, { click: IN }, { wait: 100 }, { shot: 'zoomed-in' },
        { click: OUT }, { click: OUT }, { click: OUT }, { click: OUT }, { click: OUT }, { wait: 100 }, { shot: 'zoomed-out' },
        { set: '#wrap', attr: 'dir', value: 'rtl' }, { wait: 100 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible(F, 'the surface');
        if (t.viewport.name === 'phone') return;
        t.visible(RS, 'the rulers');
        t.within(RS, F);
        const fr = t.rect(F), rs = t.rect(RS);
        if (fr && rs) t.ok(Math.abs(rs.x - fr.x) <= 2 && Math.abs(rs.y - fr.y) <= 2, 'the rulers start at the frame top-left, also in a right-to-left page');
    },
};
