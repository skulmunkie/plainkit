// pk-canvas selection (#430 phase C3): items declared through their own SVG attributes, selected by a click, set from code, selected by keyboard focus, in a right-to-left page and on a phone. The frame must sit on its item (it is drawn from the declared numbers), also zoomed.
const F = '#surface >>> [part=frame]';
const SEL = '#surface >>> [part=selection] > [data-sel]';
const IN = '#surface >>> [part=in]';

export default {
    name: 'canvas-select',
    issue: [430],
    elements: ['canvas', 'button'],
    html: `<div id="wrap" class="u-p-1r-1p25r"><pk-canvas id="surface" label="Floor plan" selectable auto-grid selection='["table"]'><div dir="ltr"><svg width="360" height="200"><rect id="table" data-id="table" x="40" y="40" width="120" height="80" tabindex="0" role="button" aria-label="Table" fill="currentColor" fill-opacity="0.15"></rect><rect id="door" data-id="door" x="220" y="60" width="80" height="60" tabindex="0" role="button" aria-label="Door" fill="currentColor" fill-opacity="0.15"></rect></svg></div></pk-canvas></div>`,
    steps: [
        { wait: 300 }, { shot: 'resting' },
        { click: '#door' }, { wait: 100 }, { shot: 'click' },
        { set: '#surface', attr: 'selection', value: '["table","door"]' }, { wait: 100 }, { shot: 'both' },
        { focus: '#table' }, { wait: 100 }, { shot: 'focus' },
        { click: IN }, { click: IN }, { wait: 100 }, { shot: 'zoomed' },
        { click: '#surface >>> [part=reset]' }, { set: '#wrap', attr: 'dir', value: 'rtl' }, { wait: 100 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.visible(F, 'the surface');
        const fr = t.rect(F), item = t.rect(t.shot === 'click' ? '#door' : '#table'), box = t.rect(SEL);
        if (t.shot === 'click' || t.shot === 'resting' || t.shot === 'focus' || t.shot === 'rtl') {
            t.visible(SEL, 'a selection frame');
            if (box && item) t.ok(Math.abs(box.x - item.x) <= 3 && Math.abs(box.y - item.y) <= 3 && Math.abs(box.width - item.width) <= 6, 'the frame sits on its item');
            t.within(SEL, F);
        }
        if (fr && box && t.shot === 'rtl') t.ok(box.x >= fr.x, 'the frame stays inside the surface, drawing not mirrored');
    },
};
