// pk-grid tracks with col-span and row-span (#1666): a 12-column dashboard at desktop width, and on a phone where the tracks fall back to auto columns and the spans stop
// applying, so the widgets stack in one column instead of spilling into implicit columns. Uneven tracks keep wide content from blowing a track out.
const LONG = 'a_very_long_unbreakable_widget_title_that_would_widen_a_plain_1fr_track_0123456789';
export default {
    name: 'grid-spans',
    issue: [1666],
    elements: ['grid'],
    html: `<div id="stage"><pk-grid id="dash" tracks="repeat(12, minmax(0, 1fr))">
<pk-card id="a" heading="Revenue" data-col-span="8" data-row-span="2">Wide, two rows</pk-card>
<pk-card id="b" heading="Users" data-col-span="4">Narrow</pk-card>
<pk-card id="c" heading="Orders" data-col-span="4">Narrow</pk-card>
<pk-card id="d" heading="Activity" data-col-span="12">Full width</pk-card>
</pk-grid>
<pk-grid id="uneven" tracks="minmax(0, 1.5fr) minmax(0, 1fr)">
<pk-card id="u1" heading="${LONG}">Main</pk-card>
<pk-card id="u2" heading="Side">Side</pk-card>
</pk-grid></div>`,
    steps: [{ wait: 'settle' }, { shot: 'resting' }],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        for (const id of ['a', 'b', 'c', 'd', 'u1', 'u2']) t.within(`#${id}`, '#stage');
        t.noOverlap('#a', '#b'); t.noOverlap('#b', '#c'); t.noOverlap('#u1', '#u2');
        if (t.viewport.name === 'desktop') t.sameRow('#u1', '#u2');
        else for (const id of ['a', 'b', 'c', 'd']) t.centredIn('#' + id, '#stage');
    },
};
