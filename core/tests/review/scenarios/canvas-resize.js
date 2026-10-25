// pk-canvas resize handles (#430 phase C4): a single selected item shows eight handles on its frame, inside the surface, desktop and phone (each has a
// 44px hit area through ::before; the drawn square is small).
const F = '#surface >>> [part=frame]';
const SEL = '#surface >>> [part=selection] > [data-sel]';
const H = n => `#surface >>> [part=selection] > [data-handle="${n}"]`;

export default {
    name: 'canvas-resize',
    issue: [430],
    elements: ['canvas'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable grid="20" selection='["table"]'><svg width="360" height="300"><rect id="table" data-id="table" x="40" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect></svg></pk-canvas></div>`,
    steps: [{ wait: 300 }, { waitFor: H('se') }, { shot: 'handles' }],
    expect(t) {
        t.visible(SEL, 'the selection frame');
        for (const n of ['nw', 'se']) { t.visible(H(n), `the ${n} handle`); t.within(H(n), F); }
        const box = t.rect(SEL), se = t.rect(H('se'));
        if (box && se) t.ok(Math.abs(se.x + se.width / 2 - (box.x + box.width)) <= 3 && Math.abs(se.y + se.height / 2 - (box.y + box.height)) <= 3, 'the se handle sits on the frame corner');
    },
};
