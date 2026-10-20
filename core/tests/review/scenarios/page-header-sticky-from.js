// pk-page-header sticky-from="phone" (issue 1679): above a phone the header stays pinned under the app bar while the body scrolls; on a phone it releases to normal
// flow and scrolls away, so a focused field has room above the on-screen keyboard.
const paragraphs = n => Array.from({ length: n }, (_, i) => `<p>Line ${i + 1}. The body of the shell is the only scroller.</p>`).join('');
const BODY = 'pk-app-shell >>> [part=body]';
const HEADER = '#ph';

export default {
    name: 'page-header-sticky-from',
    issue: [1679],
    elements: ['page-header'],
    html: `<pk-app-shell>
<div id="content"><pk-page-header id="ph" variant="record" sticky sticky-from="phone" heading="Blue mug"><pk-badge variant="ok">Active</pk-badge><pk-button slot="actions" size="mini" icon-name="save">Save</pk-button></pk-page-header>
<pk-stack>${paragraphs(40)}</pk-stack></div>
</pk-app-shell>`,
    steps: [{ shot: 'rest' }, { scroll: BODY, to: 600 }, { wait: 150 }, { shot: 'scrolled' }],
    expect(t) {
        const body = t.rect(BODY), head = t.rect(HEADER);
        if (t.metric(BODY, 'scrollTop') < 100) return; // the resting shot: nothing has scrolled yet
        if (t.viewport.name === 'phone') t.ok(head.y + head.height <= body.y + 1, 'on a phone the header scrolled away with the content (normal flow)');
        else t.ok(Math.abs(head.y - body.y) <= 2, 'above a phone the header stays pinned at the top of the body');
    },
};
