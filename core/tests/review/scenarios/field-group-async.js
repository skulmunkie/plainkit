// pk-field-group commit callback (issue 264): the states a still example cannot show. A field waiting for the host's answer (busy: aria-busy and a spinner beside the label), then
// the same field after a newer edit was refused (the message in the field, the typed text kept, no spinner). Each state fits at desktop and phone, in both themes.
export default {
    name: 'field-group-async',
    issue: [264],
    elements: ['field-group', 'field', 'input', 'spinner'],
    html: '<div id="stage"><pk-card heading="Artist"><pk-field-group id="g" label="Artist"></pk-field-group></pk-card></div>',
    setup(frame) {
        const g = frame.querySelector('#g');
        // Never answers until the text ends with "!", which the host refuses.
        g.commit = ({ value }) => (String(value).endsWith('!') ? Promise.reject(new Error('That slug is already taken.')) : new Promise(() => {}));
        g.fields = [{ key: 'slug', label: 'Slug', hint: 'Used in the address.' }, { key: 'name', label: 'Name' }];
        g.values = { slug: 'acme', name: 'Acme Hardware' };
    },
    steps: [
        { wait: 600 }, { shot: 'resting' },
        { click: '#g >>> pk-input >>> [part=control]' }, { type: '-2' }, { key: 'Enter' }, { wait: 300 }, { shot: 'busy' },
        { type: '!' }, { key: 'Enter' }, { wait: 300 }, { shot: 'error' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#g', 'the field group');
        t.inViewport('#g');
        t.within('#g >>> pk-field', '#g');
    },
};
