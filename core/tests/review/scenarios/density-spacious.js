// data-density="spacious" (#1818): a card and a form open one step looser than the default, without overflow at desktop or phone width.
export default {
    name: 'density-spacious',
    issue: [1818],
    elements: ['card', 'field', 'input', 'button'],
    html: `<div data-density="spacious">
<pk-stack>
<pk-card heading="Account"><pk-stack><pk-field label="Name"><pk-input value="Chandra Supply"></pk-input></pk-field><pk-field label="Email"><pk-input type="email" value="orders@example.com"></pk-input></pk-field><pk-cluster><pk-button>Save</pk-button><pk-button variant="ghost">Cancel</pk-button></pk-cluster></pk-stack></pk-card>
<pk-card heading="Notes">Spacious spacing roles.</pk-card>
</pk-stack></div>`,
    steps: [{ wait: 100 }, { shot: 'spacious' }],
    expect(t) {
        t.inViewport('pk-card');
    },
};
