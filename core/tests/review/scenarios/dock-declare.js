// pk-dock panel declarations (#432 phase D1): data-open="false" starts Palette closed (the toolbar's Panels menu offers it), data-float starts Notes floating,
// data-closable="false" and data-collapsible="false" keep Properties permanent, and the panel with data-group="center" is the centre: it is the tab the phone strip starts on.
export default {
    name: 'dock-declare',
    issue: [432],
    elements: ['dock', 'splitter', 'tabs', 'tab', 'tab-panel'],
    html: `<div class="rv-bounded"><pk-dock id="d" label="Declared workspace" fill>
<div slot="palette" data-heading="Palette" data-group="left" data-open="false">Palette</div>
<div slot="canvas" data-heading="Canvas" data-group="center">Canvas, the centre</div>
<div slot="props" data-heading="Properties" data-group="right" data-closable="false" data-collapsible="false">Properties</div>
<div slot="notes" data-heading="Notes" data-group="right" data-float>Notes float from the start</div>
</pk-dock></div>`,
    steps: [{ shot: 'rest' }],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        t.ok(t.text('#d').includes('Canvas'), 'the centre panel is shown');
        if (phone) {
            t.ok(t.rect('#d [slot=canvas]').width > 100, 'the phone strip starts on the centre panel (Canvas), not the first declared one');
        } else {
            t.within('#d [slot=canvas]', '#d');
            t.ok(t.rect('#d [slot=notes]').width > 50, 'Notes float from the start and are drawn');
        }
    },
};
