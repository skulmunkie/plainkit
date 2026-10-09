// pk-record-form (issue 801): the page layout of a record around the consumer's own form. The toolbar with Cancel, an action and Delete, the tabs, the sidebar beside the form (below it on a
// phone), a stopped Save with pk-form's summary, the error alert, the busy and disabled Save, the toolbar left out for a page header, and right-to-left. Each state fits the width at desktop
// and phone, in both themes, with nothing overlapping or clipped.
export default {
    name: 'record-form',
    issue: [801],
    elements: ['record-form', 'form', 'field', 'input', 'button', 'tabs', 'card', 'badge'],
    html: `<div id="stage"><pk-record-form id="rf" cancellable deletable>
<pk-button slot="actions" variant="ghost">Duplicate</pk-button>
<pk-tabs slot="tabs" value="details" label="Record"><pk-tab value="details">Details</pk-tab><pk-tab value="history">History</pk-tab></pk-tabs>
<form id="form"><pk-card heading="Customer"><pk-stack>
<pk-field label="Name" required><pk-input name="name" required data-msg-required="Enter a name."></pk-input></pk-field>
<pk-field label="Email"><pk-input name="email" type="email" value="ada@example.com"></pk-input></pk-field>
<pk-field label="Notes"><pk-textarea name="notes"></pk-textarea></pk-field>
</pk-stack></pk-card></form>
<pk-card slot="sidebar" heading="Status"><pk-badge variant="success">Active</pk-badge></pk-card>
<pk-card slot="sidebar" heading="Flags"><pk-badge>Wholesale</pk-badge></pk-card>
</pk-record-form></div>`,
    setup(frame) { frame.querySelector('#form').addEventListener('submit', e => e.preventDefault()); },
    steps: [
        { wait: 700 }, { shot: 'resting' },
        { click: '#rf >>> [part=save]' }, { wait: 600 }, { shot: 'stopped' },
        { set: '#rf', attr: 'error', value: 'The record could not be saved. Try again.' }, { wait: 300 }, { shot: 'error' },
        { set: '#rf', attr: 'busy', value: '' }, { wait: 300 }, { shot: 'busy' },
        { set: '#rf', attr: 'actions-in-header', value: '' }, { wait: 300 }, { shot: 'header' },
        { set: '#stage', attr: 'dir', value: 'rtl' }, { wait: 300 }, { shot: 'rtl' },
    ],
    expect(t) {
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        t.visible('#rf >>> [part=form]', 'the form');
        t.inViewport('#rf >>> [part=form]');
        if (t.shot === 'resting' || t.shot === 'busy') { t.inViewport('#rf >>> [part=save]'); t.inViewport('#rf >>> [part=delete]'); }
        if (t.shot === 'stopped') { t.visible('#rf >>> [part=form] >>> [part=summary]', 'the summary'); t.inViewport('#rf >>> [part=form] >>> [part=summary]'); }
    },
};
