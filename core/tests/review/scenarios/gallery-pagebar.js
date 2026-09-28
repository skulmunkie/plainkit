// The gallery's page-preview bar (#498): its Back and Open links are pk-button variant="ghost" with an href, in a bar that raises the control height
// to the touch target. Checks the link buttons keep a 44px target on a phone, do not overlap, and show a focus ring.
export default {
    name: 'gallery-pagebar',
    issue: [498],
    elements: ['button'],
    html: `<div class="u-cluster">
<pk-button variant="ghost" id="back" href="#/samples" icon-name="chevron-left" label="Back to Layouts"><span>Back</span></pk-button>
<strong>App shell</strong>
<pk-button variant="ghost" id="open" href="#/samples" target="_blank" rel="noopener"><span>Open in new page</span></pk-button>
</div>`,
    steps: [{ shot: 'rest' }, { focus: '#back >>> [part=control]' }, { shot: 'back-focus' }, { focus: '#open >>> [part=control]' }, { shot: 'open-focus' }],
    expect(t) {
        t.visible('#back'); t.visible('#open');
        t.noOverlap('#back', '#open');
        if (t.viewport.name === 'phone') { t.atLeast('#back', 'height', 44); t.atLeast('#open', 'height', 44); }
        if (t.shot === 'back-focus') t.ringVisible('#back >>> [part=control]');
        if (t.shot === 'open-focus') t.ringVisible('#open >>> [part=control]');
    },
};
