// pk-grid dashboard (#1718, #1722): 12 tracks on desktop, 6 at tablet width (spans halve), stacked on a phone; data-show-above / data-hide-above swap a desktop and a compact block.
export default {
    name: 'grid-breakpoints',
    issue: [1718, 1722],
    elements: ['grid'],
    viewports: ['desktop'],
    html: `<div class="u-p-1r-1p25r"><pk-grid id="g" tracks="repeat(12, minmax(0, 1fr))" tablet-tracks="repeat(6, minmax(0, 1fr))">
<pk-card id="a" heading="Revenue" data-col-span="6">Six of twelve</pk-card><pk-card id="b" heading="Users" data-col-span="6">Six of twelve</pk-card>
<pk-card id="c" heading="Orders" data-col-span="4">Four</pk-card><pk-card id="d" heading="Refunds" data-col-span="4">Four</pk-card><pk-card id="e" heading="Churn" data-col-span="4">Four</pk-card>
<pk-card id="f" heading="Activity" data-col-span="12">Full width</pk-card></pk-grid>
<p id="wide" data-show-above="tablet">Desktop layout</p><p id="compact" data-hide-above="tablet">Compact layout</p></div>`,
    steps: [{ shot: 'desktop' }, { resize: 1024 }, { shot: 'tablet' }, { resize: 768 }, { shot: 'narrow-tablet' }, { resize: 375 }, { shot: 'phone' }],
    expect(t) {
        const w = { desktop: 1280, tablet: 1024, 'narrow-tablet': 768, phone: 375 }[t.shot];
        t.within('#f', '#g');
        if (w > 1024) { t.sameRow('#a', '#b'); t.sameRow('#c', '#e'); t.shown('#wide') && t.hidden('#compact'); }
        else if (w > 640) { t.sameRow('#a', '#b'); t.sameRow('#c', '#d'); t.noOverlap('#c', '#e'); t.hidden('#wide'); t.visible('#compact'); }
        else { t.flushBelow('#b', '#a', 400); t.fitsWidth('#g'); t.hidden('#wide'); t.visible('#compact'); }
    },
};
