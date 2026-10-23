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
        if (d && v.name === 'phone') t.ok(d.x <= 0.5 && d.width >= v.width - 0.5, `on a phone the dialog is ${Math.round(d.width)}px wide at x=${Math.round(d.x)}, expected the full screen ${v.width} at x=0 (max-width applies from the tablet up, #1756)`);
        const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(n => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = t.style(D, 'background-color');
        t.ok(t.theme === 'dark' ? lum(bg) < 0.1 : lum(bg) > 0.8, `the archived tint is ${bg} in the ${t.theme} theme: expected a ${t.theme === 'dark' ? 'dark' : 'pale'} card`);
    },
};
