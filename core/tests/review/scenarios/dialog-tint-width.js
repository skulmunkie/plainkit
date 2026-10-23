// pk-dialog tint and max-width, the two options a dialog opened through the dialogs service (confirm, prompt, open) can now carry (issue 1715): an archived tint and a per-dialog width.
const D = '#dlg >>> [part=dialog]';
export default {
    name: 'dialog-tint-width',
    issue: [1715],
    elements: ['dialog'],
    html: `<div class="u-p-1r-1p25r"><pk-button id="open" data-open="#dlg" variant="secondary">Archive order</pk-button><pk-dialog id="dlg" heading="Archive order 1042?" tint="archived" max-width="420"><p>The order leaves the active list.</p><pk-button slot="footer" variant="ghost">Cancel</pk-button><pk-button slot="footer" variant="danger">Archive</pk-button></pk-dialog></div>`,
    steps: [{ click: '#open' }, { shot: 'open' }],
    expect(t) {
        t.visible(D, 'the open dialog');
        t.inViewport(D);
        const d = t.rect(D), v = t.viewport;
        if (d && v.name === 'desktop') t.ok(Math.abs(d.width - 420) <= 2, `the dialog is ${Math.round(d.width)}px wide, expected its max-width 420`);
        if (d && v.name === 'phone') t.ok(d.width <= v.width && d.width >= v.width - 40, `on a phone the dialog is ${Math.round(d.width)}px wide, expected the viewport clamp (about ${v.width - 32})`);
    },
};
