// pk-accordion-item with the actions slot (issue 296): the header controls sit inside the chevron, never over the heading or the chevron, left to right
// and (dir="rtl") right to left, including a heading long enough to wrap and on a phone.
const HEAD = '#a1 >>> [part=heading]';
const ACT = '#a1 >>> [part=actions]';
const CHEV = '#a1 >>> [part=chevron]';
const SUMMARY = '#a1 >>> [part=summary]';
const PHONE_ISSUE = 323; // filed defect (t.known: a warning); change to t.ok when fixed

export default {
    name: 'accordion-item',
    issue: [296],
    elements: ['accordion-item', 'accordion'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-accordion>
<pk-accordion-item id="a1" heading="Shipping and returns policy for orders placed over the phone or in a store" open>
<pk-button slot="actions" id="edit" size="mini" variant="ghost">Edit</pk-button>
<pk-badge slot="actions" variant="ok">3 rules</pk-badge>
<p>Orders ship within two working days. Returns are accepted for 30 days.</p>
</pk-accordion-item>
<pk-accordion-item id="a2" heading="Payment"><pk-button slot="actions" size="mini" variant="ghost">Edit</pk-button><p>Card and invoice.</p></pk-accordion-item>
</pk-accordion>
</div>`,
    steps: [
        { shot: 'ltr' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 200 }, { shot: 'rtl' },
    ],
    expect(t) {
        const rtl = t.shot === 'rtl';
        t.visible(ACT, 'the actions'); t.visible(HEAD, 'the heading'); t.visible(CHEV, 'the chevron');
        t.noOverlap(ACT, CHEV);
        t.within(ACT, SUMMARY, 1);
        t.inViewport('#edit');
        const act = t.rect(ACT), chev = t.rect(CHEV), head = t.rect(HEAD);
        // The actions sit at the far end (right in LTR, left in RTL), just inside the chevron, which is at the very end.
        if (act && chev) t.ok(rtl ? act.x >= chev.right - 1 : act.right <= chev.x + 1, `the actions (x ${Math.round(act.x)} to ${Math.round(act.right)}) are not on the ${rtl ? 'left' : 'right'} side of the chevron (x ${Math.round(chev.x)} to ${Math.round(chev.right)})`);
        // The heading reserves room for the actions with padding at its far end: its text (the content box) must stop before them.
        if (act && head) {
            const pad = parseFloat(t.style(HEAD, rtl ? 'padding-left' : 'padding-right')) || 0;
            const text = rtl ? { from: head.x + pad } : { to: head.right - pad };
            t.ok(rtl ? text.from >= act.right - 1 : text.to <= act.x + 1, `the heading text runs under the actions (heading ${Math.round(head.x)} to ${Math.round(head.right)} with ${Math.round(pad)}px reserved, actions ${Math.round(act.x)} to ${Math.round(act.right)})`);
        }
        t.sameRow(ACT, HEAD, 60);
        if (t.viewport.name === 'phone') {
            const edit = t.rect('#edit'), card = t.rect('#a1'), c = t.rect(CHEV);
            if (edit && card) t.known(PHONE_ISSUE, edit.y - card.y >= 3, `on a phone the touch-sized Edit button starts ${Math.round(edit.y - card.y)}px from the card's top border and fills the header row edge to edge`);
            if (edit && c) t.known(PHONE_ISSUE, Math.abs(edit.cy - c.cy) <= 6, `with a wrapped heading the actions (centre y=${Math.round(edit.cy)}) and the chevron (centre y=${Math.round(c.cy)}) are on different lines of the header`);
        }
    },
};
