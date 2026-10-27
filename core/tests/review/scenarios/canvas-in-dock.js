// pk-canvas inside pk-dock (#430 phase C6): a toolbox panel, the canvas in the centre panel with three shapes, a properties panel. The canvas stays inside its panel, the
// panels do not overlap, the selection outline stays inside the canvas, and after the viewport shrinks to a phone the canvas still has a size.
const SURFACE = '#surface >>> [part=frame]';
const SEL = '#surface >>> [part=selection] > [data-sel]';
const shape = (id, x, label) => `<rect id="${id}" data-id="${id}" x="${x}" y="40" width="60" height="40" tabindex="0" role="button" aria-label="${label}" fill="currentColor" fill-opacity="0.15"></rect>`;

export default {
    name: 'canvas-in-dock',
    issue: [430],
    elements: ['canvas', 'dock'],
    html: `<div class="rv-bounded"><pk-dock id="d" label="Editor" fill>
<div slot="tools" data-heading="Toolbox" data-group="left">Toolbox</div>
<div slot="canvas" data-heading="Canvas" data-group="center"><pk-canvas id="surface" label="Drawing" selectable auto-grid><div dir="ltr"><svg width="400" height="200">${shape('one', 20, 'Shape one')}${shape('two', 120, 'Shape two')}${shape('three', 220, 'Shape three')}</svg></div></pk-canvas></div>
<div slot="props" data-heading="Properties" data-group="right">Properties</div>
</pk-dock></div>`,
    steps: [
        { wait: 300 }, { shot: 'rest' },
        { click: '#two' }, { wait: 100 }, { shot: 'selected' },
        { key: 'ArrowRight' }, { wait: 100 }, { shot: 'nudged' },
        { resize: 375 }, { wait: 300 }, { shot: 'phone' },
    ],
    expect(t) {
        t.visible(SURFACE, 'the canvas surface');
        const panel = t.rect('#d [slot=canvas]'), canvas = t.rect('#surface');
        t.ok(canvas && canvas.width > 40 && canvas.height > 40, 'the canvas has a size');
        if (t.shot !== 'phone') {
            t.within('#surface', '#d [slot=canvas]');
            t.noOverlap('#d [slot=tools]', '#d [slot=canvas]'); t.noOverlap('#d [slot=canvas]', '#d [slot=props]'); t.noOverlap('#d [slot=tools]', '#d [slot=props]');
        } else t.ok(panel && canvas && canvas.width <= panel.width + 1, 'on a phone the canvas still fits its panel');
        if (t.shot === 'selected' || t.shot === 'nudged') { t.visible(SEL, 'the selection outline'); t.within(SEL, '#surface'); }
    },
};
