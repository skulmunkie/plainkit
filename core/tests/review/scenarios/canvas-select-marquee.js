// pk-canvas marquee (#430 phase C3): a primary drag on bare ground draws a rubber band and does not pan. The page cannot press a button across steps, so setup() starts the drag and leaves it held; the shot is the marquee mid-drag.
const F = '#surface >>> [part=frame]';
const M = '#surface >>> [part=marquee]';

export default {
    name: 'canvas-select-marquee',
    issue: [430],
    elements: ['canvas'],
    viewports: ['desktop'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable auto-grid><svg width="360" height="200"><rect data-id="table" x="40" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect><rect data-id="door" x="220" y="60" width="80" height="60" tabindex="0" role="button" aria-label="Door" fill="currentColor" fill-opacity="0.15"></rect></svg></pk-canvas></div>`,
    async setup(frame) {
        const s = frame.querySelector('#surface');
        for (let i = 0; i < 100 && !s.$L?.select; i++) await new Promise(r => setTimeout(r, 30));
        await s.$L.select;
        const fr = s.part('frame'), r = fr.getBoundingClientRect(), at = (type, x, y) => fr.dispatchEvent(new PointerEvent(type, { pointerId: 3, bubbles: true, button: 0, isPrimary: true, clientX: r.left + x, clientY: r.top + y }));
        at('pointerdown', 20, 20); at('pointermove', 200, 120);
    },
    steps: [{ wait: 200 }, { shot: 'dragging' }],
    expect(t) {
        t.visible(M, 'the marquee');
        t.within(M, F);
    },
};
