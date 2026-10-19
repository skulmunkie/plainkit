// pk-page-header actions-overflow="phone" (issue 1602): on a phone the slotted actions collapse into one overflow button in the title bar and a menu lists them;
// on desktop they stay inline and the overflow button is not drawn.
const TRIGGER = '#ph >>> [part="overflow-button"]', OVERFLOW = '#ph >>> [part="overflow"]';
export default {
    name: 'page-header-actions-overflow',
    issue: [1602],
    elements: ['page-header'],
    html: `<pk-page-header id="ph" variant="record" sticky actions-overflow="phone"><pk-breadcrumb slot="breadcrumb"><a href="#">Products</a><span aria-current="page" role="heading" aria-level="1">Blue mug</span></pk-breadcrumb><pk-badge variant="ok">Active</pk-badge><pk-button slot="actions" size="mini" icon-name="save">Save</pk-button><pk-button slot="actions" size="mini" variant="ghost" icon-name="document">Print</pk-button><pk-button slot="actions" size="mini" variant="ghost" icon-name="trash">Delete</pk-button></pk-page-header>`,
    steps: [{ shot: 'rest' }, { click: TRIGGER, on: ['phone'] }, { wait: 300 }, { shot: 'open' }],
    expect(t) {
        if (t.viewport.name === 'phone') {
            t.visible(TRIGGER, 'the overflow button');
            t.hidden('#ph pk-button:nth-of-type(1)', 'an inline action');
            t.atLeast(TRIGGER, 'height', 44);
            t.inViewport(TRIGGER);
            t.sameRow(TRIGGER, '#ph >>> [part="crumbs"]', 8);
        } else {
            t.hidden(OVERFLOW, 'the overflow dropdown');
            t.visible('#ph pk-button:nth-of-type(1)', 'an inline action');
        }
    },
};
