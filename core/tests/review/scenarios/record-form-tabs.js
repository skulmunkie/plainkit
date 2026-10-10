// pk-record-form tabs-from (#342): sections tagged tab="key" show one tab at a time on a phone (the strip visible, the other tab's section hidden until it is chosen) and all at once on
// desktop (two columns, the strip hidden), with no per-page CSS.
export default {
    name: 'record-form-tabs',
    issue: [342],
    elements: ['record-form', 'form', 'field', 'input', 'tabs', 'card', 'badge'],
    html: `<div id="stage"><pk-record-form id="rf" tab-param="tab">
<pk-tabs slot="tabs" value="details" label="Record"><pk-tab value="details">Details</pk-tab><pk-tab value="pricing">Pricing</pk-tab></pk-tabs>
<form id="form"><pk-stack>
<pk-card id="details" tab="details" heading="Details"><pk-field label="Name"><pk-input name="name"></pk-input></pk-field></pk-card>
<pk-card id="pricing" tab="pricing" heading="Pricing"><pk-field label="Price"><pk-input name="price"></pk-input></pk-field></pk-card>
</pk-stack></form>
<pk-card id="status" slot="sidebar" tab="details" heading="Status"><pk-badge variant="success">Active</pk-badge></pk-card>
</pk-record-form></div>`,
    setup(frame) { frame.querySelector('#form').addEventListener('submit', e => e.preventDefault()); },
    steps: [
        { wait: 700 }, { shot: 'resting' },
        { click: 'pk-tab[value=pricing]', on: ['phone'] }, { wait: 400 }, { shot: 'pricing', on: ['phone'] },
    ],
    expect(t) {
        const phone = t.viewport.name === 'phone';
        const hidden = sel => t.attr(sel, 'hidden') !== null && t.attr(sel, 'hidden') !== undefined;
        t.ok(t.metric('html', 'scrollWidth') <= t.metric('html', 'clientWidth') + 1, 'the page scrolls sideways');
        if (!phone) {
            for (const id of ['details', 'pricing', 'status']) t.ok(!hidden(`#${id}`), `desktop shows the ${id} section`);
            t.ok(hidden('#rf >>> [part=tabs]'), 'the tab strip is hidden on desktop', 'pk-record-form hides the tabs row above tabs-from');
        } else if (t.shot === 'resting') {
            t.visible('pk-tabs', 'the tab strip on a phone');
            t.visible('#details', 'the first tab\'s section'); t.visible('#status', 'the first tab\'s sidebar card');
            t.ok(hidden('#pricing'), 'the Pricing section is hidden until its tab is chosen');
        } else if (t.shot === 'pricing') {
            t.visible('#pricing', 'the Pricing section after choosing its tab');
            t.ok(t.attr('#rf', 'tab-param') === 'tab', 'tab-param is set while the chosen tab is kept in the address bar'); t.ok(hidden('#details') && hidden('#status'), 'the Details sections are hidden once Pricing is chosen');
        }
    },
};
