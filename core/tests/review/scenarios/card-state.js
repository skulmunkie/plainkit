// pk-card state machine (issue 486): ready, loading, empty and error each keep the heading row and swap only the body region.
export default {
    name: 'card-state',
    issue: [486],
    elements: ['card', 'skeleton', 'empty-state', 'alert', 'button'],
    html: `<div id="stage" class="u-p-1r-1p25r">
<pk-card id="c-ready" heading="Ready"><p>The slotted body.</p></pk-card>
<pk-card id="c-loading" heading="Loading" state="loading" state-heading="Loading revenue"><p>Hidden body.</p></pk-card>
<pk-card id="c-empty" heading="Empty" state="empty" state-heading="No orders yet" state-description="Orders appear here once a customer checks out."><p>Hidden body.</p></pk-card>
<pk-card id="c-error" heading="Error" state="error" state-heading="Could not load revenue" state-description="The request timed out."><p>Hidden body.</p></pk-card>
</div>`,
    steps: [{ wait: 300 }, { shot: 'states' }],
    expect(t) {
        for (const id of ['c-ready', 'c-loading', 'c-empty', 'c-error']) {
            t.visible(`#${id} >>> [part=title]`, `${id} heading`);
            t.within(`#${id}`, '#stage', 1);
        }
        t.visible('#c-ready p', 'the ready body');
        t.visible('#c-loading >>> [part=state]', 'the loading state');
        t.visible('#c-empty >>> [part=state]', 'the empty state');
        t.visible('#c-error >>> [part=state]', 'the error state');
        for (const id of ['c-loading', 'c-empty', 'c-error']) {
            t.ok(t.style(`#${id} >>> [part=body]`, 'display') === 'none', `${id}: the body is still shown beside the state`);
        }
    },
};
