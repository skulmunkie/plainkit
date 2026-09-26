// pk-dialog open (the modal in the top layer; there is no element called modal, issue 335): centred with the backdrop over the page on a desktop, full height on a
// phone, header and footer that stay put while a long body scrolls inside, a close button of touch size with a visible, unclipped focus ring.
const D = '#dlg >>> [part=dialog]';
const BODY = '#dlg >>> [part=body]';
const HEAD = '#dlg >>> [part=header]';
const FOOT = '#dlg >>> [part=footer]';
const CLOSE = '#dlg >>> [part=close]';
const PARAS = Array.from({ length: 40 }, (_, i) => `<p>Line ${i + 1}: the customer asked for a gift receipt and two separate boxes, delivered before the end of the month.</p>`).join('');

export default {
    name: 'dialog',
    issue: [335],
    elements: ['dialog'],
    html: `<div class="u-p-1r-1p25r">
<pk-button id="open" data-open="#dlg" variant="secondary">Review order</pk-button>
<p>Page text behind the dialog.</p>
<pk-dialog id="dlg" heading="Review order 1042 before it ships to the customer" scrollable>${PARAS}<pk-button slot="footer" variant="ghost">Cancel</pk-button><pk-button slot="footer" variant="primary">Ship order</pk-button></pk-dialog>
</div>`,
    steps: [
        { shot: 'closed' },
        { click: '#open' }, { wait: 400 }, { shot: 'open' },
        { focus: '#dlg >>> [part=close]' }, { shot: 'close-focus' },
        { scroll: '#dlg >>> [part=body]', to: 2000 }, { wait: 200 }, { shot: 'scrolled' },
    ],
    expect(t) {
        if (t.shot === 'closed') { t.hidden(D, 'the dialog while closed'); return; }
        t.visible(D, 'the open dialog');
        t.inViewport(D);
        t.within(HEAD, D); t.within(BODY, D); t.within(FOOT, D);
        t.noOverlap(HEAD, BODY); t.noOverlap(BODY, FOOT);
        t.visible(CLOSE, 'the close button'); t.within(CLOSE, HEAD); t.atLeast(CLOSE, 'height', 36); t.atLeast(CLOSE, 'width', 36);
        t.scrolls(BODY);
        const d = t.rect(D);
        const v = t.viewport;
        if (d && v.name === 'desktop') {
            t.ok(Math.abs((d.x + d.width / 2) - v.width / 2) <= 2, `the dialog is centred at x=${Math.round(d.x + d.width / 2)}, expected ${v.width / 2}`);
            t.ok(Math.abs((d.y + d.height / 2) - v.height / 2) <= 2, `the dialog is centred at y=${Math.round(d.y + d.height / 2)}, expected ${v.height / 2}`);
            t.ok(d.width <= 560 + 1, `the dialog is ${Math.round(d.width)}px wide, expected at most the default 35rem`);
        }
        if (d && v.name === 'phone') t.ok(d.width >= v.width - 1 && d.height >= v.height - 1, `on a phone the dialog is ${Math.round(d.width)}x${Math.round(d.height)}, expected the full screen ${v.width}x${v.height}`);
        t.visible('#dlg > pk-button:nth-of-type(2)', 'the primary footer button');
        t.within('#dlg > pk-button:nth-of-type(1)', FOOT); t.within('#dlg > pk-button:nth-of-type(2)', FOOT);
        if (t.shot === 'close-focus') { t.ringVisible(CLOSE); t.ringUnclipped(CLOSE); }
        if (t.shot === 'scrolled') {
            t.ok(t.metric(BODY, 'scrollTop') > 0, 'the dialog body did not scroll');
            t.visible(HEAD, 'the header stays while the body scrolls'); t.visible(FOOT, 'the footer stays while the body scrolls');
            t.inViewport(FOOT);
        }
    },
};
