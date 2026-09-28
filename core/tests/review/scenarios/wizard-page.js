// pk-wizard-page (#353): step one blocked by validation, step two, the review step, then a submit that fails with a server error on a field of step one.
// validate and submit are callback properties, wired in setup(), so every state is the real one.
const WP = 'pk-wizard-page';
const P = `${WP} >>> `;

export default {
    name: 'wizard-page',
    elements: ['wizard-page', 'stepper', 'step', 'card', 'form', 'field', 'input', 'select', 'field-list', 'button'],
    html: '<pk-wizard-page></pk-wizard-page>',
    setup(frame) {
        // Unsent answers arm the page's beforeunload guard, which would hold the harness's reload for the next theme: swallow the event first.
        frame.ownerDocument.defaultView.addEventListener('beforeunload', e => e.stopImmediatePropagation(), true);
        const el = frame.querySelector(WP);
        el.validate = async (id, v) => (id === 'plan' && v.seats > 50 ? { errors: { seats: 'The Team plan has at most 50 seats.' } } : undefined);
        el.submit = () => Promise.reject(Object.assign(new Error('not saved'), { errors: { email: 'That email is already registered.' } }));
        el.config = {
            review: true, submitLabel: 'Create account',
            steps: [
                { id: 'account', label: 'Account', description: 'Who you are', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name', required: true }] },
                { id: 'plan', label: 'Plan', description: 'What you get', fields: [{ name: 'plan', label: 'Plan', type: 'select', options: ['Free', 'Team'] }, { name: 'seats', label: 'Seats', type: 'number' }] },
            ],
        };
    },
    steps: [
        { wait: 400 }, { click: `${P}[part=next]` }, { wait: 300 }, { shot: 'blocked' },
        { click: `${P}pk-input[name=email]` }, { type: 'sam@example.com' },
        { click: `${P}pk-input[name=name]` }, { type: 'Sam' },
        { click: `${P}[part=next]` }, { wait: 400 }, { shot: 'step-two' },
        { click: `${P}[part=next]` }, { wait: 400 }, { shot: 'review' },
        { click: `${P}[part=next]` }, { wait: 500 }, { shot: 'server-error' },
    ],
    expect(t) {
        t.inViewport(WP);
        if (t.shot === 'blocked') t.hasText(`${P}[part=heading]`, 'Account');
        if (t.shot === 'step-two') t.hasText(`${P}[part=heading]`, 'Plan');
        if (t.shot === 'review') { t.hasText(`${P}[part=heading]`, 'Review'); t.hasText(`${P}[part=next]`, 'Create account'); }
        if (t.shot === 'server-error') { t.hasText(`${P}[part=heading]`, 'Account'); t.visible(`${P}pk-field[error]`, 'the field carrying the server error'); }
    },
};
