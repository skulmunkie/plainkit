// --font-heading (issue 1817): with the token set to a serif stack the heading, the page-header title and the card title change face, body text keeps its own, and nothing overflows.
export default {
    name: 'heading-font',
    issue: [1817],
    elements: ['heading', 'card', 'page-header', 'empty-state', 'form-section'],
    html: '<pk-heading id="hd" level="2">A heading in the title font</pk-heading>'
        + '<pk-page-header id="ph" heading="Page header title in the title font" level="1"></pk-page-header>'
        + '<pk-empty-state id="es" heading="Empty state title"></pk-empty-state>'
        + '<pk-form-section id="fs" heading="Form section title"></pk-form-section>'
        + '<pk-card id="cd" heading="Card title in the title font"><p id="body">Body text keeps the body font.</p></pk-card>',
    setup(frame) { frame.ownerDocument.documentElement.style.setProperty('--font-heading', 'Georgia, serif'); },
    steps: [{ wait: 'settle' }, { shot: 'serif' }],
    expect(t) {
        const serif = s => /georgia/i.test(s);
        t.ok(serif(t.style('#hd >>> [part="heading"]', 'font-family')), 'pk-heading uses --font-heading');
        t.ok(serif(t.style('#ph >>> [part="title"]', 'font-family')), 'the page-header title uses --font-heading');
        t.ok(serif(t.style('#cd >>> [part="title"]', 'font-family')), 'the card title uses --font-heading');
        t.ok(serif(t.style('#es >>> [part="heading"]', 'font-family')), 'the empty-state title uses --font-heading');
        t.ok(serif(t.style('#fs >>> [part="title"]', 'font-family')), 'the form-section title uses --font-heading');
        t.ok(!serif(t.style('#body', 'font-family')), 'body text keeps the body font');
        for (const id of ['#hd', '#ph', '#cd']) t.fitsWidth(id);
    },
};
