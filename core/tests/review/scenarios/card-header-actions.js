// pk-card header (issue 1727): a heading with a badge and a button in the actions slot keeps a readable column on a phone; the actions wrap below it.
export default {
    name: 'card-header-actions',
    issue: [1727],
    elements: ['card'],
    html: '<div id="stage"><pk-card id="c" heading="A reasonably long heading"><pk-badge slot="actions">Draft</pk-badge><pk-button slot="actions" size="sm">Publish now</pk-button>Card body text.</pk-card></div>',
    steps: [{ wait: 400 }, { shot: 'resting' }],
    expect(t) {
        t.visible('#c', 'the card');
        t.within('#c >>> [part="header"]', '#c');
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
    },
};
