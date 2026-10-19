// A bare section (issue 1633): no wrapping card or heading, so the app's own two cards are the only cards in it; the nav item and the save bar still cover it.
export default {
    name: 'settings-bare-section',
    issue: [1633],
    elements: ['settings-page'],
    html: `<pk-settings-page><span slot="section-alerts" class="u-contents"><pk-card id="one" heading="Email"><p>Weekly digest.</p></pk-card><pk-card id="two" heading="Push"><p>Mentions only.</p></pk-card></span></pk-settings-page>`,
    setup(frame) {
        frame.querySelector('pk-settings-page').config = { sections: [{ key: 'general', heading: 'General', fields: [{ key: 'name', type: 'text', label: 'Name' }] }, { key: 'alerts', heading: 'Alerts', bare: true, fields: [] }, { key: 'misc', heading: 'Misc', fields: [{ key: 'x', type: 'text', label: 'X' }] }] };
    },
    steps: [{ wait: 'settle' }, { shot: 'resting' }, { focus: 'pk-settings-page >>> pk-input' }, { type: 'Acme' }, { wait: 300 }, { shot: 'dirty' }],
    expect(t) {
        if (t.viewport.name === 'phone') return; // a phone shows one section at a time as tabs
        if (!t.rect('#one') || !t.rect('#two')) return t.ok(false, 'the app cards render');
        t.within('#one', 'pk-settings-page >>> pk-stack[data-pk-section="alerts"]');
        t.noOverlap('#one', '#two');
    },
};
