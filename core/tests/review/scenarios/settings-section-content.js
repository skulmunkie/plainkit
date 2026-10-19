// A section's own content (issue 1604): the slotted block sits inside its section's card after the fields, in the section nav and above the save bar.
export default {
    name: 'settings-section-content',
    issue: [1604],
    elements: ['settings-page', 'tool-page'],
    html: `<pk-settings-page><div slot="section-api" id="mine"><pk-alert>A secret is stored.</pk-alert></div></pk-settings-page>`,
    setup(frame) {
        frame.querySelector('pk-settings-page').config = { sections: [{ key: 'general', heading: 'General', fields: [{ key: 'name', type: 'text', label: 'Name' }] }, { key: 'api', heading: 'API', fields: [{ key: 'url', type: 'text', label: 'URL' }] }, { key: 'misc', heading: 'Misc', fields: [{ key: 'x', type: 'text', label: 'X' }] }] };
    },
    steps: [{ wait: 'settle' }, { shot: 'resting' }, { focus: 'pk-settings-page >>> pk-input' }, { type: 'Acme' }, { wait: 300 }, { shot: 'dirty' }],
    expect(t) {
        if (t.viewport.name === 'phone') return; // a phone shows one section at a time as tabs: the other cards are not drawn
        if (!t.rect('#mine')) return t.ok(false, 'the slotted section content renders');
        t.within('#mine', 'pk-settings-page >>> pk-card[data-pk-section="api"]');
    },
};
